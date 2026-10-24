# tech.md: Life RPG

**Версия ядра: v3**
**Changelog**
- v3: LLM-провайдер заменён с Claude API на DeepSeek API (`DeepSeekLlmClient`), кэш пояснений и шаблонный фолбэк. Контракты `LlmClient` не менялись.
- v2: универсальная механика (анкета и калибровка, планировщик дня, анализатор слабых мест, адаптивная сложность, боссы, архетипы), планы доступа (Entitlements), модули источников данных. Слайсы S10-S16. Схема и типы расширены append-only (BREAKING нет).
- v1: исходное ядро. Стадия 0 (каркас) + вертикальные слайсы S1-S9.

Правила изменения: этот файл единственный источник истины. Контракты (схема БД, типы, API, очередь, правила) меняются только здесь, только append-only (добавление полей/эндпоинтов), каждое изменение бампает версию и пишется в changelog. Ломающие изменения оформляются отдельной миграцией и записью в changelog с пометкой `BREAKING`.

---

## 1. Проект

Life RPG: персональная RPG-система в духе Solo Leveling. Реальные задачи, привычки и физическая активность превращаются в игровую механику: уровни, XP, характеристики, задания, награды, штрафы, магазин. Подтверждение прогресса: ручное и через камеру (компьютерное зрение, MediaPipe в браузере). ИИ (LLM) добавляется позже как опциональный слой.

Платформа: Telegram Mini App (мобильный экран, iPhone/Android). Архитектура допускает запуск как обычный веб-сайт вне Telegram.

Разработка: один человек (роль тимлида и разработчика совмещены). Формальные процессы урезаны до тех, что защищают от ошибок: версионированное ядро, CI-гейт, слайсы, тесты из критериев приёмки.

## 2. Принятые решения по открытым вопросам ТЗ

Значения по умолчанию, все числа живут в `RulesConfig` (раздел 9) и правятся без переписывания логики.

| Вопрос | Решение |
|---|---|
| БД | PostgreSQL |
| Backend | SvelteKit fullstack, TypeScript. Python только в `research/` (прототип CV, не деплоится) |
| CV в проде | MediaPipe Tasks Vision (JS), **Pose Landmarker** в браузере. Holistic остаётся в Python-прототипе. Лицо и кисти не анализируются |
| Видео и кадры | Не покидают устройство и не сохраняются. На сервер уходит только структурированный результат (reps, длительность, средняя уверенность) |
| Первое упражнение | Отжимания (push-up) |
| Валюта | Одна: Gold. Награды в Gold и XP за задания |
| Штраф за провал | Потеря части XP (ratio) + `discipline -1`. Уровень не понижается. Gold не отнимается |
| Генерация заданий ИИ | Не в MVP. Слайс S9: ИИ только предлагает черновики, пользователь подтверждает |
| LLM | DeepSeek API за интерфейсом `LlmClient` (OpenAI-совместимый API, дешёвая модель). Смена провайдера или локальная модель (Ollama для dev) = новая реализация интерфейса без правок домена |
| Offline | Ядро домена чистое и работает на клиенте. Все мутации идемпотентны (ключ идемпотентности обязателен), что позволяет добавить outbox без смены контрактов (S8) |
| Универсальность | Ничего персонального в коде. Персонализация = цели из анкеты + журнал событий. Выводы (слабое звено, сложность, архетип) считают детерминированные классы домена, LLM только объясняет (раздел 9.1) |
| Монетизация | Планы `free` и `pro` через `Entitlements`, проверка на сервере (раздел 9.2). Биллинг не в объёме, поле `users.plan` меняется вручную |
| Источники данных | Подключаются модулями (`DataSource`), каждый пишет в тот же журнал со своим `source` (раздел 8.4) |
| MVP | S1-S6 и S10-S12. Остальное после проверки базового сценария |

## 3. Стек

- SvelteKit (fullstack), Svelte 5, TypeScript strict, `adapter-node`
- Tailwind CSS v4 + `bits-ui` (доступные headless-примитивы: Dialog, Tabs, Switch)
- PostgreSQL, Drizzle ORM + drizzle-kit (миграции)
- zod v4 (валидация границ и источник типов)
- pg-boss (очередь и cron)
- DeepSeek API (пакет `openai` с base URL DeepSeek) за интерфейсом `LlmClient`
- `@mediapipe/tasks-vision` (клиент)
- Тесты: vitest, Playwright, fast-check
- Инфра: Docker Compose (app + postgres), Caddy (TLS, reverse proxy), GitHub Actions
- Менеджер пакетов: pnpm

## 4. Архитектура и структура папок

Слои (зависимости только сверху вниз, обратные запрещены):

```
routes (UI, load, actions, +server.ts)   тонкий слой: парсинг, авторизация, вызов сервиса
        v
lib/server/services                      сценарии (use cases), транзакции
        v
lib/domain                               чистая бизнес-логика RPG, без IO, без SvelteKit, без БД
        ^
lib/server/repositories                  доступ к БД (Drizzle), только здесь SQL
lib/server/clients                       внешние сервисы: интерфейс + реальная + фейковая реализация
```

```
src/
  lib/
    domain/                 pure TS, работает и на клиенте и на сервере
      rules/                RulesConfig, LevelCurve, ProgressionEngine, PenaltyPolicy
      character/            CharacterProjector (свёртка ledger в состояние)
      quests/               Quest (state machine), QuestCriteria
      stats/                StatCalculator
      signals/              SignalAnalyzer (слабые места, раздел 9.1)
      difficulty/           DifficultyController
      planning/             DailyPlanner, BossPlanner, QuestTemplateCatalog
      archetype/            ArchetypeClassifier
      onboarding/           фазы и калибровка (resolvePhase)
      cv/                   geometry (angle), RepCounter (интерфейс), PushUpCounter
      errors.ts             DomainError + коды
      clock.ts              Clock (интерфейс), SystemClock, FixedClock
    types/                  zod-схемы и выведенные типы (контракты), единая точка
    server/
      db/                   schema.ts, client.ts, seed.ts
      repositories/         BaseRepository + по одному на агрегат
      services/             AuthService, QuestService, ShopService, ProgressService, ExerciseService, SettingsService,
                            OnboardingService, GoalService, SignalService, PlannerService, BossService, Entitlements
      clients/              llm/ (LlmClient, DeepSeekLlmClient, FakeLlmClient)
      sources/              DataSource (интерфейс), FakeDataSource, по модулю на источник (S16)
      queue/                boss.ts, jobs/*.ts
      auth/                 TelegramInitDataVerifier, SessionManager
      config.ts             zod-валидация env, единственное место чтения process.env
      container.ts          сборка зависимостей (ручной DI через конструкторы)
    client/
      telegram.ts           TelegramBridge (обёртка над WebApp с фолбэком для веба)
      api.ts                типизированный клиент (генерация idempotency key)
      cv/                   PoseSource (MediaPipe), CameraController
    ui/                     примитивы (раздел 10), токены
  routes/
    (public)/               вход, ошибки
    (app)/                  +layout.svelte (навигация), +layout.server.ts (гард)
      +page.svelte          Home
      quests/  shop/  settings/  train/  awakening/
    api/                    +server.ts эндпоинты
  hooks.server.ts           сессия, Origin-проверка, rate limit, init очереди
drizzle/                    сгенерированные миграции
research/                   Python-прототип CV (вне основного приложения)
tests/                      e2e (Playwright)
```

Тесты юнитов лежат рядом с кодом: `*.test.ts`.

## 5. Правила кода: ООП, DRY, безопасность

**ООП**
- Сервисы, репозитории, клиенты, правила: классы с зависимостями через конструктор. Никаких глобальных синглтонов кроме `container.ts`.
- Полиморфизм через интерфейсы: `LlmClient`, `RepCounter`, `Clock`, `PenaltyPolicy`. Новое упражнение = новый класс `RepCounter`, без правки существующих (open/closed).
- Состояние сущностей с переходами (Quest) инкапсулировано в классе, переходы только через методы (`quest.complete(now)`, `quest.fail(now)`), недопустимый переход бросает `DomainError`.
- Композиция вместо наследования. Наследование допустимо только для `BaseRepository`.

**DRY**
- Один источник типов: zod-схема в `lib/types`, тип выводится через `z.infer`. Дублировать тип руками запрещено.
- Все игровые числа только в `RulesConfig`. Магические числа в логике запрещены.
- Общие UI-куски только из `lib/ui`. Самописные кнопки, модалки, инпуты в роутах запрещены.
- Время только через `Clock`. `Date.now()` и `new Date()` в домене и сервисах запрещены (детерминизм тестов).

**Безопасность** (подробно раздел 14): валидация zod на каждой границе, авторизация по `userId` в каждом запросе репозитория, секреты только в env, клиенту не доверяем результаты CV и расчёты.

