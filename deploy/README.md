# Деплой BoevTracker на VPS (REG.RU)

## Требования

- VPS/VDS Ubuntu 22.04 или 24.04 (не shared-хостинг)
- Рекомендуется от 2 GB RAM (лучше 4 GB)
- Домен с A-записью на IP сервера
- Репозиторий на GitHub

## 1. Первичная настройка сервера

С root-доступом:

```bash
# скопируйте скрипт на сервер или клонируйте репо временно
curl -fsSL https://raw.githubusercontent.com/ORG/boevtracker/main/deploy/bootstrap-vps.sh -o bootstrap-vps.sh
# либо после clone:
# bash deploy/bootstrap-vps.sh

REPO_URL=git@github.com:ORG/boevtracker.git bash bootstrap-vps.sh
```

Скрипт установит Docker, создаст пользователя `deploy`, откроет порты 22/80/443 и клонирует проект в `/opt/boevtracker`.

## 2. SSH-ключ для GitHub Actions

На локальной машине (один раз):

```bash
ssh-keygen -t ed25519 -C "boevtracker-deploy" -f boevtracker_deploy -N ""
```

- **Публичный** ключ (`boevtracker_deploy.pub`) добавьте на VPS:

```bash
echo "ssh-ed25519 AAAA..." >> /home/deploy/.ssh/authorized_keys
```

- **Приватный** ключ (`boevtracker_deploy`) — только в GitHub Secret `VPS_SSH_KEY` (весь файл целиком).

Проверка:

```bash
ssh -i boevtracker_deploy deploy@YOUR_VPS_IP
```

## 3. Переменные окружения

```bash
sudo -u deploy nano /opt/boevtracker/.env
```

Обязательно замените:

| Переменная | Пример |
|------------|--------|
| `DOMAIN` | `tracker.example.ru` |
| `ACME_EMAIL` | ваш email для Let's Encrypt |
| `MYSQL_*` / `DATABASE_URL` | сильные пароли |
| `JWT_SECRET`, `COOKIE_SECRET` | длинные случайные строки |
| `CORS_ORIGIN` | `https://tracker.example.ru` |
| `S3_PUBLIC_URL` | `https://tracker.example.ru/files` |
| `MINIO_ROOT_*` / `S3_*` | сильные пароли (ключ = пароль MinIO) |
| `VITE_API_URL` | оставьте пустым (same-origin) |

## 4. DNS

В панели REG.RU создайте A-запись `DOMAIN` → IP VPS. Дождитесь распространения DNS перед первым запуском (нужно для HTTPS).

## 5. Первый запуск

```bash
cd /opt/boevtracker
sudo -u deploy docker compose -f docker-compose.prod.yml --env-file .env up -d --build
sudo -u deploy docker compose -f docker-compose.prod.yml --env-file .env ps
sudo -u deploy docker compose -f docker-compose.prod.yml --env-file .env logs -f backend
```

Проверка: `https://YOUR_DOMAIN/api/health` → `{"ok":true}`.

## 6. Администратор

После первого старта (когда `prisma db push` уже отработал):

```bash
cd /opt/boevtracker/backend
# локально сгенерировать hash:
node scripts/hash-password.mjs 'your-admin-password'
# подставьте hash в seed-admin.sql и выполните:
sudo -u deploy docker compose -f /opt/boevtracker/docker-compose.prod.yml --env-file /opt/boevtracker/.env \
  exec -T mariadb mariadb -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /opt/boevtracker/backend/prisma/seed-admin.sql
```

Или зайдите в контейнер и выполните SQL вручную.

## 7. GitHub Secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Значение |
|--------|----------|
| `VPS_HOST` | IP или hostname VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | содержимое приватного ключа |
| `VPS_PORT` | `22` |

Для **приватного** репозитория на сервере нужен read-only deploy key или HTTPS token, чтобы `git fetch` работал от пользователя `deploy`.

## 8. Автодеплой

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

Триггер: любой **push в `main`** (включая merge PR).

Что делает:

1. SSH на VPS
2. `git fetch` + `git reset --hard origin/main`
3. `docker compose -f docker-compose.prod.yml up -d --build --remove-orphans`
4. `docker image prune -f`

## 9. Проверка после деплоя

- [ ] Actions → Deploy workflow зелёный
- [ ] `https://DOMAIN/` открывается
- [ ] Логин работает (cookie Secure)
- [ ] Создание задачи и загрузка файла
- [ ] `/api/health` отвечает ok

## Откат

```bash
cd /opt/boevtracker
sudo -u deploy git log --oneline -5
sudo -u deploy git reset --hard <good-commit-sha>
sudo -u deploy docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```
