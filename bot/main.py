import asyncio, os
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo, MenuButtonWebApp)
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")  # https-адрес, где лежит папка webapp

bot = Bot(TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def start(m):
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="GiftsRush", web_app=WebAppInfo(url=WEBAPP_URL))]])
    await m.answer("Готов испытать удачи и забрать куш? Тебе к нам!", reply_markup=kb)


async def main():
    await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="GiftsRush", web_app=WebAppInfo(url=WEBAPP_URL)))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