**Прочее**
- TS strict, `noUncheckedIndexedAccess`, без `any` (исключения только с комментарием почему).
- Ошибки: `DomainError(code, message)`. Роуты мапят коды в HTTP-статусы в одном месте.
- Деньги и очки: целые числа.
- Все метки времени: `timestamptz`, UTC. День пользователя считается по его `timezone` из settings.

## 6. Схема БД (Drizzle)

```ts
// src/lib/server/db/schema.ts
import {
  pgTable, pgEnum, uuid, bigint, text, integer, boolean, real,
  timestamp, date, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const statEnum = pgEnum('stat', [
  'strength', 'hp', 'agility', 'intelligence', 'stamina', 'discipline', 'perception',
]);
export const questStatusEnum = pgEnum('quest_status', ['active', 'completed', 'failed', 'proposed', 'dismissed']);
export const questTypeEnum = pgEnum('quest_type', ['exercise', 'learning', 'project', 'habit', 'other', 'boss']);
export const onboardingPhaseEnum = pgEnum('onboarding_phase', ['questionnaire', 'calibration', 'active']);
export const createdByEnum = pgEnum('created_by', ['user', 'system', 'ai']);
export const eventKindEnum = pgEnum('event_kind', [
  'quest_completed', 'quest_failed', 'exercise_logged', 'purchase', 'adjustment',
]);
export const eventSourceEnum = pgEnum('event_source', ['manual', 'cv', 'system', 'ai']);
export const verificationEnum = pgEnum('verification', ['measured', 'self_reported', 'system']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'bigint' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name').notNull(),
  languageCode: text('language_code'),
  plan: text('plan').notNull().default('free'),     // 'free' | 'pro', меняется вручную до появления биллинга
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Кэш состояния персонажа. Источник истины: progress_events.
export const characters = pgTable('characters', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  level: integer('level').notNull().default(1),
  xpTotal: integer('xp_total').notNull().default(0),
  gold: integer('gold').notNull().default(0),
  statPoints: jsonb('stat_points').$type<Record<string, number>>().notNull().default({}),
  archetype: text('archetype').notNull().default('novice'),                       // кэш ArchetypeClassifier
  difficulty: jsonb('difficulty').$type<Record<string, { level: number; changedAt: string }>>()
    .notNull().default({}),                                                       // кэш DifficultyController, по областям
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Append-only журнал. Любое начисление/списание = строка здесь.
export const progressEvents = pgTable('progress_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  kind: eventKindEnum('kind').notNull(),
  source: eventSourceEnum('source').notNull(),
  verification: verificationEnum('verification').notNull(),
  xpDelta: integer('xp_delta').notNull().default(0),
  goldDelta: integer('gold_delta').notNull().default(0),
  statDeltas: jsonb('stat_deltas').$type<Record<string, number>>().notNull().default({}),
  refType: text('ref_type'),
  refId: uuid('ref_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('progress_events_user_idem_uq').on(t.userId, t.idempotencyKey),
  index('progress_events_user_created_idx').on(t.userId, t.createdAt),
]);

export const quests = pgTable('quests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  type: questTypeEnum('type').notNull(),
  status: questStatusEnum('status').notNull().default('active'),
  criteria: jsonb('criteria').$type<unknown>().notNull(),   // QuestCriteria (zod)
  reward: jsonb('reward').$type<unknown>().notNull(),       // Reward (zod)
  penalty: jsonb('penalty').$type<unknown>(),               // Penalty (zod), null = по RulesConfig
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdBy: createdByEnum('created_by').notNull().default('user'),
  templateKey: text('template_key'),                        // из QuestTemplateCatalog, null для ручных
  planDate: date('plan_date'),                              // локальная дата пользователя, для заданий планировщика
  difficulty: integer('difficulty').notNull().default(1),   // 1..10, снимок на момент создания
  startedAt: timestamp('started_at', { withTimezone: true }), // для боссов: начало отсчёта прогресса
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('quests_user_status_idx').on(t.userId, t.status),
  index('quests_deadline_idx').on(t.status, t.deadlineAt),
  uniqueIndex('quests_plan_uq').on(t.userId, t.templateKey, t.planDate), // планировщик не создаёт дубли
]);

export const onboardingProfiles = pgTable('onboarding_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  phase: onboardingPhaseEnum('phase').notNull().default('questionnaire'),
  answers: jsonb('answers').$type<unknown>(),               // OnboardingAnswers (zod)
  calibrationStartedAt: timestamp('calibration_started_at', { withTimezone: true }),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
});

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stat: statEnum('stat').notNull(),
  title: text('title').notNull(),
  weeklyTargetPoints: integer('weekly_target_points').notNull(),
  priority: integer('priority').notNull().default(2),       // 1..3, больше = важнее
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('goals_user_stat_uq').on(t.userId, t.stat)]);

// Кэш SignalAnalyzer. Воспроизводим из журнала, источником истины не является.
export const signalSnapshots = pgTable('signal_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  windowDays: integer('window_days').notNull(),
  report: jsonb('report').$type<unknown>().notNull(),       // SignalReport (zod)
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('signal_snapshots_user_idx').on(t.userId, t.computedAt)]);

export const shopItems = pgTable('shop_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => shopItems.id),
  itemTitle: text('item_title').notNull(),     // снимок на момент покупки
  price: integer('price').notNull(),           // снимок цены
  eventId: uuid('event_id').notNull().references(() => progressEvents.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exerciseSessions = pgTable('exercise_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientSessionId: uuid('client_session_id').notNull(),
  exercise: text('exercise').notNull(),
  reps: integer('reps').notNull(),
  durationSec: integer('duration_sec').notNull(),
  avgConfidence: real('avg_confidence').notNull(),
  verification: verificationEnum('verification').notNull(),
  eventId: uuid('event_id').references(() => progressEvents.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('exercise_sessions_user_client_uq').on(t.userId, t.clientSessionId)]);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('UTC'),
  locale: text('locale').notNull().default('ru'),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  cameraConsent: boolean('camera_consent').notNull().default(false),
  cameraConsentAt: timestamp('camera_consent_at', { withTimezone: true }),
});
```

Инварианты:
- Состояние персонажа = свёртка `progress_events`. Таблица `characters` обновляется **в той же транзакции**, что и вставка события. Есть команда `pnpm rebuild:characters` для сверки.
- Дубль начисления невозможен: unique `(user_id, idempotency_key)`. Повторная вставка = no-op, возвращается исходный результат.
- Миграции генерируются из схемы (`pnpm db:generate`), применяются только в деплой-шаге и в CI на эфемерном Postgres. Руками SQL не править.

Форматы idempotency key:
- `quest-completed:<questId>`
- `quest-failed:<questId>`
- `exercise:<clientSessionId>`
- `purchase:<clientRequestId>` (UUID, генерирует клиент)
- `source:<sourceKey>:<externalId>` (события внешних источников)

Таблица `data_source_connections` дописывается в S16 с бампом версии. Значения `event_source` ('github' и др.) добавляются append-only при реализации модуля.

## 7. Общие типы (контракты, zod v4)

