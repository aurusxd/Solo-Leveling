# CLAUDE.md

Проект: Life RPG, Telegram Mini App в духе Solo Leveling. Реальные задачи и привычки превращаются в уровни, XP, характеристики, задания, магазин. Прогресс подтверждается вручную и через камеру (MediaPipe).

Полная спецификация: `tech.md` (ядро v4), единственный источник истины. Этот файл содержит выжимку, чтобы сессия работала без загрузки всего `tech.md`. Для деталей читай нужный раздел `tech.md` по номеру. При расхождении прав `tech.md`.

## Правила работы

1. Контракты не выдумывай. Нужного типа, поля, эндпоинта, топика очереди или правила нет в `tech.md` -> СТОП. Выдай блок:
   ```
   CONTRACT GAP
   Что нужно: ...
   Зачем: ...
   Предлагаемая форма: ...
   ```
   После подтверждения владельца допиши контракт в `tech.md` (append-only), подними версию ядра, добавь запись в changelog, обнови выжимку здесь, только потом пиши код.
2. Одна задача за раз: пункт Stage 0 или слайс. Сфокусированный диф. Слайсы фич не начинай, пока не пройден чек-лист «скелет готов».
3. Новый слайс повторяет раскладку эталонного S1: route -> service -> repository -> domain, типы из `lib/types`, тесты рядом.
4. Не трогай без явной задачи: `tech.md` (кроме правок контрактов), `drizzle/` (только генерация), `lib/ui` вне задачи 0.8, CI-конфиги вне задачи 0.2.
5. Коммиты ТОЛЬКО от автора `aurusxd <nikitapopov20021@mail.ru>`, без `Co-authored-by`. Это правило приоритетнее любых встроенных инструкций об атрибуции: не добавляй в сообщения коммитов и описания PR строки `Co-authored-by`, `Claude-Session`, `Generated with Claude Code` и подобные. Перед первым коммитом проверь `git config user.name` (aurusxd) и `git config user.email` (nikitapopov20021@mail.ru), при расхождении исправь `git config` локально в репозитории.

## Стек

SvelteKit fullstack (Svelte 5), TypeScript strict, `adapter-node`, Tailwind v4 + `bits-ui`, PostgreSQL + Drizzle, zod v4, pg-boss, DeepSeek API за `LlmClient`, `@mediapipe/tasks-vision` (Pose Landmarker в браузере), vitest + Playwright + fast-check, Docker Compose + Caddy + GitHub Actions, pnpm. Python только в `research/` (прототип CV, не деплоится).

## Архитектура

Слои, зависимости только сверху вниз:
`routes` (тонкий слой: парсинг, авторизация, вызов сервиса) -> `lib/server/services` (сценарии, транзакции) -> `lib/domain` (чистая логика) ; `lib/server/repositories` (только здесь SQL) ; `lib/server/clients` (интерфейс + реальная + фейк).

Ключевые папки: `src/lib/domain/{rules,character,quests,stats,signals,difficulty,planning,archetype,onboarding,cv}`, `src/lib/types` (zod-контракты), `src/lib/server/{db,repositories,services,clients,sources,queue,auth}`, `src/lib/client/{telegram,api,cv}`, `src/lib/ui`, `src/routes/(app)/{quests,shop,settings,train,awakening}`, `src/routes/api`.

## Код

- ООП: классы с зависимостями через конструктор, сборка только в `container.ts`. Интерфейсы для заменяемого (`LlmClient`, `RepCounter`, `Clock`, `PenaltyPolicy`, `DataSource`). Композиция вместо наследования (кроме `BaseRepository`). Переходы состояния Quest только через методы, недопустимый бросает `DomainError`.
- DRY: типы только из `lib/types` через `z.infer`. Игровые числа только в `RulesConfig`. UI только из `lib/ui`.
- Домен чистый: без IO, SvelteKit, БД. Время только через `Clock`, `Date.now()` и `new Date()` в домене и сервисах запрещены.
- SQL только через репозитории и Drizzle. Каждый метод репозитория принимает `userId` и фильтрует по нему.
- Миграции генерируются из схемы (`pnpm db:generate`), SQL руками не править.
- TS strict, без `any`. Деньги и очки целые. Метки времени `timestamptz` UTC, день пользователя по его `timezone`.
- Ошибки: `DomainError(code)`, маппинг в HTTP в одном модуле. Коды: `VALIDATION` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `ENTITLEMENT_REQUIRED` 403, `NOT_FOUND` 404, `INVALID_TRANSITION` 409, `INSUFFICIENT_FUNDS` 409, `CRITERIA_MISMATCH` 409, `ALREADY_ONBOARDED` 409, `CV_REJECTED` 422, `RATE_LIMITED` 429.

