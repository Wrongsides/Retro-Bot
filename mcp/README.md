# retro-bot

Proof-of-concept MCP server for a **Retrospective Optimiser / Assistant**.

## What this is

A raw [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
MCP server exposing basic Jira, Miro and GitHub tools. This is the foundation — retro-specific
capabilities (theme clustering, action drafting, follow-up nudges) will be built on top of
these tools as the PoC develops.

**Why raw SDK, not Mastra?** This intentionally follows
[`msmg-private/ai-tools` ADR-0005](https://github.com/msmg-private/ai-tools/blob/main/docs/adr/adr-0005-do-not-adopt-mastra-for-mcp-server.md),
which found Mastra's MCP layer strips `_meta` from error/resource responses and only supports
endpoint-level (not per-tool) auth. The team's `mony-agent` service does use Mastra, but as an
**agent/orchestration layer that calls MCP tools as a client** — not for building the MCP
server itself. A thin Mastra agent wrapper (matching `mony-agent`'s
[ADR-0013](https://github.com/msmg-private/ai-tools/blob/main/docs/adr/adr-0013-adopt-mastra-route-handler-pattern.md)
pattern) may be added later to front this server for a Teams bot.

## Tools

| Tool | Type | Description |
|---|---|---|
| `jira_search_actions` | read | Search Jira issues via JQL (avoid duplicate actions) |
| `jira_create_action` | write | Create a Jira issue for a retro action |
| `miro_get_retro_notes` | read | Read raw sticky-note content from a Miro retro board |
| `github_list_open_issues` | read | List open issues in a GitHub repo |
| `github_create_issue` | write | Create a GitHub issue for a technical retro action |

All "write" tools are designed to be called only after a human has confirmed the summary/title
— they perform creation, they don't decide what should be created.

## Running locally

```bash
pnpm install
cp .env.example .env   # USE_NULL_CLIENTS=true by default — no credentials needed
pnpm dev            # starts on http://localhost:8080
```

Health check: `GET http://localhost:8080/health`

MCP endpoint (stateless Streamable HTTP): `POST http://localhost:8080/mcp`

### Inspecting tools interactively

```bash
pnpm build
pnpm inspect
```

### Using the live Jira/Miro/GitHub APIs

Set `USE_NULL_CLIENTS=false` in `.env` and fill in the relevant credentials
(`JIRA_*`, `MIRO_*`, `GITHUB_*`). With null clients on (default), each integration returns
realistic in-memory sample data and "creates" are tracked in-process for the demo.

## Status

Early scaffold — basic third-party tool access only. Retro-specific reasoning (summarisation,
theme clustering, action drafting, follow-up nudges) is not yet implemented.
