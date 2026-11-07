import asyncio
import logging
import os
import re
import shutil
import sys
import time
import urllib.parse

from aiogram import Bot, Dispatcher, F
from aiogram.enums import ChatType
from aiogram.filters import CommandStart
from aiogram.types import (ErrorEvent, InlineKeyboardButton, InlineKeyboardMarkup,
                           MenuButtonWebApp, Message, WebAppInfo)
from aiohttp import web
from dotenv import load_dotenv

from crash_server import CrashGame, make_app

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("giftrush")

TOKEN = (os.getenv("BOT_TOKEN") or "").strip()
BASE_URL = (os.getenv("WEBAPP_URL") or "").strip()
SERVER_URL = (os.getenv("SERVER_URL") or "").strip().rstrip("/")  # необязательно: свой постоянный адрес сервера
PORT = int(os.getenv("PORT") or "8080")
VERSION = int(time.time())

if ":" not in TOKEN:
    sys.exit("Ошибка: в файле .env не задан BOT_TOKEN (токен от BotFather).")
if not BASE_URL.startswith("https://"):
    sys.exit("Ошибка: в файле .env WEBAPP_URL должен начинаться с https://")

bot = Bot(TOKEN)
dp = Dispatcher()


def webapp_url() -> str:
    # ?v=... сбрасывает кэш Telegram, ?api=... — адрес сервера краша
    q = f"v={VERSION}"
    if SERVER_URL:
        q += "&api=" + urllib.parse.quote(SERVER_URL, safe="")
    return f"{BASE_URL}{'&' if '?' in BASE_URL else '?'}{q}"


def play_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="GiftsRush", web_app=WebAppInfo(url=webapp_url()))
    ]])


@dp.message(CommandStart(), F.chat.type == ChatType.PRIVATE)
async def start(message: Message):
    await message.answer(
        "🎰 Привет, хочешь испытать удачу и вынести куш? Тебе к нам!",
        reply_markup=play_keyboard(),
    )


@dp.errors()
async def on_error(event: ErrorEvent):
    log.exception("Ошибка при обработке обновления: %s", event.exception)
    return True


# ---------- туннель cloudflared: даёт серверу краша https-адрес ----------
TUNNEL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


async def _drain(proc):
    while await proc.stderr.readline():
        pass


async def start_tunnel():
    exe = shutil.which("cloudflared")
    if not exe:
        log.warning("cloudflared не найден — краш будет работать в офлайн-режиме (см. инструкцию)")
        return None
    proc = await asyncio.create_subprocess_exec(
        exe, "tunnel", "--url", f"http://127.0.0.1:{PORT}", "--no-autoupdate",
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)

    async def find():
        while True:
            line = await proc.stderr.readline()
            if not line:
                return None
            for m in TUNNEL_RE.finditer(line.decode(errors="ignore")):
                if not m.group(0).startswith("https://api."):
                    return m.group(0)

    try:
        url = await asyncio.wait_for(find(), 45)
    except asyncio.TimeoutError:
        url = None
    if not url:
        proc.terminate()
        log.warning("Не удалось запустить туннель — краш будет работать в офлайн-режиме")
        return None
    asyncio.create_task(_drain(proc))
    return proc, url


async def main():
    global SERVER_URL
    game = CrashGame(TOKEN)
    runner = web.AppRunner(make_app(game))
    await runner.setup()
    try:
        await web.TCPSite(runner, "127.0.0.1", PORT).start()
    except OSError:
        sys.exit(f"Порт {PORT} занят. Закрой другой запущенный бот или поменяй PORT в .env")
    game_task = asyncio.create_task(game.run())

    tunnel = None
    if not SERVER_URL:
        res = await start_tunnel()
        if res:
            tunnel, SERVER_URL = res
            log.info("Сервер краша доступен по адресу %s", SERVER_URL)

    try:
        try:
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(text="GiftsRush", web_app=WebAppInfo(url=webapp_url())))
        except Exception as e:
            log.warning("Не удалось поставить кнопку меню: %s", e)
        me = await bot.get_me()
        log.info("Бот @%s запущен", me.username)
        await dp.start_polling(bot, drop_pending_updates=True,
                               allowed_updates=dp.resolve_used_update_types())
    finally:
        game_task.cancel()
        await runner.cleanup()
        if tunnel:
            tunnel.terminate()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        log.info("Бот остановлен")
