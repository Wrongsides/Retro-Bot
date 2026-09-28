# retro-bot

Proof-of-concept **Retrospective Optimiser / Assistant** — helps run better retros, makes
hosting one less intimidating, and keeps track of the actions that come out of them.

This is a pnpm workspace with two packages:

| Package | What it is |
|---|---|
| [`mcp/`](mcp/README.md) | An MCP server with Jira/Miro/GitHub tools and retro templates, summaries, GitHub evidence, sentiment trends and feedback |
| [`teams/`](teams/README.md) | A Microsoft Teams bot that acts as an MCP **client**, so the tools above can be driven from a Teams chat |

```
Teams client ⇄ Azure Bot / Bot Framework ⇄ teams (MCP client) ⇄ mcp (MCP server) ⇄ Jira / Miro / GitHub / LLM
```

In live mode, bot feedback is stored in a local JSON file by the MCP server.

## Progress so far

- **Monorepo split** into `mcp` (server) and `teams` (client) pnpm workspace packages, with a
  shared set of Jira/Miro/GitHub/LLM clients within `mcp/src/clients` rather than creating
  separate clients per tool. The Teams bot has its own MCP client.
- **Core third-party tools**: `jira_search_actions`, `jira_create_action`,
  `miro_get_retro_notes`, `miro_create_frame`, `miro_create_sticky_note`,
  `github_list_open_issues`, `github_create_issue`.
- **`miro_create_retro`** — builds an empty retro template on a Miro board: an outer frame
  titled with the date, four columns (What went well? / What should we do differently? /
  What should we start doing? / Action items) each pre-seeded with a starter sticky-note
  stack, a Mood box and a Dot Votes box with instructional stickies, an Experiment Tracking
  box (a Go/No-Go prompt reviewing the previous retro's recorded experiment — e.g. "pairing
  by default on tickets" — plus a fresh prompt for this sprint's experiment), and a dated
  marker sticky so the next retro knows where the last one left off. New retros are
  auto-offset below existing retro and auxiliary frames on the board.
- **`cycle_overview`** — reads a dated retro marker from the board, searches Jira for
  issues marked Done and updated since that date plus issues currently In Progress,
  returns a text summary, *and* writes a sticky note per ticket into a dedicated
  "Cycle overview" box below the latest retro frame. Repeat runs reuse the box but append
  notes again, including duplicates.
- **Teams bot** — a Bot Framework bot (Express-based) that connects to the MCP server
  for each tool call and supports `tools`, `create retro`, `cycle overview`, `retro summary`,
  `github examples`, `sentiment trend` and feedback commands. Initial wiring was verified
  end-to-end against demo Jira/Miro accounts via the Bot Framework Emulator.
- **`retro_summary`** — turns the latest retro's four columns, mood board and experiment
  tracking box into a short LLM-written narrative (rather than a literal post-it dump), and
  creates a Jira ticket for each action item not already tracked (searching Jira first to
  avoid duplicates). With live clients, its default LLM endpoint is local Ollama
  (GitHub Models, the original default, was retired in July 2026), but any
  OpenAI-compatible endpoint works — see `mcp/README.md`. An LLM failure returns
  an error rather than a partial summary; Jira tickets created earlier in the call
  are **not rolled back**.
- **`retro_github_examples`** — a standalone tool (and Teams `github examples` command) that
  searches GitHub code and commits for examples matching problems and actions from the
  latest retro. It uses the LLM for search queries and best-effort relevance filtering;
  LLM failures silently fall back to literal queries or unfiltered results.
- **`retro_sentiment_trend`** — a standalone tool (and Teams `sentiment trend` command,
  rendered as a bar-chart Adaptive Card when scores are available) that uses the LLM to
  score team sentiment (1-5) for the five most recent retros by default (configurable in
  the MCP tool) from their current columns and mood boxes. Scores are recomputed on each
  request, not stored; failed scores are marked individually and a trend narrative is
  requested when at least two scores are available.
- **`retro_feedback`** — lets users rate Retro-Bot itself (1-5 stars, optional comment),
  recorded to a local JSON file in live mode or in memory with null clients.
- **`retro_feedback_summary`** — reports the average star rating and most recent comments
  from that feedback store.
- Nullable-infrastructure test doubles (`Client.createNull()`) for Jira, Miro, GitHub,
  the LLM and feedback so the tool surface can be tested without external APIs
  (see `mcp/test/`).

## Local development

Requires Node.js 22 or newer and pnpm (the workspace uses pnpm 11). From the repository root:

```bash
pnpm install
cp mcp/.env.example mcp/.env
cp teams/.env.example teams/.env
pnpm --filter mcp dev
# In another terminal, after configuring the Azure Bot credentials in teams/.env:
pnpm --filter teams dev
```

Use the Bot Framework Emulator or tunnel **only the Teams bot** to Teams; the MCP
server's `/mcp` endpoint has no authentication. With `USE_NULL_CLIENTS=true` (the
default), integrations use in-memory demo data. The canned LLM response does not
produce sentiment scores; a live LLM and board are needed to see a sentiment chart.
See the package READMEs for setup and configuration details.