```ts
// src/lib/types/index.ts
import { z } from 'zod';

export const StatKey = z.enum(['strength','hp','agility','intelligence','stamina','discipline','perception']);
export type StatKey = z.infer<typeof StatKey>;

export const ArchetypeKey = z.enum(['novice','athlete','scholar','builder','guardian']);
export type ArchetypeKey = z.infer<typeof ArchetypeKey>;
export const Phase = z.enum(['questionnaire','calibration','active']);
export type Phase = z.infer<typeof Phase>;
export const TimeWindow = z.enum(['morning','day','evening','night']);
export type TimeWindow = z.infer<typeof TimeWindow>;

export const ExerciseKey = z.enum(['pushup']);          // расширяется append-only
export type ExerciseKey = z.infer<typeof ExerciseKey>;

export const Verification = z.enum(['measured','self_reported','system']);
export const EventSource = z.enum(['manual','cv','system','ai']);

export const Reward = z.object({
  xp: z.number().int().min(0).max(10_000),
  gold: z.number().int().min(0).max(10_000),
  stats: z.partialRecord(StatKey, z.number().int().min(0).max(100)).default({}),
});
export type Reward = z.infer<typeof Reward>;

export const Penalty = z.object({
  xpRatio: z.number().min(0).max(1).optional(),
  statDeltas: z.partialRecord(StatKey, z.number().int().min(-100).max(0)).optional(),
});
export type Penalty = z.infer<typeof Penalty>;

export const QuestCriteria = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }),
  z.object({ kind: z.literal('reps'), exercise: ExerciseKey, target: z.number().int().min(1).max(1000) }),
  // босс: набрать N очков характеристики за период (прогресс считается по журналу)
  z.object({ kind: z.literal('stat_points'), stat: StatKey, target: z.number().int().min(1).max(10_000) }),
]);
export type QuestCriteria = z.infer<typeof QuestCriteria>;

export const QuestType = z.enum(['exercise','learning','project','habit','other','boss']);
export const QuestStatus = z.enum(['active','completed','failed','proposed','dismissed']);

export const CreateQuestInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  type: QuestType,
  criteria: QuestCriteria,
  reward: Reward,
  penalty: Penalty.nullable().default(null),
  deadlineAt: z.iso.datetime().nullable().default(null),
});
export type CreateQuestInput = z.infer<typeof CreateQuestInput>;

export const QuestView = z.object({
  id: z.uuid(), title: z.string(), description: z.string(),
  type: QuestType, status: QuestStatus,
  criteria: QuestCriteria, reward: Reward, penalty: Penalty.nullable(),
  deadlineAt: z.iso.datetime().nullable(), resolvedAt: z.iso.datetime().nullable(),
  difficulty: z.number().int().min(1).max(10), startedAt: z.iso.datetime().nullable(),
  progress: z.object({ current: z.number().int(), target: z.number().int() }).nullable(),
});
export type QuestView = z.infer<typeof QuestView>;

// basis: насколько можно доверять значению характеристики
export const StatBasis = z.enum(['measured','estimated','mixed','no_data']);
export const StatView = z.object({
  key: StatKey, value: z.number().int().min(0), basis: StatBasis,
});
export type StatView = z.infer<typeof StatView>;

export const CharacterView = z.object({
  level: z.number().int().min(1),
  xpTotal: z.number().int().min(0),
  xpIntoLevel: z.number().int().min(0),
  xpForNextLevel: z.number().int().min(1),
  gold: z.number().int().min(0),
  stats: z.array(StatView),
  activeQuests: z.array(QuestView),
  activity: z.object({ questsCompleted7d: z.number().int(), repsTotal7d: z.number().int(), streakDays: z.number().int() }),
  phase: Phase,
  archetype: ArchetypeKey,
  weakSpot: StatKey.nullable(),   // null без калибровки, без данных или без доступа к feature `signals`
});
export type CharacterView = z.infer<typeof CharacterView>;

export const ExerciseSessionInput = z.object({
  clientSessionId: z.uuid(),
  exercise: ExerciseKey,
  reps: z.number().int().min(0).max(1000),
  durationSec: z.number().int().min(1).max(3600),
  avgConfidence: z.number().min(0).max(1),
});
export type ExerciseSessionInput = z.infer<typeof ExerciseSessionInput>;

export const CreateShopItemInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  price: z.number().int().min(1).max(1_000_000),
});
export const PurchaseInput = z.object({ itemId: z.uuid(), clientRequestId: z.uuid() });

export const SettingsView = z.object({
  timezone: z.string(), locale: z.enum(['ru','en']),
  notificationsEnabled: z.boolean(),
  cameraConsent: z.boolean(),
});
export const UpdateSettingsInput = SettingsView.partial();

export const GoalInput = z.object({
  stat: StatKey,
  title: z.string().trim().min(1).max(80),
  weeklyTargetPoints: z.number().int().min(1).max(200),   // очков характеристики в неделю
  priority: z.number().int().min(1).max(3).default(2),
});
export const GoalView = GoalInput.extend({ id: z.uuid() });
export type GoalInput = z.infer<typeof GoalInput>;

export const OnboardingAnswers = z.object({
  goals: z.array(GoalInput).min(1).max(3),
  dailyMinutes: z.number().int().min(15).max(480),        // сколько времени в день готов тратить
  preferredWindow: TimeWindow,
  timezone: z.string(),                                    // IANA
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswers>;

export const StatSignal = z.object({
  stat: StatKey,
  sampleSize: z.number().int().min(0),                     // resolved задания области в окне
  completionRate: z.number().min(0).max(1).nullable(),
  points7d: z.number().int(), pointsPrev7d: z.number().int(),
  trend: z.number().int(),                                 // points7d - pointsPrev7d
  activeDays: z.number().int().min(0), streakDays: z.number().int().min(0),
  bestWindow: TimeWindow.nullable(),
  goalGap: z.number().min(0).max(1).nullable(),            // null, если цели нет
  confidence: z.enum(['low','ok']),
});
export const SignalReport = z.object({
  ready: z.boolean(),
  computedAt: z.iso.datetime(),
  windowDays: z.number().int(),
  stats: z.array(StatSignal),
  weakSpot: StatKey.nullable(),
});
export type SignalReport = z.infer<typeof SignalReport>;

export const ErrorBody = z.object({ code: z.string(), message: z.string() });
```

Коды `DomainError` и HTTP-статус (маппинг в одном модуле): `VALIDATION` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `ENTITLEMENT_REQUIRED` 403, `NOT_FOUND` 404, `INVALID_TRANSITION` 409, `INSUFFICIENT_FUNDS` 409, `CRITERIA_MISMATCH` 409, `ALREADY_ONBOARDED` 409, `CV_REJECTED` 422, `RATE_LIMITED` 429.

## 8. Контракты

### 8.1 HTTP API

Все ответы JSON. Все мутации требуют сессию и `Idempotency-Key` там, где указано. Тела валидируются zod. Ошибка = `ErrorBody` + статус.

| Метод и путь | Auth | Вход | Выход | Заметки |
|---|---|---|---|---|
| GET `/api/health` | нет | | `{ok:true}` | для деплоя |
| POST `/api/auth/telegram` | нет | `{initData:string}` | `{ok:true}` + cookie | проверка подписи, раздел 14 |
| POST `/api/auth/logout` | да | | `{ok:true}` | |
| GET `/api/me` | да | | `CharacterView` | |
| GET `/api/quests?status=` | да | query | `QuestView[]` | status: active, completed, failed, proposed |
| POST `/api/quests` | да | `CreateQuestInput` | `QuestView` | |
| POST `/api/quests/:id/complete` | да | | `CharacterView` | только `criteria.kind=manual`, иначе `CRITERIA_MISMATCH` |
| GET `/api/shop/items` | да | | `ShopItemView[]` | |
| POST `/api/shop/items` | да | `CreateShopItemInput` | `ShopItemView` | |
| POST `/api/shop/purchases` | да | `PurchaseInput` | `{purchase, character: CharacterView}` | идемпотентно по `clientRequestId` |
| GET `/api/shop/purchases` | да | | `PurchaseView[]` | |
| POST `/api/exercise-sessions` | да | `ExerciseSessionInput` | `{verification, xpAwarded, character: CharacterView}` | идемпотентно по `clientSessionId` |
| GET `/api/settings` | да | | `SettingsView` | |
| PATCH `/api/settings` | да | `UpdateSettingsInput` | `SettingsView` | |
| GET `/api/onboarding` | да | | `{phase, calibrationDay, calibrationTotalDays}` | `calibrationDay` = null вне калибровки |
| POST `/api/onboarding` | да | `OnboardingAnswers` | то же, что GET | один раз, повтор = `ALREADY_ONBOARDED` |
| GET `/api/goals` | да | | `GoalView[]` | |
| PUT `/api/goals` | да | `{goals: GoalInput[]}` | `GoalView[]` | заменяет набор (1-3), фазу не меняет |
| GET `/api/signals` | да | | `SignalReport` | feature `signals` |
| POST `/api/quests/:id/accept` | да | | `QuestView` | только `proposed` босс, переводит в `active`, ставит `startedAt` |
| POST `/api/quests/:id/dismiss` | да | | `QuestView` | только `proposed` босс, переводит в `dismissed` |

Идемпотентность: повтор запроса с тем же ключом возвращает тот же результат, второй записи нет. Для `complete` ключ выводится из `questId`.

### 8.2 Очередь (pg-boss)

| Топик | Триггер | Payload | Идемпотентность и ретраи |
|---|---|---|---|
| `quest.expire-sweep` | cron `*/5 * * * *` | `{}` | Ищет `active` задания с `deadline_at < now`, для каждого вызывает `QuestService.fail(questId)` в своей транзакции. Идемпотентно: guard по статусу + ключ `quest-failed:<id>`. Ретраи 3, backoff экспоненциальный |
| `demo.echo` | вручную (скелет) | `{text:string}` | только для проверки очереди в CI |
| `daily.plan` | cron `0 * * * *` | `{}` | Каждый час выбирает пользователей, у которых локальный час = `plan.localHour` и нет плана на локальную дату, и вызывает `PlannerService.planDay`. Идемпотентно: unique `quests_plan_uq`. Ошибка одного пользователя не блокирует остальных. Ретраи 3 |
| `boss.propose` | cron `30 * * * *` | `{}` | Для пользователей с `phase=active`, без активного и предложенного босса, с `weakSpot != null` и вне `boss.cooldownDays` после dismissed создаёт босса `proposed`. Идемпотентно: guard по наличию `proposed/active` босса |
| `source.sync` | cron и вручную (S16) | `{userId:uuid, sourceKey:string}` | `singletonKey = userId:sourceKey`. События с ключом `source:<key>:<externalId>`, повтор = no-op |
| `report.generate` | зарезервирован (S9) | `{userId:uuid, period:'week'|'month'}` | `singletonKey = userId:period:<дата>` |

