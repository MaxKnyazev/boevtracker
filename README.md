# BoevTracker

Трекер задач для рабочей группы (аналог Яндекс Трекера).

## Стек

- **Frontend:** React, React Router, TypeScript, Zustand, Vite, shadcn/ui
- **Backend:** Laravel 11 (PHP 8.2+), JWT cookie `bt_token`
- **DB:** MySQL / MariaDB (локально можно SQLite)
- **Файлы:** диск `storage/app/uploads` (без MinIO)
- **Хостинг:** shared REG.RU (document root = `api/public`)

## Локальный запуск

```bash
# API
cd api
cp .env.example .env
php artisan key:generate
# JWT_SECRET=... в .env
php artisan migrate --seed
php artisan serve

# Frontend (прокси /api → :8000)
cd frontend
npm install
npm run dev
```

Админ после сида: `admin` / `admin123`.

Опционально MySQL в Docker: `docker compose up -d` (порт 3307), в `api/.env` укажите `DB_CONNECTION=mysql`.

## Production build (SPA в Laravel public)

```bash
npm run build
```

Скопирует `frontend/dist` в `api/public/`.

## Деплой

Shared-хостинг REG.RU (`boevsoft.ru`): см. [deploy/README.md](deploy/README.md).

Автодеплой: push в `main` → GitHub Actions → FTP в корень сайта.

Локальная сборка пакета:

```bash
npm run build:deploy
```

## Роли

| Роль        | Права |
|-------------|--------|
| ADMIN       | Полный доступ, пользователи, удаление досок/проектов |
| DEVELOPER   | Как admin, но без подтверждения пользователей и удаления досок/проектов |
| READER      | Только просмотр |
| PENDING     | Экран ожидания подтверждения |
