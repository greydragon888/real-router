# Turbo Remote Cache — Self-Hosted Deployment

Runbook по провижну self-hosted Turbo Remote Cache на стеке **Cloudflare R2 + Google Cloud Run** через [`ducktors/turborepo-remote-cache`](https://github.com/ducktors/turborepo-remote-cache).

Мотивация и контекст: [#490](https://github.com/greydragon888/real-router/issues/490), [IMPLEMENTATION_NOTES.md → Self-Hosted Turbo Remote Cache](../IMPLEMENTATION_NOTES.md).

Ожидаемое время настройки: **1–2 часа**. Ожидаемая стоимость: **$0/мес** при текущем профиле проекта (R2 free tier: 10 GB хранилища + 1M Class A / 10M Class B операций; Cloud Run free tier: 2M запросов/мес + 360K GB·s памяти).

---

## Архитектура

```
┌──────────────┐  HTTPS + Bearer  ┌──────────────────┐  S3 API  ┌──────────────┐
│ GitHub       │ ───────────────► │ Cloud Run        │ ───────► │ Cloudflare   │
│ Actions      │   TURBO_TOKEN    │ (ducktors image) │          │ R2 bucket    │
│ turbo CLI    │                  │  us-central1     │          │              │
└──────────────┘                  └──────────────────┘          └──────────────┘
```

- **Cloud Run**: stateless-контейнер, автомасштаб 0→3, 512 MiB RAM, публичный endpoint, авторизация по `TURBO_TOKEN` в заголовке (`AUTH_MODE=static`).
- **R2**: S3-совместимое объектное хранилище, нулевая стоимость egress, никаких ограничений на retention кроме квоты free tier.

---

## Шаг 1 — Cloudflare R2

1. Войти в дашборд Cloudflare → **R2** → **Create bucket**.
   - Имя: `real-router-turbo-cache`
   - Location: `Automatic` (R2 использует глобальный регион `auto`)
2. **R2** → **Manage R2 API Tokens** → **Create API Token**.
   - Permissions: **Object Read & Write**
   - Specify bucket: только `real-router-turbo-cache` (принцип минимальных привилегий)
   - TTL: без ограничения (ротация раз в год вручную)
3. Сохранить в защищённом месте:
   - `Access Key ID`
   - `Secret Access Key`
   - `S3 endpoint URL` — показан как `https://<account-id>.r2.cloudflarestorage.com`

Эти значения понадобятся в env-переменных на Шаге 2.

---

## Шаг 2 — Google Cloud Run

Предусловия: `gcloud` CLI авторизован, в проекте привязан billing account (фактическое использование остаётся на $0 в рамках free tier, но billing обязателен технически).

```bash
# Выбрать проект и включить API
gcloud config set project <YOUR_PROJECT_ID>
gcloud services enable run.googleapis.com

# Сгенерировать сильный shared token (сохранить — пригодится на Шаге 3)
TURBO_TOKEN=$(openssl rand -hex 32)
echo "TURBO_TOKEN=$TURBO_TOKEN"  # скопировать значение

# Развернуть контейнер ducktors
gcloud run deploy turbo-cache \
  --image=ducktors/turborepo-remote-cache:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=60s \
  --set-env-vars="\
NODE_ENV=production,\
STORAGE_PROVIDER=s3,\
STORAGE_PATH=real-router-turbo-cache,\
S3_REGION=auto,\
S3_ENDPOINT=https://<YOUR_R2_ACCOUNT_ID>.r2.cloudflarestorage.com,\
S3_ACCESS_KEY=<R2_ACCESS_KEY_ID>,\
S3_SECRET_KEY=<R2_SECRET_ACCESS_KEY>,\
AUTH_MODE=static,\
TURBO_TOKEN=$TURBO_TOKEN,\
STORAGE_PATH_USE_TMP_FOLDER=false,\
LOG_LEVEL=info"
```

`gcloud run deploy` напечатает URL сервиса, например `https://turbo-cache-<hash>-uc.a.run.app`. Сохранить — это значение `TURBO_API`.

### Зачем эти флаги

| Флаг | Причина |
|---|---|
| `--max-instances=3` | Ограничение runaway-конкурентности → предсказуемый биллинг |
| `--min-instances=0` | Scale-to-zero в простое, остаёмся в free tier |
| `--memory=512Mi` | Ducktors лёгкий; 512 MiB с запасом над baseline |
| `--timeout=60s` | Загрузка/скачивание кэша небольшие (< 10 MB); 60 с более чем хватает |
| `STORAGE_PATH_USE_TMP_FOLDER=false` | Избегаем двойного префикса в ключах bucket |
| `AUTH_MODE=static` + `TURBO_TOKEN` | Проще JWT; один shared secret |

### Проверка

```bash
# Ожидаем 401 (требуется токен)
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://turbo-cache-<hash>-uc.a.run.app/v8/artifacts/status

# Ожидаем 200 с JSON-телом
curl -sS -H "Authorization: Bearer $TURBO_TOKEN" \
  https://turbo-cache-<hash>-uc.a.run.app/v8/artifacts/status
```

---

## Шаг 3 — GitHub secrets и variables

Репозиторий → **Settings** → **Secrets and variables** → **Actions**.

### Repository variables (публичные, не секретные)

| Имя | Значение |
|---|---|
| `TURBO_API` | URL Cloud Run с Шага 2 (например, `https://turbo-cache-abc123-uc.a.run.app`) |
| `TURBO_TEAM` | Любая непустая строка (ducktors игнорирует, но turbo CLI требует). Рекомендую `real-router`. |

### Repository secrets (секретные)

| Имя | Значение |
|---|---|
| `TURBO_TOKEN` | Значение из `openssl rand -hex 32` с Шага 2 |

**Ротация `TURBO_TOKEN`:** обновить и env-переменную Cloud Run (`gcloud run services update turbo-cache --update-env-vars TURBO_TOKEN=<new>`), и GitHub secret. Порядок важен, чтобы не сломать CI: сначала Cloud Run → потом GitHub secret → запустить workflow для проверки.

**Откат на Vercel:** сохранить старые значения Vercel-ных `TURBO_TOKEN`/`TURBO_TEAM` в защищённой заметке на неделю. Чтобы откатиться — удалить переменную `TURBO_API` (turbo CLI автоматически падает на дефолтный Vercel-endpoint) и восстановить старое значение секрета.

---

## Шаг 4 — End-to-end проверка

1. Запустить CI на PR (или перезапустить существующий).
2. Дождаться завершения.
3. `gh run rerun <run-id>` на том же SHA.
4. Сравнить тайминги: второй прогон должен быть сильно быстрее для кэшированных задач.
5. В логах job найти строки вида:
   ```
   >>> REMOTE CACHE HIT
   ```
   в выводе `turbo run`. Проверить, что **0** переходов `HIT → MISS` между прогонами на одном SHA.
6. Посмотреть R2 bucket — там должны быть сотни мелких объектов с ключами `v8/artifacts/<hash>`.

---

## Операционные заметки

- **Retention**: автоматического expiry нет. Раз в месяц проверять размер bucket через дашборд Cloudflare. При приближении к 10 GB free tier — добавить R2 Object Lifecycle rule (удалять объекты старше 30 дней).
- **Мониторинг**: метрики Cloud Run на https://console.cloud.google.com/run. Настроить алерт на долю non-2xx ответов > 1%.
- **Egress**: egress из R2 бесплатный → egress Cloud Run к клиентам (GHA runners) тарифицируется после free tier (2 GiB/мес). При текущих размерах артефактов (~10 MB × 300 CI-прогонов/мес) мы существенно ниже порога.
- **Cold starts**: `--min-instances=0` означает, что первый запрос после простоя может занять ~2–5 с. Последующие job в том же run попадают в прогретый инстанс. Всё равно несравнимо лучше, чем 30–60 с потерь на Vercel cache miss.

---

## Troubleshooting

| Симптом | Вероятная причина | Фикс |
|---|---|---|
| Turbo пишет `WARNING failed to contact remote cache` | `TURBO_API` не задан или неверный URL | Перепроверить `vars.TURBO_API` в GitHub; должно начинаться с `https://` |
| Каждая задача — MISS, хотя кэш должен быть | Расходятся `TURBO_TOKEN` в GHA и Cloud Run | Сделать ротацию по процедуре из Шага 3 |
| Cloud Run отдаёт 500 на каждый запрос | Неверные R2 creds или bucket отсутствует | `gcloud run services logs read turbo-cache --region=us-central1 --limit=50` — посмотреть точную ошибку |
| `403 Forbidden` от R2 | Токен API без write-прав на bucket | Перегенерировать токен с `Object Read & Write` на конкретный bucket |
| Кэш работает, но bucket растёт за free tier | Нет lifecycle-правила | Добавить R2 lifecycle rule: удалять объекты старше 30 дней |

---

## Ссылки

- [ducktors/turborepo-remote-cache — GitHub](https://github.com/ducktors/turborepo-remote-cache)
- [Справочник env-переменных](https://ducktors.github.io/turborepo-remote-cache/environment-variables.html)
- [Документация Turborepo Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Совместимость Cloudflare R2 c S3 API](https://developers.cloudflare.com/r2/api/s3/api/)
- [Cloud Run — тарифы и free tier](https://cloud.google.com/run/pricing)
