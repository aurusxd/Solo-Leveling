# Life RPG

Telegram Mini App that turns real tasks and habits into levels, XP, stats, quests and a shop.

- Specification: [`tech.md`](tech.md) (single source of truth)
- Working rules for Claude Code sessions: [`CLAUDE.md`](CLAUDE.md)
- Visual design reference: [`index.html`](index.html)

## Setup

Requires Node 24+, pnpm 10 and Docker (for the local Postgres on port 5433).

```sh
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm test:e2e:install
pnpm dev
```

## Scripts

| Script             | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `pnpm check`       | svelte-check and TypeScript                                   |
| `pnpm lint`        | prettier and eslint                                           |
| `pnpm format`      | apply prettier                                                |
| `pnpm test`        | vitest; integration suites use a throwaway Postgres database  |
| `pnpm test:e2e`    | Playwright on a mobile viewport                               |
| `pnpm build`       | production build (`adapter-node`)                             |
| `pnpm db:up`       | start the local Postgres (`compose.yml`)                      |
| `pnpm db:generate` | generate a migration from `src/lib/server/db/schema.ts`       |
| `pnpm db:migrate`  | apply migrations from `drizzle/`                              |
| `pnpm db:seed`     | recreate seed profiles `newbie` and `veteran` (never in prod) |
| `pnpm db:studio`   | Drizzle Studio                                                |
