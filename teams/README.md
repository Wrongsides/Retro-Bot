# teams

A Bot Framework bot that bridges Microsoft Teams to the `retro-bot` MCP server
for retro templates, cycle overviews, summaries, GitHub examples, sentiment
trends and feedback. The bot also exercises Teams app permissions/wiring
end-to-end (Azure Bot registration → Bot Framework → Teams client).

It's an MCP **client**: for each tool call, it opens a fresh connection to
`retro-bot`'s stateless HTTP `/mcp` endpoint and posts the result to Teams.

## Commands

Type these as plain chat messages to the bot in Teams (or the Bot Framework
Emulator):

- `tools` — lists the tool names exposed by the retro-bot MCP server.
- `create retro` — adds an empty retro template to an existing Miro board;
  it does not create a new board. In live mode, configure `MIRO_DEFAULT_BOARD_ID`
  in `mcp/.env`.
- `cycle overview` — calls the `cycle_overview` MCP tool to query Jira and
  append ticket stickies to the Miro board (repeat calls can append duplicates).
- `retro summary` — calls the `retro_summary` MCP tool (the latest retro's
  columns, mood board and experiment tracking box). It creates missing Jira
  action tickets **before** generating the narrative, then prompts for feedback
  with an Adaptive Card showing five star-rating buttons. Tapping a star calls
  `retro_feedback` with the selected rating. The feedback card is sent even
  if the tool returns an error.
- `github examples` — calls the `retro_github_examples` MCP tool to search the
  GitHub codebase and commits for examples matching the latest retro's problems
  and action items.
- `sentiment trend` — calls the `retro_sentiment_trend` MCP tool, which uses
  the LLM to score team sentiment (1-5) for up to five recent retros on the
  board. It posts a text list with a trend narrative when available, plus a
  bar-chart Adaptive Card **only when at least one score is available**.
- `feedback <1-5> [comment]` — calls the `retro_feedback` MCP tool directly to
  record a star rating (and optional comment) for Retro-Bot itself, without
  waiting for the card prompt.
- `feedback summary` — calls the `retro_feedback_summary` MCP tool for the
  average star rating and most recent comments.
- anything else — shows a short usage hint.

`create retro`, `cycle overview` and `retro summary` make changes as soon as the
command is sent; there is no review/approval prompt. Use them only when you
intend to write to Miro or Jira. The MCP tool accepts a custom sentiment
`count`, but the Teams command uses the default of five retros.

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
`GET /health` reports the bot's health.

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

## Testing

From the repository root:

```bash
pnpm --filter teams test
pnpm --filter teams typecheck
pnpm --filter teams build
```

## Notes / next steps

- `retro-bot`'s `/mcp` endpoint currently has **no auth**. Once that changes,
  the bot can send a bearer token using `MCP_SERVER_TOKEN` in `teams/.env`,
  but setting it today does not secure the MCP server. Expose the Teams bot,
  **not** the MCP endpoint, through your development tunnel. See
  [the root README](../README.md#plans-beyond-the-poc)
  for the planned OAuth layer and move to service accounts for Jira/Miro/GitHub.
- This bot connects a fresh MCP client per tool call (the retro-bot server
  uses a stateless `StreamableHTTPServerTransport`). Fine for
  smoke testing; consider reusing or pooling connections for
  production traffic.
