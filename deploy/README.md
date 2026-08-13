# Автодеплой BoevTracker на REG.RU (shared / ISPmanager)

Сайт: `boevsoft.ru`  
Раскладка на сервере:

```text
/www/boevsoft.ru/          ← корень сайта (FTP_SERVER_DIR)
  index.php                ← вход в Laravel (app_laravel)
  index.html + assets/     ← React SPA
  app_laravel/             ← Laravel
    .env                   ← НЕ перезаписывается деплоем
    storage/app/uploads/   ← НЕ перезаписывается
```

## 1. FTP-доступ

В кабинете REG.RU → вкладка **«Доступы»** или в ISPmanager → FTP:

- хост (например `server167.hosting.reg.ru` или IP)
- логин
- пароль

В файловом менеджере откройте корень сайта `boevsoft.ru` и скопируйте путь.  
Часто это:

```text
/www/boevsoft.ru/
```

или относительно домашнего каталога FTP:

```text
www/boevsoft.ru/
```

**Важно:** путь должен указывать на каталог, где лежат `index.php` и `app_laravel`, а не внутрь `app_laravel`.

Проверка в FileZilla: зайдите по FTP и найдите папку, в которой уже есть `app_laravel` — это и есть `FTP_SERVER_DIR`.

## 2. GitHub Secrets

Репозиторий → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Что вписать |
|--------|-------------|
| `FTP_HOST` | Хост FTP из панели |
| `FTP_USER` | Логин FTP |
| `FTP_PASSWORD` | Пароль FTP |
| `FTP_SERVER_DIR` | Путь к корню сайта, **со слэшем в конце**, например `www/boevsoft.ru/` или `/www/boevsoft.ru/` |
| `SSH_HOST` | Хост SSH (часто тот же, что `FTP_HOST`) |
| `SSH_USER` | Логин SSH (часто тот же, что `FTP_USER`, напр. `u2496499`) |
| `SSH_PASSWORD` | Пароль SSH **или** вместо него `SSH_PRIVATE_KEY` |
| `SSH_PRIVATE_KEY` | (опционально) приватный ключ целиком, если вход по ключу |
| `SSH_APP_DIR` | Абсолютный путь к Laravel на сервере, напр. `/var/www/u2496499/data/www/boevsoft.ru/app_laravel` или `~/www/boevsoft.ru/app_laravel` |

SSH в ISPmanager / REG.RU обычно включается в разделе доступов того же пользователя. Порт SSH по умолчанию `22` (если другой — правьте `port` в workflow).

## 3. Что делает workflow

Файл: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

При **push в `main`** (или вручную **Actions → Deploy → Run workflow**):

1. Собирает frontend в `frontend/dist` (`VITE_API_URL` пустой = same-origin)
2. Кладёт **свежий** SPA в пакет (не старый `api/public` из git)
3. Собирает `dist-deploy/` (корень сайта + `app_laravel` **без** `vendor`)
4. Заливает по FTP
5. По SSH: `php artisan migrate --force` + очистка config/route cache

Обычный деплой занимает **несколько минут**, не десятки.

**`vendor/` по FTP не заливается** (пофайловая заливка на shared hosting легко упирается в лимит ~90 мин).

После FTP workflow по SSH:
1. пытается `composer install --no-dev` (ставит `composer.phar`, если `composer` нет в PATH);
2. либо, если в **Run workflow** включена галка vendor — заливает **один** `vendor.tar.gz` по SCP и распаковывает.

Ручной запасной вариант по SSH (без GitHub):

```bash
cd ~/www/boevsoft.ru/app_laravel
php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
php composer-setup.php
php composer.phar install --no-dev --optimize-autoloader --no-interaction
php artisan config:clear
rm -f composer-setup.php
```

Для realtime после добавления `pusher/pusher-php-server` без обновлённого `vendor`  
`POST /api/broadcasting/auth` отдаёт **500** (класс `Pusher\Pusher` не найден), хотя `/api/realtime/config` уже может вернуть `driver: pusher`.

**Не затирает на сервере:**

- `app_laravel/.env`
- `app_laravel/vendor/` (при обычном деплое)
- загруженные файлы в `storage/app/uploads`

## 4. Первый запуск автодеплоя

1. Закоммитьте и запушьте текущий код в `main` (включая `api/`, workflow, скрипты).
2. Откройте GitHub → **Actions** → дождитесь зелёного **Deploy to shared hosting**.
3. Проверьте https://boevsoft.ru/api/health и логин.

Если workflow красный — откройте лог шага FTP или SSH: чаще всего неверный путь/`SSH_APP_DIR` или пароль.

## 5. Миграции

После FTP workflow сам применяет миграции по SSH. Отдельно заходить на сервер не нужно, если настроены `SSH_*` secrets.

Ручной запасной вариант:

```bash
cd ~/www/boevsoft.ru/app_laravel
php artisan migrate --force
php artisan config:clear
php artisan route:clear
```

## 5.1. Часовой пояс (смены / учёт времени)

На проде время должно быть **Москва** (`UTC+3`). В `app_laravel/.env`:

```env
APP_TIMEZONE=Europe/Moscow
DB_TIMEZONE=+03:00
```

Затем:

```bash
php artisan config:clear
```

Если оставить `APP_TIMEZONE=UTC`, а в БД лежат «московские» wall-clock значения, в UI время уедет на **+3 часа** (16:53 → 19:53).
## 6. Локальная сборка пакета (без GitHub)

```bash
node scripts/build-shared-deploy.mjs
# полный пакет с vendor (редко):
# INCLUDE_VENDOR=1 node scripts/build-shared-deploy.mjs
```

Результат: папка `dist-deploy/` — её содержимое можно залить вручную в корень сайта.

## Если логин снова идёт на localhost

В репозитории должно быть:

- `frontend/.env` → `VITE_API_URL=`
- `frontend/.env.production` → `VITE_API_URL=`

Не коммитьте `VITE_API_URL=http://localhost:3001`.

## 7. Realtime (Pusher)

Уведомления и чат работают через **Pusher** (WebSocket в облаке). Без ключей включается лёгкий polling раз в ~4 сек (без long-poll).

1. Создайте приложение на https://pusher.com/channels  
2. В `app_laravel/.env` на сервере (и локально в `api/.env`):

```env
BROADCAST_CONNECTION=pusher
PUSHER_APP_ID=...
PUSHER_APP_KEY=...
PUSHER_APP_SECRET=...
PUSHER_APP_CLUSTER=eu
```

3. `php artisan config:clear`  
4. Ключ для фронта отдаёт `GET /api/realtime/config` — отдельно в Vite его прописывать не нужно.