Правило: каждый хендлер идемпотентен, на каждый есть тест «запусти дважды, эффект один».

### 8.3 События домена (результаты CV и пр.)

CV не пишет в игру напрямую. Цепочка: `PoseSource` -> `RepCounter` -> `ExerciseSessionInput` -> `ExerciseService.validate` -> `ProgressEvent` -> `ProgressionEngine`. Клиентский результат считается недоверенным и проходит серверную проверку правдоподобия (раздел 12).

### 8.4 Источники данных (DataSource)

Любой внешний источник (камера уже отдельный путь, далее GitHub, календарь) подключается модулем с единым интерфейсом и пишет в тот же журнал.

```ts
interface DataSource {
  readonly key: string;                       // 'github', 'calendar', ...
  readonly verification: Verification;        // для внешних систем 'measured'
  sync(userId: string, since: Date): Promise<ProgressEventInput[]>;
}
```

Правила: модуль возвращает события с `idempotencyKey = source:<key>:<externalId>`; маппинг события в характеристики берётся из `RulesConfig.sourceStatMap`, в модуле чисел нет; на каждый модуль есть `Fake*` реализация и контрактный тест; доступ к модулю проверяется через `Entitlements` (feature `integrations`).

## 9. Правила прогрессии (`RulesConfig`)

Один объект, валидируется zod при старте, подменяется в тестах.

```ts
export const DEFAULT_RULES: RulesConfig = {
  levelCurve: { base: 100, exponent: 1.5 },        // xpForLevel(n) = round(base * n^exponent), n = текущий уровень
  startingGold: 0,
  failPenalty: { xpRatio: 0.5, statDeltas: { discipline: -1 } },
  onTimeDisciplineBonus: 1,                        // +discipline за выполнение в срок
  exercises: {
    pushup: {
      xpPerRep: 2,
      statPer: { strength: { perReps: 10, points: 1 }, stamina: { perReps: 25, points: 1 } },
      maxRepsPerSec: 1.2,
    },
  },
  cv: { minConfidence: 0.6, dailyXpCap: 300 },
  stats: {
    // источники по характеристикам, для расчёта basis
    perception: { sources: [] },                   // нет объективного источника: basis = no_data
  },
};
```

Правила:
- `xpForLevel(n)`: XP, нужный чтобы перейти с уровня n на n+1. Уровень = максимальный n, для которого сумма порогов <= `xpTotal`. Чистая функция, монотонная.
- Провал: `xp = -round(reward.xp * xpRatio)`, но `xpTotal` не опускается ниже начала текущего уровня (уровень не падает). Gold не списывается.
- Характеристика = сумма `statDeltas` из журнала, минимум 0.
- `StatView.basis`: `measured`, если все вклады из событий `measured|system`; `estimated`, если все `self_reported`; `mixed`, если оба типа; `no_data`, если вкладов нет. UI обязан отличать `estimated` от `measured` визуально (бейдж).
- Дисциплина: +`onTimeDisciplineBonus` при выполнении в срок (или без срока), -1 при провале.
- Реплеи для отладки: `ProgressionEngine.apply(state, event)` чистая функция, весь журнал воспроизводим.

## 9.1 Универсальная механика: Система диагностирует и ведёт

Принцип: в коде нет ничего персонального. Персонализация = цели из анкеты + журнал событий. Выводы (слабое звено, сложность, архетип) считают детерминированные чистые классы в `lib/domain`, воспроизводимые по журналу. LLM только объясняет готовые выводы словами и не вычисляет и не выбирает ничего (требование ТЗ: ИИ не выдумывает факты).

**Фазы** (`onboarding_profiles.phase`): `questionnaire` -> `calibration` -> `active`. Откат назад невозможен.
- `questionnaire`: пользователь заполняет анкету (`OnboardingAnswers`). Layout-гард ведёт на `/awakening`.
- `calibration`: `calibration.days` дней. Планировщик ставит лёгкие задания по всем областям (сложность 1), анализатор выводов не выдаёт (`ready=false`, `weakSpot=null`).
- `active`: все механики. Переход в `active` ленивый: `OnboardingService.resolvePhase(profile, now)` (чистая функция) вызывается при чтении и пишет фазу, если `now >= calibrationStartedAt + days`. Досрочно перейти нельзя.

**Классы домена**
- `SignalAnalyzer.analyze(input, rules): SignalReport`
- `DifficultyController.next(current, recentResolved, now, rules): DifficultyState`
- `DailyPlanner.plan(input, rules): PlannedQuest[]`, каталог `QuestTemplateCatalog`
- `BossPlanner.propose(report, goals, now, rules): BossProposal | null`
- `ArchetypeClassifier.classify(statPoints30d, current, rules): ArchetypeKey`

**SignalAnalyzer.** Окно `signals.windowDays` (14). На каждую характеристику `s` считается:
- `sampleSize`: число resolved (completed + failed) заданий области `s` в окне.
- `completionRate = completed / resolved`, `null` при `resolved = 0`.
- `points7d`, `pointsPrev7d`: сумма положительных `statDeltas[s]` из журнала за последние 7 и за предыдущие 7 дней. `trend = points7d - pointsPrev7d`.
- `activeDays`: число локальных дней (по `timezone`) с событием по `s`. `streakDays`: подряд идущие дни до сегодня.
- `bestWindow`: окна по локальному часу выполнения (`morning` 5-12, `day` 12-17, `evening` 17-22, `night` 22-5), побеждает с наибольшей долей выполненных, если выполненных >= `signals.minSamples`, иначе `null`.
- `goalGap = max(0, weeklyTargetPoints - points7d) / weeklyTargetPoints` при наличии цели, иначе `null`.
- `confidence = 'low'`, если `sampleSize < signals.minSamples`, иначе `'ok'`.

`ready = phase == active && суммарно resolved >= signals.minTotalResolved`.
`weakSpot`: среди областей с целью и `confidence == ok` максимум `score = goalGap * priorityWeight[priority]`. Ничья: меньший `completionRate`, затем порядок `StatKey`. `null`, если `!ready` или нет областей с `score > 0`.

**DifficultyController.** Уровень `d` от 1 до 10 на область. Берутся последние `difficulty.sampleQuests` (10) resolved заданий области (минимум `difficulty.minSample` = 5). Если доля выполненных > `bandHigh` (0.8), то `d + 1`. Если < `bandLow` (0.7), то `d - 1`. Иначе без изменений. Не чаще раза в `difficulty.cooldownDays` (3) на область. Пересчёт синхронно при resolve задания (`QuestService`), идемпотентно по `questId`. Масштаб шаблона: `scale(d) = 1 + difficulty.stepPct * (d - 1)` (stepPct 0.15) применяется к `target` критерия и к `reward.xp`.

**DailyPlanner.** Запускается джобом `daily.plan` в `plan.localHour` (6) по часовому поясу пользователя. Бюджет: `answers.dailyMinutes * plan.budgetShare` (0.6). Число заданий от 1 до `plan.maxQuests` (5). Отбор:
- `calibration`: по одному шаблону на область, начиная с областей с целями, сложность 1.
- `active`: (1) шаблон под `weakSpot`, (2) шаблон под активного босса, (3) остальные по приоритету целей. Набор прекращается, когда сумма `estMinutes` превысила бы бюджет.
- План `free`: сложность всегда 1, шаг (1) пропускается (нет feature `signals`).
`deadlineAt` = конец локального дня `planDate`. Задание получает `templateKey`, `planDate`, `difficulty`, `createdBy = system`.

**Каталог шаблонов (стартовый, расширяется append-only).** Базовые значения при `d = 1`:

| key | область | тип | критерий | estMinutes |
|---|---|---|---|---|
| `pushups` | strength | exercise | reps pushup, 10 | 5 |
| `mobility` | agility | exercise | manual (разминка 10 минут) | 10 |
| `cardio` | stamina | exercise | manual (20 минут движения) | 20 |
| `sleep` | hp | habit | manual (лечь спать вовремя) | 5 |
| `study` | intelligence | learning | manual (30 минут учёбы) | 30 |
| `reading` | intelligence | learning | manual (15 страниц) | 20 |
| `focus` | discipline | habit | manual (главное дело дня до полудня) | 25 |
| `deep_work` | discipline | project | manual (45 минут без отвлечений) | 45 |
| `mindful` | perception | habit | manual (10 минут без телефона, наблюдение) | 10 |

