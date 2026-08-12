# AI Bidder — Server

Backend service for the AI Bidder browser extension. It ingests jobs submitted by the extension, scores them using an AI provider (OpenRouter or Ollama), and manages an end-to-end approval workflow over Telegram: you review a job, tune the suggested budget and timeline with inline keyboard steppers, then approve — the extension opens the job page and auto-fills the proposal.

## Features

- **Job pipeline** — receive jobs, enrich and store them, expose CRUD + submission endpoints.
- **AI analysis** — generate job summaries, budgets and timeline suggestions via OpenRouter (cloud) or a local Ollama model.
- **Telegram approval flow** — inline keyboards with budget / timeline steppers, `Done` and `Approve` / `Reject` actions, delivered via long polling (`getUpdates`) — no webhook or public URL required.
- **WebSocket events** — real-time `job.approved`, `job.rejected`, etc., so the extension reacts immediately.
- **Per-user credentials** — Telegram bot tokens and chat IDs are stored encrypted in the database using a master key.
- **Encrypted storage** — AES-GCM encryption of sensitive fields via a 32-byte master key from the environment.

## Tech Stack

- [NestJS 11](https://nestjs.com/) + Express
- [Prisma ORM 7](https://www.prisma.io/) with `@prisma/adapter-pg`
- PostgreSQL
- Socket.IO (`@nestjs/platform-socket.io`)
- `cookie-parser`, class-validator / class-transformer, `@nestjs/throttler`

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- A PostgreSQL database
- (Optional) An [OpenRouter](https://openrouter.ai/) API key, or Ollama running locally

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure the environment
cp .env.example .env
#   - set DATABASE_URL, PORT, ENCRYPTION_KEY (see below)

# 3. Apply the database schema
npx prisma migrate deploy   # after a schema change, run `npx prisma migrate dev`

# 4. Start the server (watch mode)
npm run start:dev
```

The server listens on `http://localhost:5000` by default. Health check:

```
GET http://localhost:5000/api/v1/health
```

### Environment Variables

| Variable        | Required | Description                                                                 |
| --------------- | :------: | --------------------------------------------------------------------------- |
| `DATABASE_URL`  |   Yes    | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/db?sslmode=require` |
| `PORT`          |    No    | HTTP / WS port (default `5000`)                                              |
| `ENCRYPTION_KEY`|   Yes    | Master key for encrypting stored credentials. 32-byte hex string (64 hex chars). Generate one with `openssl rand -hex 32`. |

Telegram bot tokens and chat IDs are **not** stored in `.env` — they are supplied per user through the extension and stored encrypted in the database.

## Available Scripts

| Script                 | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `npm run start:dev`    | Run in watch mode (`nest start --watch`)          |
| `npm run build`        | Clean `dist` and compile                           |
| `npm run start`        | Build, then run in production                      |
| `npm run start:prod`   | Run a previously built `dist`                      |
| `npm run generate`     | `prisma generate`                                  |
| `npm run lint`         | ESLint with `--fix`                                |
| `npm run format`       | Prettier over `src` and `test`                     |
| `npm test`             | Run unit tests (Jest)                              |

## REST API

All routes are prefixed with `/api`. Sessions are tracked via an auth cookie; the extension calls `setup` to create/restore a user session.

### Auth

| Method | Route                 | Description                              |
| ------ | --------------------- | ---------------------------------------- |
| POST   | `/api/v1/auth/setup`  | Create or restore a user session (returns auth cookie) |
| POST   | `/api/v1/auth/logout` | Destroy the current session              |

### Jobs

| Method | Route                          | Description                                        |
| ------ | ------------------------------ | -------------------------------------------------- |
| POST   | `/api/v1/jobs`                 | Create a job from the extension                    |
| GET    | `/api/v1/jobs`                 | List jobs                                          |
| GET    | `/api/v1/jobs/:id`             | Get a single job                                   |
| GET    | `/api/v1/jobs/:id/proposal`    | Get the AI-generated proposal                      |
| POST   | `/api/v1/jobs/:id/submit`      | Mark a job submitted                               |
| POST   | `/api/v1/jobs/:id/proposal/fill`| Record that the proposal was filled                |
| POST   | `/api/v1/jobs/:id/bid-blocked` | Flag a job as unable to bid                        |

### Approval

| Method | Route                     | Description                              |
| ------ | ------------------------- | ---------------------------------------- |
| POST   | `/api/v1/jobs/:id/approve`| Approve a job — emit approval + notify the extension |
| POST   | `/api/v1/jobs/:id/reject` | Reject a job                             |

### Webhooks

| Method | Route                       | Description                                   |
| ------ | --------------------------- | --------------------------------------------- |
| POST   | `/api/v1/webhooks/telegram` | Telegram callback endpoint (used internally by the polling flow) |

## Telegram Integration

The server polls Telegram's `getUpdates` API for each configured bot token instead of relying on a public webhook, so it works behind NAT without exposing a URL.

The interaction flow:

1. When a job is analyzed, a **job notification** (summary, suggested budget, suggested timeline) is sent with a keyboard offering steppers.
2. **Budget / Timeline steppers** — `+` / `−` buttons adjust the values before approval.
3. **Done** — persists the adjusted values and returns to the main keyboard (does not auto-approve).
4. **Approve / Reject** — final decision; the button updates to a disabled "handled" state and `job.approved` / `job.rejected` is broadcast over WebSocket so the extension opens the job page and fills the proposal.

## WebSocket Events

Connect to `ws://localhost:5000/api/v1/ws` (socket.io, auth via session cookie) and listen for job lifecycle events:

- `job.approved`
- `job.rejected`
- `job.bidBlocked`

Events are emitted with the job id so the client can target the correct page.

## Project Structure

```
src/
├── ai/                 # Analysis providers (OpenRouter, Ollama) and scoring
├── approval/           # Approve / reject job flow
├── auth/               # User session setup and guard
├── common/             # Shared DTOs, enums, interfaces
├── crypto/             # AES-GCM encryption for stored credentials
├── health/             # /v1/health controller
├── jobs/               # Job CRUD, submissions, proposal filling
├── notifications/      # Notification provider interfaces + Telegram provider
├── pipeline/           # Job processing pipeline + startup bootstrap
├── prisma/             # PrismaService (official @prisma/client)
├── webhooks/           # Telegram controllers + long-polling service
├── websocket/          # Socket.IO gateway emitting job events
└── app.module.ts       # Root module
```

## Related

- Client extension: [AI-Bidder-Client](https://github.com/sisiam08/AI-Bidder-Client)