# GiftRush

- `webapp/` — Telegram Mini App (HTML/CSS/JS, без сборки)
- `bot/` — бот на aiogram (кнопка «Играть»)

Баланс в приложении виртуальный (демо), хранится локально в Telegram WebView.

## Запуск
1. `cd bot` → `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt`
2. Скопируй `.env.example` в `.env`, вставь токен и https-ссылку на webapp
3. `python main.py`