Награды шаблонов (`reward`) задаются в каталоге в `RulesConfig.templates`, а не в коде классов.

**BossPlanner.** Босс предлагается при `phase == active`, `weakSpot != null`, нет `active` или `proposed` босса, и после `boss.cooldownDays` (7) с момента `dismissed`. Босс = задание `type=boss`, `status=proposed`, `criteria = { kind: 'stat_points', stat: weakSpot, target }`:
`target = max(boss.minTarget, ceil(boss.weeks * (points7d + boss.stretch * (weeklyTargetPoints - points7d))))`, `boss.weeks` = 4, `boss.stretch` = 0.5, `boss.minTarget` = 5.
`deadlineAt = startedAt + boss.weeks * 7 дней` (ставится при accept). `reward.xp = boss.rewardXpPerPoint * target` (10), `reward.gold = boss.rewardGoldPerPoint * target` (3), `reward.stats = { [stat]: boss.rewardStatPoints }` (3). Одновременно только один активный босс.
Прогресс = сумма положительных `statDeltas[stat]` из журнала с `createdAt >= startedAt`. После каждой вставки события `BossService.evaluate(userId)` проверяет активного босса: при `progress >= target` босс завершается (`quest-completed:<id>`). Просрочка обрабатывается `quest.expire-sweep` (штраф по общим правилам).

**ArchetypeClassifier.** Окно `archetype.windowDays` (30). `share[s]` = доля очков области `s` в сумме. Если сумма очков < `archetype.minPoints` (20), то `novice`. Иначе для каждого архетипа `score = sum(w[s] * share[s]) / sum(w)`; побеждает максимум. Смена архетипа происходит, только если новый лидер превосходит текущий на `archetype.hysteresis` (0.1). Пересчёт при записи события, результат в `characters.archetype`.

| archetype | веса |
|---|---|
| `athlete` | strength 1, stamina 1, agility 1 |
| `scholar` | intelligence 1, perception 1 |
| `builder` | discipline 1, intelligence 0.5 |
| `guardian` | hp 1, discipline 0.5 |

**Расширение `RulesConfig`** (значения по умолчанию из текста выше): `calibration.days = 7`, `signals { windowDays: 14, minSamples: 5, minTotalResolved: 10, cacheMinutes: 30, priorityWeight: {1: 0.5, 2: 1, 3: 1.5} }`, `difficulty { sampleQuests: 10, minSample: 5, bandLow: 0.7, bandHigh: 0.8, cooldownDays: 3, stepPct: 0.15 }`, `plan { localHour: 6, budgetShare: 0.6, maxQuests: 5 }`, `boss { weeks: 4, stretch: 0.5, minTarget: 5, cooldownDays: 7, rewardXpPerPoint: 10, rewardGoldPerPoint: 3, rewardStatPoints: 3 }`, `archetype { windowDays: 30, minPoints: 20, hysteresis: 0.1, catalog }`, `goalPresets { light: 5, medium: 10, high: 20 }` (очков в неделю для анкеты), `templates`, `sourceStatMap`.

## 9.2 Планы и доступ (монетизация)

```ts
type PlanKey = 'free' | 'pro';
type FeatureKey = 'signals' | 'adaptive_difficulty' | 'auto_boss' | 'integrations' | 'ai_explain' | 'camera';

interface Entitlements {
  has(userId: string, feature: FeatureKey): Promise<boolean>;
  require(userId: string, feature: FeatureKey): Promise<void>;   // бросает ENTITLEMENT_REQUIRED
}
```

- План читается из `users.plan`, маппинг план -> features в `PLAN_FEATURES` (config). Предварительно: `free` = без платных features (журнал, ручные задания, ежедневный план со сложностью 1, уровни, магазин, настройки); `pro` = все features. Разделение временное, финализируется в разделе 20.
- Проверка только на сервере в сервисах (`SignalService`, `DifficultyController` через `QuestService`, `BossService`, `ExerciseService`, источники). UI скрывает недоступное, но защитой не является.
- Dev: `ENTITLEMENTS_ALL=true` включает все features. Приложение отказывается стартовать при `NODE_ENV=production` и включённом флаге.
- Логика журнала и прогрессии от плана не зависит: free-пользователь получает те же правила XP, уровней и штрафов.

## 10. UI-компоненты (собираются в Stage 0)

База: Tailwind + `bits-ui` для интерактивных. Все в `lib/ui`, экспорт из `lib/ui/index.ts`. Показываются в kitchen-sink роуте `/_kitchen` (только dev).

| Компонент | Пропсы (эскиз) |
|---|---|
| `Button` | `variant: 'primary'\|'ghost'\|'danger'`, `size`, `loading`, `disabled`, `onclick` |
| `Panel` | `title?`, `glow?: boolean`, `children` (системное окно: рамка, подсветка) |
| `ProgressBar` | `value`, `max`, `label?`, `tone?: 'xp'\|'hp'\|'neutral'` |
| `StatRow` | `stat: StatKey`, `value`, `basis: StatBasis` |
| `Badge` | `tone: 'info'\|'success'\|'warn'\|'danger'\|'muted'`, `children` |
| `Card` | `children`, `onclick?` |
| `Modal` | `open` (bindable), `title`, `children`, `actions` |
| `Input` | `label`, `value` (bindable), `type`, `error?`, `placeholder` |
| `Textarea` | как `Input` |
| `Select` | `label`, `options`, `value` (bindable) |
| `Toggle` | `label`, `checked` (bindable) |
| `Tabs` | `items`, `value` (bindable) |
| `BottomNav` | `items: NavItem[]` (данные из `nav.ts`) |
| `Toast` | `toast(message, tone)` через store |
| `EmptyState` | `title`, `hint?`, `action?` |
| `Skeleton` | `lines`, `height` |
| `QuestCard` | `quest: QuestView`, `onComplete?` |
| `BossCard` | `quest: QuestView` (type boss), `onAccept?`, `onDismiss?`, `reason?` |
| `SignalCard` | `signal: StatSignal`, `isWeakSpot`, `locked?` |
| `Stepper` | `steps`, `value` (bindable), `onfinish` |

Навигация задаётся данными: `src/lib/ui/nav.ts` = массив `{ href, label, icon }`. Разметку layout для нового пункта не править.

Токены дизайна (`lib/ui/tokens.css`, CSS-переменные): фон `#070b14`, панель `#0d1424`, рамка `#1e3a5f`, акцент `#3b9eff` (подсветка), текст `#e6edf7`, приглушённый `#7d8aa3`, успех `#37d67a`, предупреждение `#f5b942`, опасность `#ff5c6c`. Шрифт: системный без засечек + моноширинный для чисел. Только тёмная тема. Safe-area для iOS.

## 11. Telegram

- `TelegramBridge` (`lib/client/telegram.ts`): `ready()`, `expand()`, `initData`, тема, haptics, закрытие. Вне Telegram работает заглушка (веб-режим).
- Вход: клиент шлёт `initData` на `/api/auth/telegram`, сервер создаёт или находит пользователя по `telegramId`.
- Dev-режим: `DEV_AUTH_BYPASS=true` создаёт тестового пользователя. Приложение **отказывается стартовать**, если `NODE_ENV=production` и bypass включён.

## 12. Компьютерное зрение

Модули:
- `domain/cv/geometry.ts`: `angle(a, b, c)` (градусы, 2D/3D), `visible(landmark, minVisibility)`.
- `domain/cv/RepCounter.ts`: интерфейс `{ push(frame: PoseFrame): void; reps: number; reset(): void; confidence: number }`.
- `domain/cv/PushUpCounter.ts`: угол локтя (плечо-локоть-запястье), сглаживание (скользящее среднее), гистерезис: фаза `down` при угле < 90, `up` при угле > 160, повтор = `up -> down -> up`. Кадры с низкой видимостью суставов пропускаются, `confidence` = средняя видимость по использованным кадрам. Пороги в конфиге счётчика.
- `client/cv/PoseSource.ts`: обёртка над `PoseLandmarker` (MediaPipe Tasks Vision), режим VIDEO, GPU delegate с фолбэком на CPU, отдаёт `PoseFrame`.
- `client/cv/CameraController.ts`: запрос камеры только при `cameraConsent=true`, остановка треков при выходе со страницы, камера не включается сама.

