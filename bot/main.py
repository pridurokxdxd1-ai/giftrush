import asyncio
import logging
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

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
BASE_URL = (os.getenv("WEBAPP_URL") or "").strip().rstrip("/")
API_URL = (os.getenv("API_URL") or "").strip().rstrip("/") or BASE_URL  # где работает сервер краша
PORT = int(os.getenv("PORT", "8080"))
DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"

if ":" not in TOKEN:
    sys.exit("Ошибка: в файле .env не задан BOT_TOKEN (токен от BotFather).")
if not BASE_URL.startswith("https://"):
    sys.exit("Ошибка: в файле .env WEBAPP_URL должен начинаться с https://")
if not API_URL.startswith("https://"):
    sys.exit("Ошибка: API_URL в файле .env должен начинаться с https://")

# v — сброс кэша Telegram при каждом запуске, api — адрес сервера для общего краша
WEBAPP_URL = f"{BASE_URL}/?{urlencode({'v': int(time.time()), 'api': API_URL})}"

bot = Bot(TOKEN)
dp = Dispatcher()


def play_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="GiftsRush", web_app=WebAppInfo(url=WEBAPP_URL))
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


async def main():
    game = CrashGame(TOKEN)
    runner = web.AppRunner(make_app(game, DOCS_DIR))
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", PORT).start()
    crash_task = asyncio.create_task(game.run())
    log.info("Сервер запущен на порту %s", PORT)

    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="GiftsRush", web_app=WebAppInfo(url=WEBAPP_URL)))
    except Exception as e:
        log.warning("Не удалось поставить кнопку меню: %s", e)

    me = await bot.get_me()
    log.info("Бот @%s запущен", me.username)
    try:
        await dp.start_polling(bot, drop_pending_updates=True,
                               allowed_updates=dp.resolve_used_update_types())
    finally:
        crash_task.cancel()
        await runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        log.info("Бот остановлен")