Run the existing local checks before sharing changes:

```bash
pnpm --filter mcp test && pnpm --filter mcp typecheck
pnpm --filter teams test && pnpm --filter teams typecheck
```

No CI/CD workflows or deployment pipeline are configured in this repository.

## Plans beyond the PoC

The PoC currently authenticates to Jira/Miro/GitHub with personal API tokens (or runs against
in-memory null clients for demos), and the MCP server itself has **no auth** on its `/mcp`
endpoint — acceptable for a local proof of concept, not for anything shared or hosted. Before
this goes beyond a PoC:

- **Service accounts, not personal tokens.** Replace personal Jira/Miro API tokens and GitHub
  PATs with dedicated, least-privilege service identities:
  - **Miro**: a Miro app/service account scoped to only the team's retro boards, rather than
    a personal API token tied to one human's account.
  - **Jira**: a service account (or Jira Cloud app) with API access scoped to the relevant
    project(s) only, so the bot's actions are attributable to "retro-bot", not a person.
  - **GitHub**: a GitHub App installation (fine-grained permissions, repo-scoped, short-lived
    installation tokens) instead of a long-lived personal access token.
- **OAuth for the MCP server.** Add an OAuth layer in front of `mcp`'s `/mcp` endpoint (per
  the [MCP authorization spec](https://modelcontextprotocol.io/specification/basic/authorization))
  so only authorized clients (the Teams bot, and any future clients) can call it, replacing
  today's open endpoint. This also unlocks per-user/tenant scoping and an audit trail of who
  triggered what, rather than everything running as one shared service identity.
- Secrets management for hosted use (e.g. a proper secret store rather than local `.env` files).
- Reuse or pool MCP client connections in the Teams bot instead of connecting afresh
  for every tool call (fine for smoke testing, not for production traffic).
- Retro-specific reasoning beyond raw tool access: theme clustering of sticky notes and
  action drafting suggestions (the "retro summary" feature itself, distinct from the
  Jira-focused `cycle_overview`, is now built — see `retro_summary` above).
- **UI/UX design pass on the Miro templates.** Current layout (frames, colours, sticky
  placement) is programmer-designed and functional but not polished. Bring in proper UI/UX
  design for the retro board template and sticky styling (colour coding, spacing, iconography)
  so boards look intentional and are pleasant to run a retro on, not just structurally correct.
- **Action reminders/nudges between retros.** The original Retrospective Feedback Survey
  (n=8; stored outside this repository) found no team reports >75% retro-action completion.
  One respondent explicitly asked for owner-tagged reminders since Miro boards rarely get
  reopened between retros, including for actions that do not need a Jira ticket.
  Add a scheduled check that reminds owners of outstanding actions ahead of the next retro.
- **Explicit, visible cost/budget ownership.** A survey respondent raised concern over whether
  LLM/API token usage would be billed to an individual vs. the org. Once real service
  accounts/API keys are in place, document who owns the budget and how usage is billed,
  rather than assuming an individual's account will not be charged.
- **Data privacy/visibility of retro content.** Retro notes can reference sensitive
  inter-person/inter-team friction. Before any real (non-demo) retro content is processed,
  define and document who can see raw board content vs. summarised output, and how it's
  retained — this was flagged directly in user research as a blocker to trust.
- **Add human approval before writes and keep AI output tight.** Research feedback flagged
  verbose/hallucinated AI text and the risk of AI taking over sensitive, human interactions.
  Today the Teams commands `create retro`, `cycle overview` and `retro summary` perform writes
  as soon as requested; there is no separate approval gate. Add review/confirmation before
  creating actions or contacting people on a team's behalf. The assistant should draft and
  remind, not autonomously contact other teams or close out actions.

See [`mcp/README.md`](mcp/README.md) and [`teams/README.md`](teams/README.md) for
package-specific setup and status.
