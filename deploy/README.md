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

## 3. Что делает workflow

Файл: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

При **push в `main`** (или вручную **Actions → Deploy → Run workflow**):

1. Собирает frontend (`VITE_API_URL` пустой = same-origin)
2. `composer install --no-dev` в `api/`
3. Собирает пакет `dist-deploy/` (корень + `app_laravel`)
4. Заливает по FTP

**Не затирает на сервере:**

- `app_laravel/.env`
- загруженные файлы в `storage/app/uploads`

## 4. Первый запуск автодеплоя

1. Закоммитьте и запушьте текущий код в `main` (включая `api/`, workflow, скрипты).
2. Откройте GitHub → **Actions** → дождитесь зелёного **Deploy to shared hosting**.
3. Проверьте https://boevsoft.ru/api/health и логин.

Если workflow красный — откройте лог шага FTP: чаще всего неверный `FTP_SERVER_DIR` или пароль.

## 5. После деплоя с новыми миграциями

FTP не запускает Artisan. Если в коммите новые миграции, один раз по SSH:

```bash
cd ~/www/boevsoft.ru/app_laravel
php artisan migrate --force
php artisan config:clear
php artisan route:clear
```

## 6. Локальная сборка пакета (без GitHub)

```bash
node scripts/build-shared-deploy.mjs
```

Результат: папка `dist-deploy/` — её содержимое можно залить вручную в корень сайта.

## Если логин снова идёт на localhost

В репозитории должно быть:

- `frontend/.env` → `VITE_API_URL=`
- `frontend/.env.production` → `VITE_API_URL=`

Не коммитьте `VITE_API_URL=http://localhost:3001`.