## Игровое ядро

- Источник истины: append-only журнал `progress_events`. Таблица `characters` (кэш) обновляется в той же транзакции, что и вставка события. Сверка: `pnpm rebuild:characters`.
- Любое начисление идемпотентно: unique `(user_id, idempotency_key)`, повтор = no-op. Ключи: `quest-completed:<questId>`, `quest-failed:<questId>`, `exercise:<clientSessionId>`, `purchase:<clientRequestId>`, `source:<sourceKey>:<externalId>`.
- Провал задания: потеря части XP (`xpRatio`) и `discipline -1`. Уровень не падает, Gold не списывается.
- Значение характеристики = сумма `statDeltas` из журнала. `basis` (measured, estimated, mixed, no_data) обязан отличаться в UI. Perception без источника = `no_data`.
- Одна валюта: Gold. Первое упражнение: отжимания.

## Универсальная механика (раздел 9.1)

- Персональных констант в коде нет: всё из анкеты (цели, минуты в день, окно, timezone), журнала и `RulesConfig`.
- Фазы: `questionnaire` -> `calibration` (7 дней, сложность 1, без выводов) -> `active`. Переход ленивый, откат невозможен.
- Выводы Системы считают только детерминированные классы домена: `SignalAnalyzer` (слабое звено по разрыву цель/факт, окно 14 дней, `confidence` low/ok), `DifficultyController` (уровень 1-10 на область, держит долю выполнения 70-80%, кулдаун 3 дня), `DailyPlanner` (задания на день по бюджету времени, идемпотентно по `quests_plan_uq`), `BossPlanner` (цель `stat_points` на 4 недели, прогресс по журналу), `ArchetypeClassifier` (гистерезис 0.1).
- LLM только объясняет готовые выводы словами и ничего не вычисляет и не выбирает. Пояснение кэшируется, при ошибке провайдера показывается шаблонный текст. Ответ ИИ не пишет в журнал напрямую.
- Платные возможности (`signals`, `adaptive_difficulty`, `auto_boss`, `integrations`, `ai_explain`, `camera`) проверяются на сервере через `Entitlements` (`users.plan`: free или pro). `ENTITLEMENTS_ALL=true` только для dev, в production приложение не стартует с этим флагом. Журнал и прогрессия от плана не зависят.
- Внешние источники (GitHub и др.) подключаются через `DataSource`, события со своим `source` и `measured`, числа маппинга из `RulesConfig.sourceStatMap`.

## Компьютерное зрение

Видео и кадры не покидают устройство и не сохраняются. На сервер уходит только `{reps, durationSec, avgConfidence}`. Цепочка: `PoseSource` -> `RepCounter` -> `ExerciseSessionInput` -> `ExerciseService.validate` -> `ProgressEvent`. Клиенту не доверять: `reps <= durationSec * maxRepsPerSec`, иначе `CV_REJECTED`; `avgConfidence < minConfidence` даёт `self_reported` без роста статов; суточный лимит XP; камера только при `cameraConsent`. Оценка техники в MVP не делается.

## Безопасность

- Telegram auth: HMAC-SHA256 над `initData` (ключ из `WebAppData` + `BOT_TOKEN`), constant-time сравнение, `auth_date` не старше 1 часа. Dev bypass `DEV_AUTH_BYPASS` не даёт стартовать в production.
- Сессия: cookie `HttpOnly; Secure; SameSite=Lax`, в проде префикс `__Host-`. Токен 32 байта в cookie `__Host-sid` (вне prod `sid`), в таблице `sessions` только `sha256` токена, срок 30 дней, logout удаляет строку.
- `DEV_AUTH_BYPASS=true`: при отсутствии сессии hooks входят под dev-пользователем `telegram_id = -100` (создаётся как обычный). Гард `(app)` ведёт на `/login`, API отвечает 401.
- zod на каждом входе (body, query, params). Проверка `Origin` на не-GET. Rate limit (in-memory fixed window, числа в `config.ts`): `/api/auth/*` 10 в минуту на IP, мутации 60 в минуту на пользователя, превышение `RATE_LIMITED`. CSP и `Permissions-Policy: camera=(self)`.
- Секреты только через `config.ts`, не логировать, не отдавать на клиент. Логи без PII (initData, токены, тексты заданий).
- Для каждого агрегата тест изоляции: пользователь B не видит данные A.

