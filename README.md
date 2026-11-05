# audiTrack

audiTrack is a web application for audit teams to track findings, manage remediation work, and report progress across multiple clients. Everything lives in one place: from the moment a finding is discovered to the moment it is closed.

Everything runs in one Docker container: a Node server with the web app, the REST API and a built-in database on a volume. No database server or cloud account needed.

---

[![How audiTrack data fits together](public/manual/data-model.png)](public/manual/data-model.png)

---

## What it does

### Clients & locations

The starting point of the data model is a **client**. Each client has one or more **locations** — these can be physical sites, departments, business units, or environments, depending on how you organize your audits. You manage clients and their locations in the Clients section.

### Controls

**Controls** come from a **control catalog** — a list of security or compliance requirements you define once and reuse across clients. You assign controls from the catalog to specific locations. Once assigned, a control tracks whether that requirement is being met at that location. The Controls section gives you a full overview, with progress bars showing how many findings per control are still open.

### Findings

A **finding** is raised when a control is not (fully) met at a location. Each finding has a title, description, severity (low / medium / high / critical), and a status (to do / in progress / gathering evidence / done). Findings are managed on the **Board**, which lets you filter and sort by client, location, severity, status, or control. You can update a finding's status inline or open it for full editing.

### Remediation plans

One or more findings can be grouped into a **remediation plan**. A plan is the unit of work: it has an owner, a due date, an effort estimate, and a status. Inside a plan you can:

- Link any number of findings
- Write a description of the approach
- Post comments (with support for pasting screenshots directly into the text)
- Upload evidence files (PDFs, images, documents)
- Link to solutions from the solutions library

### Solutions library

The **Solutions** section is a curated knowledge base of remediation approaches. Each solution can be tagged and linked to controls or remediation plans. This prevents the same remediation advice from being written out multiple times across audits.

### Notes

The **Notes** section is a scratchpad for unstructured observations. Notes can be converted into findings or remediation plans using the built-in AI assistant, which extracts structured data from the free text.

### Dashboard

The **Dashboard** gives a real-time overview of all active audit work:

- KPI tiles: total findings, open critical issues, percentage closed
- Per-client progress bars
- Severity breakdown chart
- Control health matrix showing which controls have open findings across locations
- Activity timeline showing recent changes

You can export a full PDF report from the dashboard, or generate a scoped report for a specific client.

### AI assistant

