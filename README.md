# BoevTracker

Трекер задач для рабочей группы (аналог Яндекс Трекера).

## Стек

- **Frontend:** React, React Router, TypeScript, Zustand, Vite, shadcn/ui (Radix + Tailwind)
- **Backend:** Node.js, Fastify, TypeScript, Prisma, Zod, JWT (httpOnly cookie)
- **DB:** MariaDB
- **Файлы:** MinIO (S3-compatible)
- **Локальный запуск:** Docker Compose

## Быстрый старт (Docker)

```bash
docker compose up --build
```

Сервисы:

| Сервис   | URL                      |
|----------|--------------------------|
| Frontend | http://localhost:5173    |
| Backend  | http://localhost:3001    |
| MinIO UI | http://localhost:9001    |
| MariaDB  | localhost:3307           |

MinIO: `minioadmin` / `minioadmin`  
MariaDB: user `boev` / `boev`, DB `boevtracker`

## Первый администратор

После первого `docker compose up` (когда схема уже применена через `prisma db push`) создайте admin вручную.

1. Сгенерируйте hash пароля:

```bash
cd backend
npm install
node scripts/hash-password.mjs admin123
```

```bash
docker compose exec -T mariadb mariadb -uboev -pboev boevtracker < backend/prisma/seed-admin.sql
```

Или вручную через SQL-клиент (порт хоста **3307**):

## Роли

| Роль        | Права |
|-------------|--------|
| ADMIN       | Полный доступ, пользователи, удаление досок/проектов |
| DEVELOPER   | Как admin, но без подтверждения пользователей и удаления досок/проектов |
| READER      | Только просмотр |
| PENDING     | Экран ожидания подтверждения |

## Локальная разработка без Docker-приложений

Поднимите только инфраструктуру:

```bash
docker compose up mariadb minio minio-init
```

Затем:

```bash
# backend
cd backend
npm install
npx prisma db push
npm run dev

# frontend (другой терминал)
cd frontend
npm install
npm run dev
```

## Тема

По умолчанию тёмная тема (`class="dark"` на `<html>`). CSS-переменные для светлой темы уже заданы в `:root` — в будущем достаточно переключить класс.

## Деплой (REG.RU VPS + GitHub Actions)

Production-стек: `docker-compose.prod.yml` + Caddy (HTTPS) + автодеплой из `main`.

Полная инструкция: [deploy/README.md](deploy/README.md)

Кратко:

1. VPS Ubuntu + `deploy/bootstrap-vps.sh`
2. Заполнить `/opt/boevtracker/.env` из `.env.example`
3. DNS A → IP VPS, первый `docker compose -f docker-compose.prod.yml --env-file .env up -d --build`
4. GitHub Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`
5. Push / merge в `main` → workflow `.github/workflows/deploy.yml`
