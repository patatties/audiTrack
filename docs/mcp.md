# MCP server

audiTrack hosts its own [Model Context Protocol](https://modelcontextprotocol.io) server, so AI assistants (Claude Code, Claude Desktop, n8n and other MCP clients) can look up and update audit data. It runs in the same container as the app and the REST API, at `/mcp`.

- Transport: Streamable HTTP, stateless; requests are JSON-RPC over `POST /mcp` and answered with JSON.
- Tools call the same REST handlers as the web app (`server/internal.js`), so they follow the same rules.
- Implemented in `server/mcp.js` without extra dependencies.

## Access

MCP is always on. Access depends on two settings in `.env`:

| `AUDITRACK_MCP_TOKEN` | Login (`AUDITRACK_USERNAME`/`PASSWORD`) | Who can use `/mcp` |
|---|---|---|
| empty | off | anyone who can reach the server, like the web app |
| empty | on | only audiTrack's own AI features (a random internal token is used) |
| set | on or off | clients that send `Authorization: Bearer <token>` |

```env
AUDITRACK_MCP_TOKEN=paste-a-long-random-string-here   # e.g. from: openssl rand -hex 32
```

`/mcp` is not behind the HTTP Basic login; it has its own token. The startup log shows the mode, e.g. `MCP: /mcp (token required)`. Requests from a browser on another website are always refused.

MCP tools can change data. Use a token, and HTTPS (a reverse proxy) beyond your own machine.

## Connect a client

Claude Code:

```bash
claude mcp add --transport http auditrack http://localhost:8081/mcp --header "Authorization: Bearer <token>"
```

Without a token, leave out `--header`. Other clients: URL `http://localhost:8081/mcp`, plus the same header when a token is set. Optionally send `X-Auditrack-Actor: <name>`; it is used as the author of comments.

n8n: add an **MCP Client Tool** node to an AI Agent, transport **HTTP Streamable**, endpoint:

- n8n in the same Docker network as audiTrack: `http://auditrack:3000/mcp`
- n8n in another container on the same machine: `http://host.docker.internal:8081/mcp`
- Authentication: *Bearer* with the token (or none when no token is set and the login is off).

audiTrack answers with plain JSON (no SSE stream), as Streamable HTTP allows. Clients that only support the old SSE transport cannot connect.

## Tools

Clients, locations, controls and plans can be referred to by name or code (e.g. `PR-02`, `A.8.5`, `RP-003`, `"Client / Location"`); findings by id (see `list_findings`).

| Tool | Changes data | What it does |
|---|---|---|
| `get_overview` | no | Findings by status and severity, overdue findings, plans by status, progress per client |
| `list_clients` | no | Clients with their locations |
| `list_controls` | no | Controls with code, where they apply and open findings |
| `get_control` | no | One control: description, requirements, solutions and findings |
| `list_findings` | no | Search and filter findings (client, location, control, status, severity, overdue) |
| `get_finding` | no | One finding with description and plans |
| `list_remediation_plans` | no | Plans with status, owner, due date, effort |
| `get_remediation_plan` | no | One plan: findings, solutions, comments, attachments |
| `search_solutions` | no | Search the solutions library |
| `list_notes` | no | Recent notes |
| `list_control_templates` | no | Recommended baseline (CIS v8 / NIST CSF 2.0) and frameworks (ISO 27001 Annex A) |
| `create_finding` | yes | Register a finding for a control at a location |
| `update_finding` | yes | Change status, severity, assignee, due date, title or description |
| `create_remediation_plan` | yes | New plan (code RP-xxx assigned), linked to findings and solutions |
| `update_remediation_plan` | yes | Change a plan and/or link more findings |
| `add_plan_comment` | yes | Comment on a plan |
| `add_note` | yes | Add a note |
| `add_client` | yes | Add a client with locations |
| `add_controls_from_templates` | yes | Add template controls by code, or a whole framework |
| `apply_setup` | yes | Add clients, controls and solutions in one go (used by the AI setup) |
| `update_texts` | yes | Replace text fields in bulk (used by "Translate all") |

## Used by audiTrack itself

Every AI feature that reads or changes audit data goes through this MCP server over loopback (`http://127.0.0.1:3000/mcp`, `server/mcpClient.js`), with a full `initialize` handshake:

| Feature | How it uses MCP |
|---|---|
| **Ask AI → Question** (`server/assistant.js`) | The model gets the MCP tools and decides which to call. Read-only tools run directly; every tool that changes data is shown to the user with **Approve / Decline** and only runs after approval. |
| **Ask AI → Rant mode** | Reads clients, locations and controls with `list_clients` and `list_controls` to map suggested findings; the user creates them in the app. |
| **Translate all** | Writes the translated texts with `update_texts`. |
| **AI setup** | Saves the reviewed proposal with `apply_setup`. |

Translating a single text and the report summary only work on text the user already has on screen, so they call the AI provider directly.

The assistant needs a model with tool calling (all current Anthropic, OpenAI and Azure OpenAI chat models; for OpenRouter and Ollama, pick a model that supports tools). Conversations are kept in memory for an hour.

## Test with curl

```bash
curl -s http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

When a token is set, add `-H "Authorization: Bearer <token>"`.
