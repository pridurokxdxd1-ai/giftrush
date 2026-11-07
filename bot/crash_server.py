"""Общий сервер игры «Краш»: все игроки видят одни и те же раунды и множители."""
import asyncio
import hashlib
import hmac
import json
import logging
import math
import random
import secrets
import time
from urllib.parse import parse_qsl

from aiohttp import WSMsgType, web

log = logging.getLogger("crash")

K = 0.1425            # скорость роста множителя: m = exp(K * секунды)
WAIT_MS = 6000        # окно для ставок
CRASH_SHOW_MS = 3500  # пауза после падения
MAX_CLIENTS = 500
MAX_BET = 1_000_000_000


def now_ms() -> int:
    return int(time.time() * 1000)


def gen_crash() -> float:
    r = random.random()
    return max(1.0, round(0.95 / (1 - r * 0.99), 2))


def mult_at(elapsed_ms: float) -> float:
    return math.floor(math.exp(K * elapsed_ms / 1000) * 100) / 100


class CrashGame:
    def __init__(self, token: str):
        self.token = token
        self.clients = {}  # ws -> игрок
        self.round = 0
        self.phase = "wait"
        self.until = 0
        self.t0 = 0
        self.crash_at = 1.0
        self.crash_ms = 0.0
        self.bets = {}  # uid -> {name, photo, amount, mult}
        self.history = [1.24, 3.8, 1.05, 2.1, 1.77]

    # ---------- авторизация через Telegram initData ----------
    def _auth(self, init_data: str) -> dict:
        user = None
        try:
            pairs = dict(parse_qsl(init_data, keep_blank_values=True))
            got = pairs.pop("hash", "")
            check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
            secret = hmac.new(b"WebAppData", self.token.encode(), hashlib.sha256).digest()
            calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
            if got and hmac.compare_digest(calc, got):
                user = json.loads(pairs.get("user", "null"))
        except Exception:
            user = None
        if not user or "id" not in user:
            return {"uid": "g" + secrets.token_hex(4), "name": "Гость", "photo": ""}
        name = ("@" + user["username"]) if user.get("username") else (user.get("first_name") or "Игрок")
        photo = user.get("photo_url") or ""
        if not (photo.startswith("https://") and len(photo) < 300):
            photo = ""
        return {"uid": str(user["id"]), "name": name[:24], "photo": photo}

    # ---------- рассылка ----------
    async def _send(self, ws, text: str):
        try:
            await ws.send_str(text)
        except Exception:
            pass

    async def broadcast(self, msg: dict):
        text = json.dumps(msg, ensure_ascii=False)
        if self.clients:
            await asyncio.gather(*(self._send(ws, text) for ws in list(self.clients)))

    def _welcome(self, player: dict) -> dict:
        return {
            "t": "welcome", "now": now_ms(), "you": player["uid"], "online": len(self.clients),
            "phase": self.phase, "round": self.round, "until": self.until, "t0": self.t0,
            "crash_at": self.crash_at if self.phase == "crash" else None,
            "history": self.history[-9:],
            "bets": [{"uid": u, **b} for u, b in self.bets.items()],
        }

    # ---------- игровой цикл ----------
    async def run(self):
        while True:
            try:
                await self._round()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Ошибка в цикле краша")
                await asyncio.sleep(1)

    async def _round(self):
        self.round += 1
        self.phase = "wait"
        self.bets = {}
        self.t0 = 0
        self.crash_at = gen_crash()
        self.crash_ms = math.log(self.crash_at) / K * 1000
        self.until = now_ms() + WAIT_MS
        await self.broadcast({"t": "round", "round": self.round, "until": self.until, "now": now_ms()})
        await asyncio.sleep(WAIT_MS / 1000)

        self.phase = "fly"
        self.t0 = now_ms()
        await self.broadcast({"t": "fly", "t0": self.t0})
        await asyncio.sleep(self.crash_ms / 1000)

        self.phase = "crash"
        self.history = (self.history + [self.crash_at])[-20:]
        await self.broadcast({"t": "crash", "at": self.crash_at})
        await asyncio.sleep(CRASH_SHOW_MS / 1000)

    # ---------- действия игроков ----------
    async def _bet(self, ws, p: dict, data: dict):
        try:
            amount = int(data.get("amount"))
        except (TypeError, ValueError):
            amount = 0
        if self.phase != "wait" or p["uid"] in self.bets or not (1 <= amount <= MAX_BET):
            return await self._send(ws, json.dumps({"t": "err", "code": "bet", "msg": "Ставка не принята"}))
        self.bets[p["uid"]] = {"name": p["name"], "photo": p["photo"], "amount": amount, "mult": None}
        await self.broadcast({"t": "bet", "uid": p["uid"], "name": p["name"], "photo": p["photo"], "amount": amount})

    async def _cash(self, ws, p: dict):
        b = self.bets.get(p["uid"])
        if self.phase != "fly" or not b or b["mult"] is not None:
            return
        elapsed = now_ms() - self.t0
        if elapsed >= self.crash_ms:
            return await self._send(ws, json.dumps({"t": "err", "code": "late", "msg": "Слишком поздно"}))
        m = mult_at(elapsed)
        b["mult"] = m
        await self._send(ws, json.dumps({"t": "cash_ok", "mult": m, "payout": int(b["amount"] * m)}))
        await self.broadcast({"t": "cash", "uid": p["uid"], "mult": m})

    async def _cancel(self, ws, p: dict):
        if self.phase == "wait" and p["uid"] in self.bets:
            amount = self.bets.pop(p["uid"])["amount"]
            await self._send(ws, json.dumps({"t": "refund", "amount": amount}))
            await self.broadcast({"t": "unbet", "uid": p["uid"]})

    # ---------- websocket ----------
    async def ws_handler(self, request: web.Request):
        if len(self.clients) >= MAX_CLIENTS:
            return web.Response(status=503, text="busy")
        ws = web.WebSocketResponse(heartbeat=20, max_msg_size=4096)
        await ws.prepare(request)
        player = None
        window_start, count = time.monotonic(), 0
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                now = time.monotonic()  # защита от флуда
                if now - window_start > 1:
                    window_start, count = now, 0
                count += 1
                if count > 30:
                    break
                try:
                    data = json.loads(msg.data)
                except ValueError:
                    continue
                if not isinstance(data, dict):
                    continue
                t = data.get("t")
                if t == "hello" and player is None:
                    player = self._auth(str(data.get("init", ""))[:4000])
                    self.clients[ws] = player
                    await self._send(ws, json.dumps(self._welcome(player), ensure_ascii=False))
                    await self.broadcast({"t": "online", "n": len(self.clients)})
                elif player is None:
                    continue
                elif t == "bet":
                    await self._bet(ws, player, data)
                elif t == "cash":
                    await self._cash(ws, player)
                elif t == "cancel":
                    await self._cancel(ws, player)
        except Exception:
            log.exception("Ошибка соединения")
        finally:
            if self.clients.pop(ws, None) is not None:
                await self.broadcast({"t": "online", "n": len(self.clients)})
        return ws


@web.middleware
async def _nocache(request, handler):
    resp = await handler(request)
    if not isinstance(resp, web.WebSocketResponse):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


def make_app(game: CrashGame, docs_dir=None) -> web.Application:
    """WebSocket краша + (по желанию) раздача самого мини-приложения из папки docs."""
    app = web.Application(middlewares=[_nocache])
    app.router.add_get("/ws", game.ws_handler)
    app.router.add_get("/health", lambda r: web.Response(text="ok"))
    if docs_dir is not None and docs_dir.exists():
        async def index(request):
            return web.FileResponse(docs_dir / "index.html")
        app.router.add_get("/", index)
        app.router.add_static("/", docs_dir, show_index=False)
    else:
        app.router.add_get("/", lambda r: web.Response(text="GiftRush crash server OK"))
    return app