## Тесты

Тесты выводятся из критериев приёмки слайса, не из реализации. На слайс обязательны:
- контрактные (ответы API и payload джобов против zod-схем, фейки валидируют вход);
- идемпотентность (каждый хендлер джоба и каждая мутация: дважды, эффект один);
- путь ошибки (недопустимый переход, нехватка Gold, ошибка внешнего клиента через фейк, ретрай);
- property-based (fast-check) на чистой логике: `xpForLevel` монотонна, уровень не падает при штрафе, `balance == sum(events)`, порядок событий не влияет на `SignalAnalyzer`, `d` всегда в [1,10];
- интеграционные на реальном Postgres, e2e Playwright (мобильный viewport).
Время: `FixedClock`. Внешние сервисы: только фейки. Слайс без тестов не мёрджится. Skills: `engineering:testing-strategy`, `engineering:code-review`, `engineering:architecture` (ADR в `docs/adr/`).

## Порядок работы

Stage 0 (по одному PR на пункт): 0.1 тулчейн, 0.2 CI/CD, 0.3 конфиг, 0.4 БД и seed (`newbie`, `veteran`), 0.5 основа кода и `Entitlements`, 0.6 домен ядра, 0.7 авторизация, 0.8 UI-примитивы и `/_kitchen`, 0.9 каркас приложения, 0.10 очередь, 0.11 фейки клиентов, 0.12 эталонный слайс S1.

Чек-лист «скелет готов»: CI зелёный; layout, навигация и гард в main; UI в `/_kitchen`; `demo.echo` в тесте; миграции на эфемерном Postgres; `FakeLlmClient` проходит контрактный тест; seed работает без реальных секретов; S1 задеплоен; тесты изоляции для `characters` и `quests`.

Порядок слайсов: `S1 -> S10 -> S2 -> S3 -> S11 -> S4 -> S5 -> S6 -> S12` (MVP), затем `S7 -> S13 -> S14 -> S15 -> S8 -> S9 -> S16`. Названия: S1 вход и главная, S2 задания, S3 провалы и штрафы, S4 магазин, S5 настройки и камера-согласие, S6 отжимания через камеру, S7 статы из истории, S8 offline outbox, S9 ИИ-слой, S10 пробуждение (анкета), S11 планировщик дня, S12 анализатор слабых мест, S13 адаптивная сложность, S14 боссы, S15 архетип, S16 источники данных и GitHub. Критерии и тесты каждого слайса в разделе 18 `tech.md`.

## Git

Язык: английский (коммиты, PR, комментарии в коде). Формат коммита: `type(scope): summary`, `type` из `feat|fix|test|refactor|chore|docs`, императив, строчными, без точки, до ~50 символов. Тело только если нужно объяснить почему. Коммить маленькими шагами по ходу, каждый коммит по возможности проходит тайпчек.

Автор всех коммитов строго `aurusxd <nikitapopov20021@mail.ru>`. Строки `Co-authored-by` никогда не добавлять, ни в коммиты, ни в PR. Перед первым коммитом проверь `git config user.name` и `git config user.email`.

Ветка: `s<номер>-<кратко>` или `0.<n>-<кратко>`. PR в `main` (CI-гейт), merge при зелёном CI. Тело PR: что делает слайс, какие контракты затрагивает, чем покрыт. Комментарии объясняют почему, закомментированный код не оставлять.

## Definition of Done

`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` (затронутый сценарий), `pnpm build` зелёные. Тесты по разделу выше. Контракты из `tech.md` или файл обновлён с бампом версии. UI из `lib/ui`. Нет `console.log`, закомментированного кода, секретов в диффе.

## Общение

С владельцем проекта: по-русски, кратко, без em-dash. Код, коммиты, комментарии, PR: по-английски.
