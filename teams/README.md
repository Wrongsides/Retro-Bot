# teams

A minimal Bot Framework bot that bridges Microsoft Teams to the `retro-bot` MCP
server. It exists to prove out **Teams app permissions/wiring** end-to-end
(Azure Bot registration → Bot Framework → Teams client) before building richer
retro-bot features on top.

It's an MCP **client**: on each Teams message it opens an MCP session against
`retro-bot`'s `/mcp` endpoint, calls a tool, and posts the result back to the
Teams conversation.

## Commands

Type these as plain chat messages to the bot in Teams (or the Bot Framework
Emulator):

- `tools` — lists the tool names exposed by the retro-bot MCP server.
- `create retro` — calls the `miro_create_retro` MCP tool as a smoke test.
- `cycle overview` — calls the `cycle_overview` MCP tool (Jira actions completed
  or still in progress since the previous retro).
- `retro summary` — calls the `retro_summary` MCP tool (the latest retro's
  columns, mood board and experiment tracking box, plus any Jira action
  tickets created from the action items), then prompts for feedback with an
  Adaptive Card showing five star-rating buttons. Tapping a star calls
  `retro_feedback` with the selected rating.
- `github examples` — calls the `retro_github_examples` MCP tool to search the
  GitHub codebase for real code examples matching the problems and action
  items raised in the latest retro.
- `sentiment trend` — calls the `retro_sentiment_trend` MCP tool, which uses
  the LLM to score team sentiment (1-5) for the most recent retros on the
  board, then posts the scores/reasons as text plus a bar-chart Adaptive Card.
- `feedback <1-5> [comment]` — calls the `retro_feedback` MCP tool directly to
  record a star rating (and optional comment) for Retro-Bot itself, without
  waiting for the card prompt.
- `feedback summary` — calls the `retro_feedback_summary` MCP tool for the
  average star rating and most recent comments.
- anything else — shows a short usage hint.

## Prerequisites

1. **retro-bot MCP server running** (from the repo root):
   ```bash
   pnpm --filter mcp run dev
   ```
   Defaults to `http://localhost:8080/mcp`.

2. **An Azure Bot resource** (Bot Framework registration) with:
   - App ID + client secret (App Type: Multi-tenant is simplest for testing).
   - Messaging endpoint set to `https://<your-public-url>/api/messages`
     (use `devtunnel`/`ngrok` for local dev — Teams cannot reach `localhost`
     directly).

## Setup

```bash
cd teams
cp .env.example .env
# fill in MicrosoftAppId / MicrosoftAppPassword / MicrosoftAppTenantId
# from the Azure Bot resource
```

From the repo root (this is a pnpm workspace package):

```bash
pnpm install
pnpm --filter teams run dev
```

The bot listens on `PORT` (default `3978`) for `POST /api/messages`.

## Exposing it to Teams locally

```bash
devtunnel host -p 3978 --allow-anonymous
# or: ngrok http 3978
```

Set the Azure Bot's messaging endpoint to
`https://<tunnel-host>/api/messages`, then test with:

- **Bot Framework Emulator** — point it at `http://localhost:3978/api/messages`
  with the same App ID/password, to verify the bot logic without Teams at all.
- **Teams sideloading** — see below, to verify actual Teams permissions.

## Sideloading into Teams

1. Fill in `appPackage/manifest.json`:
   - Replace both `00000000-0000-0000-0000-000000000000` placeholders with
     your Azure Bot's App ID.
   - Add real `color.png` (192x192) and `outline.png` (32x32, transparent)
     icons to `appPackage/`.
2. Zip the contents of `appPackage/` (manifest + both icons) into
   `app-package.zip`.
3. In Teams: **Apps → Manage your apps → Upload an app → Upload a custom app**,
   and select the zip.
4. Add the app to yourself, a team, or a group chat (matching the `scopes` in
   the manifest) and send it a message — this is what verifies the bot's
   Teams permissions/consent flow actually work.

## Notes / next steps

- `retro-bot`'s `/mcp` endpoint currently has **no auth**. Once that changes,
  set `MCP_SERVER_TOKEN` in `.env` — it's already wired into the MCP client's
  request headers. See [the root README](../README.md#plans-beyond-the-poc)
  for the planned OAuth layer and move to service accounts for Jira/Miro/GitHub.
- This bot creates a fresh MCP client/session per Teams message (the
  retro-bot server is a stateless `StreamableHTTPServerTransport`). Fine for
  smoke testing; consider a longer-lived session/connection pool for
  production traffic.
