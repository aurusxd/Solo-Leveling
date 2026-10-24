# Life RPG

Telegram Mini App that turns real tasks and habits into levels, XP, stats, quests and a shop.

- Specification: [`tech.md`](tech.md) (single source of truth)
- Working rules for Claude Code sessions: [`CLAUDE.md`](CLAUDE.md)
- Visual design reference: [`index.html`](index.html)

## Setup

Requires Node 24+ and pnpm 10.

```sh
pnpm install
cp .env.example .env
pnpm test:e2e:install
pnpm dev
```

## Scripts

| Script          | Purpose                           |
| --------------- | --------------------------------- |
| `pnpm check`    | svelte-check and TypeScript       |
| `pnpm lint`     | prettier and eslint               |
| `pnpm format`   | apply prettier                    |
| `pnpm test`     | vitest (unit and integration)     |
| `pnpm test:e2e` | Playwright on a mobile viewport   |
| `pnpm build`    | production build (`adapter-node`) |
