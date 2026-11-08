"""Онлайн-игры GiftRush: общие раунды для краша и рулетки, несколько серверов (комнат).

Игроки определяются по подписанным данным Telegram (initData): подделать ник или аву нельзя.
Баланс в демо хранится на устройстве игрока; сервер отвечает за раунды, результаты и ставки.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import math
import secrets
import time
from urllib.parse import parse_qsl

from aiohttp import WSMsgType, web

log = logging.getLogger("games")
rng = secrets.SystemRandom()

ROOMS = ("1", "2", "3")          # «Сервер 1/2/3» у каждой игры
MAX_CLIENTS = 300                # соединений на комнату
MAX_BET = 1_000_000_000


def now_ms() -> int:
    return int(time.time() * 1000)


def auth(init_data: str, token: str) -> dict:
    """Проверяет подпись Telegram. Вне Telegram (или при подделке) — гость."""
    user = None
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
        got = pairs.pop("hash", "")
        check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
        secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
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


class Game:
    kind = ""

    def __init__(self, token: str, room: str):
        self.token, self.room = token, room
        self.clients = {}   # ws -> игрок
        self.round = 0
        self.phase = "wait"
        self.until = 0
        self.owed = {}      # uid -> выигрыш, который не удалось отправить (игрок вышел)

    def online(self) -> int:
        return len({p["uid"] for p in self.clients.values()})

    async def send(self, ws, msg: dict):
        try:
            await asyncio.wait_for(ws.send_str(json.dumps(msg, ensure_ascii=False)), 3)
        except Exception:
            pass

    async def broadcast(self, msg: dict):
        if self.clients:
            await asyncio.gather(*(self.send(ws, msg) for ws in list(self.clients)))

    async def err(self, ws, msg: str, **extra):
        await self.send(ws, {"t": "err", "code": "bet", "msg": msg, **extra})

    async def run(self):
        while True:
            try:
                await self.play_round()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Ошибка в цикле %s/%s", self.kind, self.room)
                await asyncio.sleep(1)

    async def play_round(self):  # pragma: no cover
        raise NotImplementedError

    def welcome(self, player: dict) -> dict:  # pragma: no cover
        raise NotImplementedError

    async def handle(self, ws, player: dict, data: dict):  # pragma: no cover
        raise NotImplementedError


# ======================= КРАШ =======================
CRASH_K = 0.1425           # m = exp(K * секунды)
CRASH_WAIT_MS = 6000
CRASH_SHOW_MS = 3500


def crash_mult(elapsed_ms: float) -> float:
    return math.floor(math.exp(CRASH_K * elapsed_ms / 1000) * 100) / 100


class Crash(Game):
    kind = "crash"

    def __init__(self, token, room):
        super().__init__(token, room)
        self.t0 = 0
        self.crash_at = 1.0
        self.crash_ms = 0.0
        self.bets = {}      # uid -> {name, photo, amount, mult}
        self.history = []

    def welcome(self, p):
        return {
            "t": "welcome", "now": now_ms(), "you": p["uid"], "online": self.online(), "room": self.room,
            "phase": self.phase, "round": self.round, "until": self.until, "t0": self.t0,
            "crash_at": self.crash_at if self.phase == "crash" else None,
            "history": self.history[-9:],
            "bets": [{"uid": u, **b} for u, b in self.bets.items()],
        }

    async def play_round(self):
        self.round += 1
        self.phase = "wait"
        self.bets = {}
        self.t0 = 0
        r = rng.random()
        self.crash_at = max(1.0, round(0.95 / (1 - r * 0.99), 2))
        self.crash_ms = math.log(self.crash_at) / CRASH_K * 1000
        self.until = now_ms() + CRASH_WAIT_MS
        await self.broadcast({"t": "round", "round": self.round, "until": self.until, "now": now_ms()})
        await asyncio.sleep(CRASH_WAIT_MS / 1000)

        self.phase = "fly"
        self.t0 = now_ms()
        await self.broadcast({"t": "fly", "t0": self.t0})
        await asyncio.sleep(self.crash_ms / 1000)

        self.phase = "crash"
        self.history = (self.history + [self.crash_at])[-20:]
        await self.broadcast({"t": "crash", "at": self.crash_at})
        await asyncio.sleep(CRASH_SHOW_MS / 1000)

    async def handle(self, ws, p, data):
        t, uid = data.get("t"), p["uid"]
        if t == "bet":
            try:
                amount = int(data.get("amount"))
            except (TypeError, ValueError):
                amount = 0
            if self.phase != "wait" or uid in self.bets or not (1 <= amount <= MAX_BET):
                return await self.err(ws, "Ставка не принята")
            self.bets[uid] = {"name": p["name"], "photo": p["photo"], "amount": amount, "mult": None}
            await self.broadcast({"t": "bet", "uid": uid, "name": p["name"], "photo": p["photo"], "amount": amount})
        elif t == "cash":
            b = self.bets.get(uid)
            if self.phase != "fly" or not b or b["mult"] is not None:
                return
            elapsed = now_ms() - self.t0
            if elapsed >= self.crash_ms:
                return await self.send(ws, {"t": "err", "code": "late", "msg": "Слишком поздно"})
            m = crash_mult(elapsed)
            b["mult"] = m
            await self.send(ws, {"t": "cash_ok", "mult": m, "payout": int(b["amount"] * m)})
            await self.broadcast({"t": "cash", "uid": uid, "mult": m})
        elif t == "cancel":
            if self.phase == "wait" and uid in self.bets:
                amount = self.bets.pop(uid)["amount"]
                await self.send(ws, {"t": "refund", "amount": amount})
                await self.broadcast({"t": "unbet", "uid": uid})


# ======================= РУЛЕТКА =======================
R_WAIT_MS = 12000
R_SPIN_MS = 7000
R_SHOW_MS = 4500
R_MIN_BET = 20
R_P_GREEN = 0.015                         # шанс зелёного «0» — очень редко
R_MULT = {"red": 2, "black": 2, "green": 12}


def roulette_roll():
    """Возвращает (число, цвет). Красные — нечётные 1..35, чёрные — чётные 2..36, зелёное — 0."""
    r = rng.random()
    if r < R_P_GREEN:
        return 0, "green"
    if r < R_P_GREEN + (1 - R_P_GREEN) / 2:
        return rng.choice(range(1, 36, 2)), "red"
    return rng.choice(range(2, 37, 2)), "black"


class Roulette(Game):
    kind = "roulette"

    def __init__(self, token, room):
        super().__init__(token, room)
        self.t0 = 0
        self.result = None      # {"n": .., "c": ..}
        self.off = 0.0
        self.bets = {}          # (uid, color) -> {name, photo, amount, color, payout}
        self.history = []

    def bets_list(self):
        return [{"uid": u, "color": c, "name": b["name"], "photo": b["photo"], "amount": b["amount"], "win": b["payout"]}
                for (u, c), b in self.bets.items()]

    def welcome(self, p):
        msg = {
            "t": "welcome", "now": now_ms(), "you": p["uid"], "online": self.online(), "room": self.room,
            "phase": self.phase, "round": self.round, "until": self.until, "t0": self.t0, "dur": R_SPIN_MS,
            "result": self.result if self.phase in ("spin", "result") else None, "off": self.off,
            "history": self.history[-14:], "bets": self.bets_list(),
            "owed": self.owed.pop(p["uid"], 0),
        }
        return msg

    async def play_round(self):
        self.round += 1
        self.phase = "wait"
        self.bets = {}
        self.result = None
        self.until = now_ms() + R_WAIT_MS
        await self.broadcast({"t": "round", "round": self.round, "until": self.until, "now": now_ms()})
        await asyncio.sleep(R_WAIT_MS / 1000)

        n, c = roulette_roll()
        self.result = {"n": n, "c": c}
        self.off = round(rng.uniform(-0.38, 0.38), 3)
        self.phase = "spin"
        self.t0 = now_ms()
        await self.broadcast({"t": "spin", "n": n, "c": c, "t0": self.t0, "dur": R_SPIN_MS, "off": self.off, "now": now_ms()})
        await asyncio.sleep(R_SPIN_MS / 1000)

        self.phase = "result"
        self.history = (self.history + [self.result])[-30:]
        wins = []
        for (uid, color), b in self.bets.items():
            if color == c:
                b["payout"] = int(b["amount"] * R_MULT[c])
                wins.append((uid, color, b["payout"]))
        await self.broadcast({"t": "result", "n": n, "c": c, "wins": [{"uid": u, "color": col, "payout": pay} for u, col, pay in wins]})
        for uid, color, pay in wins:   # выигрыш начисляется один раз
            ws = next((w for w, p in self.clients.items() if p["uid"] == uid), None)
            if ws is not None:
                await self.send(ws, {"t": "win", "color": color, "payout": pay, "mult": R_MULT[c]})
            else:
                self.owed[uid] = self.owed.get(uid, 0) + pay
        await asyncio.sleep(R_SHOW_MS / 1000)

    async def handle(self, ws, p, data):
        t, uid = data.get("t"), p["uid"]
        color = data.get("color")
        if color not in R_MULT:
            return
        key = (uid, color)
        if t == "bet":
            try:
                amount = int(data.get("amount"))
            except (TypeError, ValueError):
                amount = 0
            if self.phase != "wait" or key in self.bets or not (R_MIN_BET <= amount <= MAX_BET):
                return await self.err(ws, "Ставка не принята", color=color)
            self.bets[key] = {"name": p["name"], "photo": p["photo"], "amount": amount, "color": color, "payout": None}
            await self.broadcast({"t": "bet", "uid": uid, "name": p["name"], "photo": p["photo"], "amount": amount, "color": color})
        elif t == "cancel":
            if self.phase == "wait" and key in self.bets:
                amount = self.bets.pop(key)["amount"]
                await self.send(ws, {"t": "refund", "amount": amount, "color": color})
                await self.broadcast({"t": "unbet", "uid": uid, "color": color})


# ======================= сервер =======================
async def serve_ws(request: web.Request):
    games = request.app["games"]
    game = games.get((request.query.get("game", "crash"), request.query.get("room", "1")))
    if game is None:
        return web.Response(status=404, text="no such game")
    if len(game.clients) >= MAX_CLIENTS:
        return web.Response(status=503, text="busy")
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=4096)
    await ws.prepare(request)
    player = None
    window_start, count = time.monotonic(), 0
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            now = time.monotonic()      # защита от флуда
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
            if data.get("t") == "hello" and player is None:
                player = auth(str(data.get("init", ""))[:4000], game.token)
                game.clients[ws] = player
                await game.send(ws, game.welcome(player))
                await game.broadcast({"t": "online", "n": game.online()})
            elif player is not None:
                await game.handle(ws, player, data)
    except Exception:
        log.exception("Ошибка соединения")
    finally:
        if game.clients.pop(ws, None) is not None:
            await game.broadcast({"t": "online", "n": game.online()})
    return ws


@web.middleware
async def nocache(request, handler):
    resp = await handler(request)
    if not isinstance(resp, web.WebSocketResponse):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


def make_games(token: str) -> dict:
    return {(cls.kind, room): cls(token, room) for cls in (Crash, Roulette) for room in ROOMS}


def make_app(games: dict, docs_dir=None) -> web.Application:
    app = web.Application(middlewares=[nocache])
    app["games"] = games
    app.router.add_get("/ws", serve_ws)
    app.router.add_get("/health", lambda r: web.Response(text="ok"))
    if docs_dir is not None and docs_dir.exists():
        async def index(request):
            return web.FileResponse(docs_dir / "index.html")
        app.router.add_get("/", index)
        app.router.add_static("/", docs_dir, show_index=False)
    else:
        app.router.add_get("/", lambda r: web.Response(text="GiftRush games server OK"))
    return app
