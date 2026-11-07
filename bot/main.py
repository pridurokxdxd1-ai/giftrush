import asyncio
import logging
import os
import sys
import time

from aiogram import Bot, Dispatcher, F
from aiogram.enums import ChatType
from aiogram.filters import CommandStart
from aiogram.types import (ErrorEvent, InlineKeyboardButton, InlineKeyboardMarkup,
                           MenuButtonWebApp, Message, WebAppInfo)
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("giftrush")

TOKEN = (os.getenv("BOT_TOKEN") or "").strip()
BASE_URL = (os.getenv("WEBAPP_URL") or "").strip()

if ":" not in TOKEN:
    sys.exit("Ошибка: в файле .env не задан BOT_TOKEN (токен от BotFather).")
if not BASE_URL.startswith("https://"):
    sys.exit("Ошибка: в файле .env WEBAPP_URL должен начинаться с https://")

# при каждом запуске бота меняем ?v=..., чтобы Telegram не показывал старую версию приложения из кэша
WEBAPP_URL = f"{BASE_URL}{'&' if '?' in BASE_URL else '?'}v={int(time.time())}"

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
    # любая ошибка в обработчике попадает в лог, а бот продолжает работать
    log.exception("Ошибка при обработке обновления: %s", event.exception)
    return True


async def main():
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="GiftsRush", web_app=WebAppInfo(url=WEBAPP_URL)))
    except Exception as e:  # не критично: бот работает и без кнопки меню
        log.warning("Не удалось поставить кнопку меню: %s", e)

    me = await bot.get_me()
    log.info("Бот @%s запущен", me.username)
    await dp.start_polling(
        bot,
        drop_pending_updates=True,
        allowed_updates=dp.resolve_used_update_types(),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        log.info("Бот остановлен")