Серверная проверка правдоподобия (`ExerciseService`):
1. `reps <= durationSec * maxRepsPerSec` иначе `CV_REJECTED`.
2. `avgConfidence >= cv.minConfidence`, иначе сессия сохраняется как `self_reported` (XP по правилам self_reported не выше `xpPerRep`, характеристики не растут).
3. Суточный лимит XP от CV (`dailyXpCap`, считается по `timezone` пользователя), сверх лимита `xpDelta=0`.
4. `cameraConsent` должен быть true, иначе `FORBIDDEN`.
5. Идемпотентно по `clientSessionId`.

Честное ограничение: клиентские данные можно подделать. Для личного приложения приемлемо, поэтому п.1-3. Оценка техники (качество движения) в MVP не делается и не показывается как факт.

Прототип Python (`research/`, Holistic + OpenCV): для исследования углов и порогов, не часть сборки и не деплоится.

## 13. Тесты

Тесты привязаны к слайсу (один слайс = один PR). Слайс мёрджится только с тестами, без них CI красный.

Принцип: **тесты выводятся из критериев приёмки слайса, не из реализации.** Тест кодирует контракт, не зеркалит код. Цель: не получить зелёные тесты, подтверждающие баги.

Обязательные типы на слайс:
- **Контрактные на стыках.** Ответы API валидируются схемами из `lib/types`. Payload джоба валидируется схемой. Фейковые клиенты валидируют вход и падают на мусоре.
- **Идемпотентность.** Каждый хендлер джоба и каждая мутация с ключом: тест «дважды с тем же ключом, эффект ровно один» (XP, gold, запись в журнале).
- **Путь ошибки.** Недопустимый переход, нехватка Gold, отклонённая CV-сессия, ошибка внешнего клиента через фейк, ретрай.
- **Property-based (fast-check) на чистой логике:** `xpForLevel` монотонна; уровень не падает при штрафе; `balance == sum(events)`; повтор события не меняет итог; `PushUpCounter` на синтетических синусоидах угла считает ровно N повторов, шум внутри гистерезиса не создаёт повторов, reps не убывают.
- **Интеграционные** на реальном Postgres (в CI эфемерный): репозитории, транзакции, уникальные индексы.
- **E2E (Playwright):** smoke по сквозным сценариям слайса (мобильный viewport, `DEV_AUTH_BYPASS`).

Время: `FixedClock`. Случайность: только через инъекцию. Внешние сервисы: только фейки.

Для сессий Claude Code: подход тестов фиксирует skill `engineering:testing-strategy`, ревью своего диффа по skill `engineering:code-review`, решения по контрактам и слайсингу оформляются как ADR (skill `engineering:architecture`) в `docs/adr/` при необходимости.

## 14. Безопасность

