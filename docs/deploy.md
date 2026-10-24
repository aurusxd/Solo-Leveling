# CI and deploy

## Pipeline

`.github/workflows/ci.yml` has two jobs.

- **verify** runs on every PR to `main` and on every push to `main`: `check`, `lint`, migrations on an ephemeral Postgres (from task 0.4), `test` with a Postgres service, `build`, `test:e2e`, and an informational `pnpm audit`.
- **deploy** runs only on push to `main`, after `verify` passes, and only when the repository variable `DEPLOY_ENABLED` is `true`. It builds the Docker image, pushes it to GHCR (`ghcr.io/aurusxd/solo-leveling`), copies `deploy/` to the VPS, runs `deploy/deploy.sh` (pull, migrate, up, wait for `/api/health`) and then checks `https://$APP_DOMAIN/api/health` from outside.

## Repository settings

Environment `production` (Settings > Environments) with:

| Kind     | Name              | Value                                                      |
| -------- | ----------------- | ---------------------------------------------------------- |
| secret   | `VPS_HOST`        | VPS address                                                |
| secret   | `VPS_USER`        | SSH user, member of the `docker` group                     |
| secret   | `VPS_SSH_KEY`     | private key of a deploy-only key pair                      |
| secret   | `VPS_KNOWN_HOSTS` | output of `ssh-keyscan <VPS_HOST>`                         |
| variable | `APP_DOMAIN`      | public domain pointing at the VPS                          |
| variable | `DEPLOY_PATH`     | optional, directory in the user's home, default `life-rpg` |

Repository variable `DEPLOY_ENABLED=true` turns the deploy job on.

Branch protection on `main`: require a pull request, require the `verify` status check, block force pushes.

## VPS bootstrap (once)

1. Install Docker Engine with the compose plugin, open ports 80 and 443.
2. Create the deploy user, add it to the `docker` group, put the deploy public key in `~/.ssh/authorized_keys`.
3. Create `~/life-rpg/.env`:

   ```sh
   APP_DOMAIN=rpg.example.com
   POSTGRES_PASSWORD=<long random string>
   BOT_TOKEN=<telegram bot token>
   DEEPSEEK_API_KEY=<optional; empty selects FakeLlmClient>
   ```

   The file never leaves the VPS. Compose sets `NODE_ENV` and `DATABASE_URL`. The app refuses to start in production without `BOT_TOKEN` or with `DEV_AUTH_BYPASS` or `ENTITLEMENTS_ALL` enabled (see `src/lib/server/config.ts`).

4. Point the domain DNS at the VPS. Caddy obtains the TLS certificate on first start.