The AI assistant answers questions about findings, controls, and remediation status, and can make changes for you — register findings, create or update remediation plans, add comments — but only after you approve each change. It can also turn a free-text report into suggested findings and remediations. It also powers translation, report summaries and the AI setup. It works with Anthropic (Claude), OpenAI, Azure OpenAI, OpenRouter or a local Ollama model; see [Configuration](#configuration-env).

### MCP server

audiTrack has a built-in [MCP](https://modelcontextprotocol.io) server at `/mcp`, so AI assistants such as Claude Code, Claude Desktop or n8n can look up and update audit data. The built-in AI features use the same server: they read and change data only through its tools. See [docs/mcp.md](docs/mcp.md).

---

## Installation (Docker Hub)

audiTrack is published on Docker Hub as [`patatties/auditrack`](https://hub.docker.com/r/patatties/auditrack) for `linux/amd64` and `linux/arm64` (also Raspberry Pi, ARM-based NAS and Apple Silicon). You only need Docker; no source code and no database server. All data is stored in a volume mounted at `/data`.

| | |
|---|---|
| Image | `patatties/auditrack:latest` (every change on `main` is published as `:latest`) |
| Port | the app listens on `3000` inside the container; the examples publish it as `8081` |
| Data | volume at `/data`: built-in database (`/data/pgdata`) and attachments (`/data/attachments`) |
| Settings | environment variables, see [Configuration](#configuration-env) — all optional |

### Option 1 — `docker run`

```bash
docker run -d --name auditrack \
  -p 8081:3000 \
  -v auditrack-data:/data \
  --restart unless-stopped \
  patatties/auditrack:latest
```

Open http://localhost:8081; a new installation starts with the [setup page](#first-start-three-ways-to-fill-auditrack).

With settings, add `-e NAME=value` per variable, or put them in a `.env` file and add `--env-file .env`:

```bash
docker run -d --name auditrack \
  -p 8081:3000 \
  -v auditrack-data:/data \
  -e AUDITRACK_USERNAME=admin \
  -e AUDITRACK_PASSWORD='choose-a-strong-password' \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  --restart unless-stopped \
  patatties/auditrack:latest
```

### Option 2 — Docker Compose (recommended)

1. Create a folder (e.g. `auditrack`) with a file `compose.yaml`:

   ```yaml
   services:
     auditrack:
       image: patatties/auditrack:latest
       container_name: auditrack
       ports:
         - "8081:3000"
       env_file: .env                # settings: login, AI provider, MCP token …
       volumes:
         - auditrack-data:/data      # database and attachments; back up this volume
       extra_hosts:
         - "host.docker.internal:host-gateway"   # only needed for Ollama on this machine
       restart: unless-stopped

   volumes:
     auditrack-data:
   ```

2. Next to it, create the settings file `.env`. Start from the template, or leave it empty for the defaults:

   ```bash
   curl -o .env https://raw.githubusercontent.com/patatties/audiTrack/main/.env.example
   ```

3. Start it:

   ```bash
   docker compose up -d
   docker compose ps          # STATUS shows "healthy" after a few seconds
   docker compose logs -f     # startup log: database, login, MCP and AI provider in use
   ```

   Open http://localhost:8081.

**With PostgreSQL instead of the built-in database** (optional): add a database service and point `DATABASE_URL` at it.

```yaml
services:
  auditrack:
    image: patatties/auditrack:latest
    ports:
      - "8081:3000"
    env_file: .env
    environment:
      DATABASE_URL: postgresql://auditrack:change-me@db:5432/auditrack?sslmode=disable
    volumes:
      - auditrack-data:/data      # attachments
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: auditrack
      POSTGRES_USER: auditrack
      POSTGRES_PASSWORD: change-me
    volumes:
      - auditrack-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U auditrack -d auditrack"]
      interval: 5s
      retries: 10
    restart: unless-stopped

volumes:
  auditrack-data:
  auditrack-db:
```

### Updating, stopping and removing

| | Docker Compose | `docker run` |
|---|---|---|
| Update to the latest version | `docker compose pull && docker compose up -d` | `docker pull patatties/auditrack:latest`, then `docker rm -f auditrack` and run the same `docker run` command again |
| Logs | `docker compose logs -f` | `docker logs -f auditrack` |
| Stop / start | `docker compose stop` / `docker compose start` | `docker stop auditrack` / `docker start auditrack` |
| Remove the container, keep the data | `docker compose down` | `docker rm -f auditrack` |
| Remove everything, **including all data** | `docker compose down -v` | `docker rm -f auditrack && docker volume rm auditrack-data` |

Your data lives in the volume, so updating or recreating the container keeps it. Changed settings in `.env` take effect after `docker compose up -d` (a plain `restart` does not reload them).

### Building from source

```bash
git clone https://github.com/patatties/audiTrack.git && cd audiTrack
cp .env.example .env
docker compose up -d --build     # uses docker-compose.yml from the repository
```

## First start: three ways to fill audiTrack

A new database is empty. Until setup is done, every page opens the setup page, where you choose:

1. **Step by step** — add your clients and locations, then pick controls and solutions from the built-in templates (see [Control templates](#control-templates)). You can add your own controls too.
2. **With AI** — describe your audit work in a few sentences: which clients and locations, which standards or frameworks, what you focus on. The AI proposes clients, locations, controls and solutions. You edit the proposal and untick what you do not want; nothing is saved until you click *Save*. Needs an AI provider in `.env` (see below).
3. **Explore with demo data** — fills the database with four fictional clients, 28 findings, eight remediation plans, solutions, notes and control requirements. For trying audiTrack out, not for real use.

You can also skip setup and start with an empty database. Databases that already contain data never see the setup page.

To start over (for example after trying the demo data): **Backup & Restore → Delete all data**. This wipes the database and opens the setup again. Or remove everything at once with `docker compose down -v` (this deletes all data).

### Control templates

Two kinds of control templates are built in, and can be combined:

- **Recommended baseline** — 35 controls based on the **CIS Controls v8**, grouped by the six **NIST CSF 2.0** functions (Govern, Identify, Protect, Detect, Respond, Recover). Each control describes what good practice looks like, what evidence to ask for, and references to CIS v8, ISO/IEC 27001:2022 and NIST CSF 2.0. The 16 controls marked *Essential* (basic security hygiene: asset inventory, MFA, patching, backups, logging, incident response …) are pre-selected on a new database.
- **ISO/IEC 27001:2022 — Annex A** — all 93 Annex A controls in four themes (organizational, people, physical, technological), added with one click. Reference numbers and titles follow the standard; the descriptions are short summaries, so keep the standard at hand for the normative text.

Solution templates are linked to both, so they show up for either choice. To add templates later, use **Controls → Add from templates**; existing controls (same code) are skipped.

Templates live in `server/setup/templates.js`, the demo data in `server/setup/demo.js`.

## Configuration (`.env`)

Copy `.env.example` to `.env` next to `docker-compose.yml`. Everything is optional; `.env` is git-ignored.

### Login

| Variable | Meaning |
|---|---|
| `AUDITRACK_USERNAME`, `AUDITRACK_PASSWORD` | When both are set, the browser asks for this user name and password (HTTP Basic auth). Empty = no login. |

> Without a login, anyone who can reach the server can use the web app and the API. Set a login, or run audiTrack in a trusted network only. For access from the internet, put it behind a reverse proxy with HTTPS (for example Caddy, Traefik or Nginx Proxy Manager).

### Database

By default audiTrack uses its **built-in database**: PostgreSQL running inside the container (PGlite), stored in `/data/pgdata` in the `auditrack-data` volume. Nothing to configure.

To use a regular PostgreSQL server instead:

| Option | Settings in `.env` |
|---|---|
| Your own PostgreSQL server | `DATABASE_URL=postgresql://user:password@host:5432/auditrack?sslmode=require` |
| The bundled PostgreSQL container | `COMPOSE_PROFILES=postgres`, `POSTGRES_PASSWORD=…` (before the first start) and `DATABASE_URL=postgresql://auditrack:…@db:5432/auditrack?sslmode=disable` |

The schema is created on first start in either case. Data is not moved automatically between databases: use **Backup & Restore → Download backup** on the old one and **Restore** on the new one.

### MCP

| Variable | Meaning |
|---|---|
| `AUDITRACK_MCP_TOKEN` | Token for the MCP server at `/mcp`; clients send `Authorization: Bearer <token>`. Empty = no token check, except when the login is on: then only audiTrack's own AI features can use MCP. |

Connecting clients and the list of tools: [docs/mcp.md](docs/mcp.md).

### AI

Configure one or more providers. All AI features (assistant, translation, report summaries, AI setup) use the same provider.

| Provider | Variables | Model |
|---|---|---|
| Anthropic (Claude) | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` | default `claude-opus-5-5` |
| OpenAI | `OPENAI_API_KEY`, optional `OPENAI_MODEL` | default `gpt-4.1` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT` | the deployment |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | **required**, e.g. `anthropic/claude-opus-5-5` |
| Ollama (local) | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | **required**, one of your installed models |

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `azure`, `anthropic`, `openai`, `openrouter` or `ollama`. Empty = the first configured provider, in that order. |
| `AI_MODEL` | Model for the chosen provider. Empty = that provider's model above. |

Example:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Notes:

- Your audit data (findings, controls, notes) is sent to the chosen provider when you use an AI feature. With **Ollama** it stays on your own machine.
- Ollama runs outside the container: `host.docker.internal` points to your machine. On Linux, start Ollama with `OLLAMA_HOST=0.0.0.0` so the container can reach it.
- The setup page shows which provider and model are in use.
- Older Azure setups that put the Azure key in `OPENAI_API_KEY` keep working: when `AZURE_OPENAI_ENDPOINT` is set and `AZURE_OPENAI_API_KEY` is empty, `OPENAI_API_KEY` is used as the Azure key.

### Server

| Variable | Default (Docker) | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port inside the container (mapped to 8081) |
| `AUDITRACK_DATA_DIR` | `/data` | Data folder: built-in database (`pgdata`) and attachments |
| `ATTACHMENTS_DIR` | `/data/attachments` | Uploaded files (evidence, pasted screenshots) |
| `AUDITRACK_STATIC` | `/app/public` | Built web app |
| `AUDITRACK_MAX_BODY_MB` | `100` | Maximum request size (uploads) |

## Backup

All data is in the `auditrack-data` volume: the database in `/data/pgdata` and attachments in `/data/attachments`. Back up the volume, for example:

```bash
docker run --rm -v auditrack_auditrack-data:/data -v "$PWD":/backup alpine tar czf /backup/auditrack-data.tgz -C /data .
```

Stop the container first (`docker compose stop`) for a consistent copy of the built-in database. **Backup & Restore → Download backup** in the app exports the database contents as JSON (without attachment files) and works for every database type.

With the bundled PostgreSQL container, also back up the `auditrack-db` volume (or use `pg_dump`).

## Moving from the former Azure version

1. In the old (Azure) audiTrack: **Backup & Restore → Download backup**.
2. In the new audiTrack: skip the setup (or start from an empty database), then **Backup & Restore → Restore from backup** with that file.

Attachment files are not part of the backup. Their records come along, but the files themselves stayed in Azure Blob Storage: download the ones you need from the storage account and upload them again in the remediation plan.

## Development

```bash
npm install
npm run server   # API + built-in database on http://localhost:3000 (data in ./data)
npm run dev      # web app on http://localhost:8080, proxies /api to :3000
npm test         # unit tests
```

Export the same variables as in `.env` (for example `ANTHROPIC_API_KEY` or `DATABASE_URL`) before `npm run server` to use them during development.

### Project layout

| Folder | Contents |
|---|---|
| `src/` | Web app (React + Vite) |
| `server/index.js` | HTTP server: static web app, `/api`, optional login, startup and shutdown |
| `server/routes/` | REST endpoints, one file per resource, registered in `routes/index.js` |
| `server/db.js` | Database: built-in PostgreSQL (PGlite) or PostgreSQL via `DATABASE_URL` |
| `server/schema.js` | Database schema; runs on every start and upgrades existing databases |
| `server/storage.js` | Attachment files on disk |
| `server/ai.js` | AI providers (plain `fetch`, keys only from environment variables) |
| `server/setup/` | First setup: templates, demo data, apply logic |
| `server/mcp.js` | MCP server at `/mcp`; tools call the REST handlers in-process (`server/internal.js`) |
| `server/mcpClient.js` | Loopback MCP client used by the AI features |
| `server/assistant.js` | AI assistant: tool calling over MCP, changes only after approval |

The Docker build bundles the server into one file (`npm run build:server`) and serves the built web app from `/app/public`.

## License

Copyright 2026 patatties

Licensed under the [Apache License, Version 2.0](LICENSE). You may use, modify and distribute audiTrack, also commercially, as long as you keep the license and copyright notices.