- **Telegram auth:** проверка `initData`: HMAC-SHA256, ключ = HMAC-SHA256("WebAppData", BOT_TOKEN), сравнение constant-time, `auth_date` не старше 1 часа. Реализует `TelegramInitDataVerifier`, покрыт тестами (валидная, подделанная, просроченная подпись).
- **Сессия:** подписанный случайный токен, хранение хэша в БД или подписанный JWT с коротким сроком; cookie `HttpOnly; Secure; SameSite=Lax`, имя с префиксом `__Host-` в проде.
- **Авторизация:** каждый метод репозитория принимает `userId` и фильтрует по нему. Доступ к чужим данным невозможен по построению. Тест на каждый агрегат: пользователь B не видит данные A.
- **Валидация:** zod на каждом входе (body, query, params). Лимиты длин и диапазонов заданы схемами.
- **CSRF/Origin:** в `hooks.server.ts` для всех не-GET проверяется `Origin`/`Host`. JSON API требует `Content-Type: application/json`.
- **Rate limit:** на `/api/auth/*` и мутации (in-memory на процесс, достаточно для одного инстанса).
- **Заголовки:** CSP (self, wss/https для API, `mediastream`/`blob` для камеры, `cdn` для wasm MediaPipe закреплён явно), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy: camera=(self)`. Frame-ancestors разрешает Telegram.
- **Секреты:** только env, читаются в `config.ts`, не логируются, не попадают на клиент (только `PUBLIC_*`). `.env` в `.gitignore`, `.env.example` без значений.
- **SQL:** только Drizzle (параметризация), сырой SQL запрещён без ревью.
- **Приватность:** видео и кадры не сохраняются и не отправляются. Логи без PII (без initData, токенов, текстов заданий).
- **Зависимости:** `pnpm audit` в CI (не блокирует, но показывается), lockfile обязателен.
- **LLM (S9):** в промпт уходят только агрегаты и тексты самого пользователя. Ответ ИИ не пишет в журнал напрямую, только черновики, которые подтверждает пользователь. Выводы ИИ маркируются как предположения.

## 15. Конвенции коммитов, PR и комментариев

Язык: английский для коммитов, PR, комментариев в коде. Общение с владельцем проекта на русском.

Автор: все коммиты строго от `aurusxd <nikitapopov20021@mail.ru>`. Строки `Co-authored-by` в коммитах и PR не добавлять. Перед первым коммитом проверить `git config user.name` и `git config user.email`.

- **Формат коммита всегда:** `type(scope): summary`. `type`: `feat|fix|test|refactor|chore|docs`. `summary` в императиве, строчными, без точки, до ~50 символов. Тело только если нужно объяснить *почему*.
- Коммитить по ходу, маленькими логическими шагами после каждого осмысленного изменения. Каждый коммит по возможности проходит тайпчек.
- Ветка на задачу: `s<номер>-<кратко>` или `0.<n>-<кратко>`. PR в `main` даже в одиночку (CI-гейт). Merge только при зелёном CI.
- PR: краткий заголовок, тело: что делает слайс, какие контракты и типы затрагивает, чем покрыт тестами.
- Комментарии кратко, объясняют *почему*, а не пересказывают код. Закомментированный код в PR не оставлять.
- Проза (комментарии, PR, документы): активный залог, без em-dash, без филлеров.

## 16. Definition of Done (одна задача = один слайс)

- `pnpm check` (svelte-check, tsc) без ошибок
- `pnpm lint` (eslint + prettier) чисто
- `pnpm test` зелёный (vitest, включая интеграционные)
- `pnpm test:e2e` зелёный для затронутого сценария
- `pnpm build` проходит
- Тесты по разделу 13: из критериев приёмки, идемпотентность для каждой мутации и джоба, контрактные на стыках
- Контракты не выдуманы: всё из этого файла, либо файл обновлён с бампом версии
- UI собран из `lib/ui`
- Нет `console.log`, закомментированного кода, секретов в диффе
- Версия ядра и changelog обновлены, если менялись контракты

## 17. Stage 0: каркас

Цель: всё общее собрано заранее, чтобы слайсы были только про фичу. Порядок строгий, по одному PR на пункт. Фичи (S1+) не начинаются, пока не пройден чек-лист.

| # | Задача | Результат |
|---|---|---|
| 0.1 | Репозиторий и тулчейн | pnpm, SvelteKit, TS strict, eslint, prettier, svelte-check, vitest, Playwright, fast-check, lefthook (pre-commit: lint-staged), `.editorconfig`, структура папок раздела 4 |
| 0.2 | CI/CD | GitHub Actions. **PR-гейт:** check, lint, vitest с Postgres service, миграции на эфемерном Postgres, build, e2e smoke, без деплоя. **Деплой на merge в main:** на VPS (docker compose: app + postgres + caddy), миграции в деплой-шаге, healthcheck `/api/health`. Branch protection на main |
| 0.3 | Конфиг | `config.ts` (zod-env, `DEEPSEEK_API_KEY` необязателен), `.env.example`, приложение стартует без реальных секретов (`FakeLlmClient`, `DEV_AUTH_BYPASS`) |
| 0.4 | БД | `schema.ts` раздела 6, первая миграция, `client.ts`, `seed.ts` (профиль `newbie`: тестовый пользователь, 3 задания, 2 награды; профиль `veteran`: пройденная калибровка, 3 цели, ~30 дней синтетических событий с известным слабым звеном для golden-тестов), `pnpm db:*` скрипты |
| 0.5 | Основа кода | `Clock`, `DomainError` + мапа в HTTP, `BaseRepository`, `container.ts`, zod-типы раздела 7, `Entitlements` (интерфейс + реализация по `users.plan`, раздел 9.2) |
| 0.6 | Домен (ядро) | `RulesConfig` + `DEFAULT_RULES`, `LevelCurve`, `ProgressionEngine`, `CharacterProjector` с юнит и property-тестами |
| 0.7 | Авторизация | `TelegramInitDataVerifier`, `SessionManager`, `AuthService`, `/api/auth/*`, гард в `(app)/+layout.server.ts`, dev bypass с защитой |
| 0.8 | UI-примитивы | Все компоненты раздела 10, токены, `/_kitchen` |
| 0.9 | Каркас приложения | `(app)/+layout.svelte`, `BottomNav` (данные в `nav.ts`), `TelegramBridge`, `Toast`, страницы-заглушки Quests/Shop/Settings, обработка ошибок |
| 0.10 | Очередь | pg-boss в `hooks.server.ts` (init), `demo.echo`, `quest.expire-sweep`, `daily.plan`, `boss.propose` зарегистрированы (пустые хендлеры до S3, S11, S14) |
| 0.11 | Фейки внешних клиентов | `LlmClient` интерфейс + `FakeLlmClient` (+ контрактный тест фейка) |
| 0.12 | Эталонный слайс | S1 целиком (ниже), задеплоен на VPS |

**Чек-лист «скелет готов»** (все пункты зелёные):
- [ ] CI зелёный на тривиальном PR
- [ ] layout, навигация и гард авторизации в main
- [ ] UI-примитивы отрисованы в `/_kitchen`
- [ ] очередь выполняет `demo.echo` в тесте
- [ ] миграции проходят на эфемерном Postgres в CI
- [ ] `FakeLlmClient` проходит контрактный тест
- [ ] seed создаёт данные, приложение стартует без реальных секретов
- [ ] S1 (эталон) в main и задеплоен на VPS
- [ ] тесты изоляции пользователей (A не видит данные B) проходят для `characters` и `quests`

Эталонный слайс S1 является **шаблоном**: все следующие слайсы повторяют его раскладку (route -> service -> repository -> domain, типы из `lib/types`, тесты рядом).

## 18. Слайсы фич

Каждый слайс: вертикальный, сверху донизу (домен, сервис, репозиторий, API, страница, тесты), один PR. Порядок фиксирован:

`S1 -> S10 -> S2 -> S3 -> S11 -> S4 -> S5 -> S6 -> S12` (MVP), затем `S7 -> S13 -> S14 -> S15 -> S8 -> S9 -> S16`.

Номера S10-S16 добавлены в v2 и сохраняют нумерацию S1-S9 (описаны в порядке номеров ниже).

### S1. Вход и главная (эталон)
- **Цель:** открыть приложение в Telegram, увидеть персонажа.
- **Домен:** `CharacterProjector`, `LevelCurve`, `StatCalculator` (basis).
- **API:** `POST /api/auth/telegram`, `GET /api/me`.
- **UI:** `routes/(app)/+page.svelte`: уровень, `ProgressBar` XP, `StatRow` x7, блок активных заданий (`QuestCard`), краткая статистика (`activity`), быстрые переходы. Компоненты: Panel, ProgressBar, StatRow, Badge, QuestCard, Skeleton, EmptyState.
- **Критерии приёмки:** новый пользователь получает персонажа 1 уровня с нулевыми характеристиками, профиль онбординга в фазе `questionnaire`, `archetype = novice`, `weakSpot = null`; уровень и прогресс считаются по журналу; характеристики показывают basis, perception = `no_data`; невалидная подпись initData даёт 401.
- **Тесты:** контракт `CharacterView`; property: `xpIntoLevel < xpForNextLevel`; верификатор initData (валидная, подделка, просрочка); e2e: открыть главную, увидеть уровень.

### S2. Задания: создание и ручное выполнение
- **Цель:** создавать задания и закрывать вручную с наградой.
- **Домен:** `Quest` (state machine: active -> completed|failed), `ProgressionEngine` для `quest_completed`.
- **API:** `GET/POST /api/quests`, `POST /api/quests/:id/complete`.
- **UI:** `quests/`: Tabs (активные, выполненные, проваленные), форма создания в `Modal`, QuestCard, срок и награда в карточке, Toast с результатом.
- **Критерии:** выполнение начисляет XP, Gold, статы и `discipline` (если в срок); повторное выполнение не начисляет второй раз; нельзя выполнить `reps`-задание вручную; чужое задание недоступно; повышение уровня отражается на главной.
- **Тесты:** идемпотентность `complete` (дважды, эффект один); недопустимый переход; изоляция пользователей; property: `balance == sum(events)`; e2e: создать и выполнить задание, XP вырос.

### S3. Провалы, штрафы, просрочка
- **Цель:** просроченные задания проваливаются автоматически, применяется штраф.
- **Домен:** `PenaltyPolicy` (xpRatio, уровень не падает).
- **Очередь:** хендлер `quest.expire-sweep`.
- **API:** без новых, обновляется вывод `/api/quests?status=failed`.
- **UI:** вкладка «проваленные», Badge «просрочено», уведомление при следующем открытии.
- **Критерии:** задание после `deadlineAt` переходит в failed, один раз; XP уменьшается на `xpRatio`, но не ниже начала уровня; `discipline -1`; Gold не списывается.
- **Тесты:** джоб дважды, эффект один; джоб с ошибкой в одном задании не блокирует остальные; property: штраф никогда не понижает уровень; `FixedClock`.

### S4. Магазин
- **Цель:** тратить Gold на личные награды.
- **Домен:** правило покупки (хватает ли Gold), событие `purchase` (отрицательный `goldDelta`).
- **API:** `GET/POST /api/shop/items`, `POST/GET /api/shop/purchases`.
- **UI:** `shop/`: баланс, список наград (Card), создание награды (Modal), подтверждение покупки, история.
- **Критерии:** покупка списывает Gold ровно один раз; при нехватке `INSUFFICIENT_FUNDS` и баланс не меняется; цена фиксируется снимком в покупке; повтор с тем же `clientRequestId` не списывает второй раз.
- **Тесты:** идемпотентность; конкурентные покупки на пределе баланса (баланс не уходит в минус, транзакция с блокировкой строки); изоляция.

### S5. Настройки и согласие на камеру
- **Цель:** управление параметрами, явное согласие на камеру.
- **API:** `GET/PATCH /api/settings`.
- **UI:** `settings/`: timezone, язык, уведомления (Toggle), согласие на камеру с пояснением («видео не сохраняется и не отправляется»), раздел «О системе» (версия ядра, версия сборки).
- **Критерии:** `cameraConsentAt` проставляется при включении; отзыв согласия блокирует `/api/exercise-sessions`; значения валидируются (timezone из IANA).
- **Тесты:** контракт; невалидный timezone; изоляция.

### S6. Камера: отжимания и CV-события
- **Цель:** посчитать отжимания через камеру и начислить прогресс.
- **Домен:** `geometry`, `PushUpCounter`, правила `exercises.pushup`, интеграция с `reps`-заданиями (прогресс по сумме reps за период до выполнения).
- **Клиент:** `PoseSource`, `CameraController`, `routes/(app)/train`: превью камеры, счётчик, старт/стоп, итог, отправка результата.
- **API:** `POST /api/exercise-sessions`.
- **Критерии:** без согласия камера не включается; результат `reps` проходит серверную проверку правдоподобия; нереальный темп отклоняется; низкая уверенность превращает сессию в `self_reported` (без роста статов); суточный лимит XP соблюдается; `reps`-задание закрывается автоматически при достижении цели; повторная отправка той же сессии не начисляет дважды.
- **Тесты:** property-based для `PushUpCounter` (синтетические углы, шум, пропуски кадров); `ExerciseService`: каждая ветка проверки; идемпотентность по `clientSessionId`; e2e с подменой `PoseSource` на фейк (без реальной камеры).
- **Валидация на реальных данных:** ручной тест на устройстве iPhone и Android (в Telegram), результаты и пороги фиксируются в `docs/cv-notes.md`.

### S7. Характеристики из истории (расчёт и объяснимость)
- **Цель:** прозрачный расчёт статов и их достоверности.
- **Домен:** `StatCalculator` полная версия: вклад каждого источника, окно активности, `basis`.
- **UI:** экран характеристики: из чего сложилось значение (последние события), бейдж measured/estimated.
- **Критерии:** значение = сумма вкладов журнала; пересчёт с нуля даёт тот же результат (`pnpm rebuild:characters` без расхождений); `perception` честно показывает `no_data`.
- **Тесты:** property: проекция по журналу == кэш `characters`; replay.

### S8. Offline-first (outbox)
- **Цель:** работать без сети, синхронизироваться потом.
- **Клиент:** IndexedDB outbox, очередь мутаций с `Idempotency-Key`, оптимистичный расчёт через `lib/domain` на клиенте, индикатор синхронизации, повтор при появлении сети.
- **Критерии:** действия без сети сохраняются и применяются ровно один раз после восстановления; конфликты (например, задание уже провалено на сервере) разрешаются сервером, клиент показывает итоговое состояние.
- **Тесты:** повторная отправка того же outbox-элемента (идемпотентно); порядок применения; e2e с отключением сети.

### S9. ИИ-слой
- **Цель:** отчёты о развитии и черновики заданий.
- **Клиенты:** `DeepSeekLlmClient` за `LlmClient`; фейк остаётся для тестов и dev.
- **Очередь:** `report.generate` (по запросу и еженедельно).
- **API:** `POST /api/ai/report`, `GET /api/ai/reports`, `POST /api/ai/quest-drafts`, `POST /api/ai/quest-drafts/:id/accept` (контракты дописываются в этот файл при старте слайса, бамп версии).
- **Критерии:** ИИ получает только агрегаты (включая `SignalReport`) и тексты пользователя, объясняет выводы Системы словами и не меняет числа и выбор `weakSpot`; доступ по feature `ai_explain`; пояснение кэшируется и пересчитывается только при изменении `SignalReport`; при ошибке или лимите провайдера возвращается шаблонный текст из чисел отчёта; в отчёте факты (из журнала) отделены от предположений (маркер); черновики заданий не создают активные задания без подтверждения; при недоступности ИИ приложение полностью работает.
- **Тесты:** контрактный тест `LlmClient`; структурный вывод валидируется zod, невалидный ответ даёт ретрай/ошибку; идемпотентность джоба; путь ошибки (таймаут, 500).

### S10. Пробуждение (анкета, цели, калибровка)
- **Цель:** Система узнаёт, что человек хочет прокачивать, и запускает калибровку.
- **Домен:** `OnboardingService.resolvePhase`, `Goal`.
- **API:** `GET/POST /api/onboarding`, `GET/PUT /api/goals`.
- **UI:** `routes/(app)/awakening`, `Stepper`: (1) до 3 целей: область, название, интенсивность из `goalPresets` (light/medium/high), приоритет; (2) время в день; (3) предпочтительное окно; (4) подтверждение. Гард в layout ведёт на `/awakening` при `phase = questionnaire`. Главная показывает «Калибровка: день N из 7».
- **Критерии:** после отправки фаза `calibration`, `calibrationStartedAt = now`, `timezone` сохраняется в настройках; повторная отправка даёт `ALREADY_ONBOARDED`; цели правятся через `PUT /api/goals` без смены фазы; переход в `active` наступает лениво через `calibration.days` дней, не раньше, и не откатывается.
- **Тесты:** property: `resolvePhase` монотонна по времени и не переходит раньше срока; валидация границ анкеты; контракты; изоляция; e2e: пройти анкету, увидеть калибровку.

### S11. Планировщик дня
- **Цель:** Система сама ставит задания на день под цели и бюджет времени.
- **Домен:** `DailyPlanner`, `QuestTemplateCatalog`.
- **Очередь:** `daily.plan`.
- **API:** без новых, задания видны через `GET /api/quests`.
- **UI:** вкладка «активные» показывает системные задания с пометкой «Система»; ручное создание из S2 остаётся.
- **Критерии:** в `plan.localHour` по часовому поясу пользователя создаются от 1 до `plan.maxQuests` заданий; сумма `estMinutes` не превышает бюджет; в калибровке сложность 1 и покрытие областей с целями; без анкеты пользователь пропускается; повторный запуск джоба не создаёт дублей; `deadlineAt` = конец локального дня; в плане `free` приоритет `weakSpot` не применяется.
- **Тесты:** джоб дважды, набор тот же; property: бюджет не превышен, все `templateKey` из каталога; границы часовых поясов и DST через `FixedClock`; сбой одного пользователя не блокирует других; golden на профиле `newbie`.

### S12. Анализатор слабых мест
- **Цель:** Система показывает, где разрыв между целью и фактом.
- **Домен:** `SignalAnalyzer`. **Сервис:** `SignalService` (кэш в `signal_snapshots`, пересчёт если снимок старше `signals.cacheMinutes`).
- **API:** `GET /api/signals` (feature `signals`).
- **UI:** блок «Анализ Системы» на главной: слабое звено, `SignalCard` по областям (доля выполнения, тренд, лучшее время суток), бейдж низкой уверенности; при `ready=false` текст про калибровку; при отсутствии доступа закрытая карточка.
- **Критерии:** `weakSpot` строго по формуле раздела 9.1; области с `confidence=low` не участвуют в выборе; без данных `ready=false`, `weakSpot=null`; без feature `signals` ответ `ENTITLEMENT_REQUIRED`.
- **Тесты:** property: порядок событий не влияет на результат, `completionRate` в [0,1], добавление выполненного задания не уменьшает `completionRate` области, пустой вход не падает; golden на профиле `veteran` (ожидаемое слабое звено зафиксировано); контракт `SignalReport`; изоляция.

### S13. Адаптивная сложность
- **Цель:** нагрузка подстраивается под человека, держа долю выполнения около 70-80%.
- **Домен:** `DifficultyController`, `scale(d)`. Интеграция: `QuestService` при resolve, `DailyPlanner` при выборе `d`.
- **UI:** на экране области показать текущий ранг сложности и причину последнего изменения.
- **Критерии:** правила раздела 9.1 (пороги, кулдаун, границы 1-10); план `free` всегда сложность 1; шаблоны масштабируются по `scale(d)`; повторный resolve того же задания не двигает `d` дважды.
- **Тесты:** property: `d` всегда в [1,10], при росте доли выполнения `d` не уменьшается, кулдаун соблюдается; идемпотентность пересчёта; `FixedClock`.

### S14. Боссы
- **Цель:** слабое звено превращается в большую цель на 4 недели.
- **Домен:** `BossPlanner`, прогресс босса. **Сервис:** `BossService.evaluate`. **Очередь:** `boss.propose`.
- **API:** `POST /api/quests/:id/accept`, `POST /api/quests/:id/dismiss`; предложения через `GET /api/quests?status=proposed`.
- **UI:** `BossCard` на главной и на вкладке «Боссы» в `quests/`: `ProgressBar tone=hp` (оставшиеся очки), принять или отклонить, пояснение «почему этот босс» (данные из `SignalReport`, текст ИИ после S9). `DailyPlanner` приоритизирует область босса.
- **Критерии:** босс предлагается только при `phase=active`, `weakSpot != null`, без другого активного или предложенного, после кулдауна `dismissed`; `target` по формуле 9.1; прогресс считается по журналу с `startedAt`; достижение цели завершает босса один раз; просрочка проваливает босса по общим правилам штрафа; нужна feature `auto_boss`.
- **Тесты:** джобы `boss.propose` дважды, один босс; property: `target >= minTarget`, прогресс монотонен, завершение идемпотентно; один активный босс одновременно; изоляция; e2e: принять босса, выполнить задания, босс закрыт.

### S15. Архетип
- **Цель:** класс персонажа определяется поведением.
- **Домен:** `ArchetypeClassifier`. Пересчёт при записи события, кэш в `characters.archetype`.
- **UI:** название архетипа на главной, `Badge`.
- **Критерии:** при сумме очков за 30 дней < `archetype.minPoints` архетип `novice`; смена архетипа только при превосходстве на `hysteresis`; результат детерминирован.
- **Тесты:** property: масштабирование всех очков в k раз не меняет архетип, результат не зависит от порядка событий, гистерезис исключает дребезг; golden на профиле `veteran`.

### S16. Источники данных и GitHub
- **Цель:** прогресс подтягивается из реальных систем без ручного ввода.
- **Контракт:** `DataSource` (раздел 8.4), таблица `data_source_connections` (бамп версии), `source.sync`, `FakeDataSource`.
- **Модуль:** `GithubSource`: коммиты и PR пользователя превращаются в события с `source=github`, `verification=measured`, статы по `sourceStatMap` (intelligence, discipline). Детали авторизации GitHub и маппинга дописываются в этот файл при старте слайса.
- **UI:** `settings/`: список источников, подключить и отключить.
- **Критерии:** события идемпотентны по `source:<key>:<externalId>`; отключение источника не удаляет журнал; ошибки и лимиты внешнего API ретраятся; нужна feature `integrations`.
- **Тесты:** контрактный тест `DataSource` на фейке; идемпотентность `source.sync`; путь ошибки (500, лимит); изоляция.

## 19. Вне объёма

Анализ мимики, эмоций, жестов (лицо и кисти). Оценка техники как достоверный показатель. Серверная обработка видео. Мультиплеер и социальные функции. Биллинг и приём платежей (планы заложены через `Entitlements`, оплата позже). Реальные денежные штрафы. Гильдии, общие боссы, подтверждение друг друга (следующий этап после MVP). «Job Change» при смене архетипа. Нативные приложения.

## 20. Открытые пункты

Баланс чисел `RulesConfig` (подбирается после S6 на реальном использовании). Список упражнений после отжиманий. Источник данных для Perception и HP (сон). Политика хранения истории (сроки). Финальное разделение free и pro. Расширение каталога шаблонов заданий и его баланс. Баланс порогов `signals`, `difficulty`, `boss` после недель реального использования. Модель гильдий.
