# retro-bot

Proof-of-concept **Retrospective Optimiser / Assistant** — helps run better retros, makes
hosting one less intimidating, and keeps track of the actions that come out of them.

This is a pnpm workspace with two packages:

| Package | What it is |
|---|---|
| [`mcp/`](mcp/README.md) | An MCP server exposing Jira/Miro/GitHub tools, plus retro-specific tools (create a retro board, summarise a cycle) |
| [`teams/`](teams/README.md) | A Microsoft Teams bot that acts as an MCP **client**, so the tools above can be driven from a Teams chat |

```
Teams client ⇄ Azure Bot / Bot Framework ⇄ teams (MCP client) ⇄ mcp (MCP server) ⇄ Jira / Miro / GitHub
```

## Progress so far

- **Monorepo split** into `mcp` (server) and `teams` (client) pnpm workspace packages, with a
  shared `src/clients` module so Jira/Miro/GitHub clients are constructed once, not per-tool.
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
  auto-offset below all existing ones on the board.
- **`cycle_overview`** — reads the previous retro's date off the board, searches Jira for
  issues completed or still in progress since then, returns a text summary, *and* writes a
  sticky note per ticket into a dedicated "Cycle overview" box below the current retro frame
  (reusing/appending to that box on repeat runs, rather than duplicating it).
- **Teams bot scaffold** — a Bot Framework bot (Express-based) that opens an MCP session per
  message and supports `tools`, `create retro`, and `cycle overview` chat commands. Verified
  end-to-end against a real demo Miro board and Jira project via the Bot Framework Emulator.
- Nullable-infrastructure test doubles (`Client.createNull()`) for Jira/Miro/GitHub so the
  whole tool surface is unit-tested without hitting real APIs (see `mcp/test/`).

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
- Secrets management for the above (e.g. a proper secret store rather than `.env` files) once
  real credentials are involved.
- Longer-lived MCP sessions/connection pooling in the Teams bot instead of one session per
  message (fine for smoke testing, not for production traffic).
- Retro-specific reasoning beyond raw tool access: theme clustering of sticky notes, action
  drafting suggestions, and a separate "retro summary" feature (as distinct from the
  Jira-focused `cycle_overview`).
- **UI/UX design pass on the Miro templates.** Current layout (frames, colours, sticky
  placement) is programmer-designed and functional but not polished. Bring in proper UI/UX
  design for the retro board template and sticky styling (colour coding, spacing, iconography)
  so boards look intentional and are pleasant to run a retro on, not just structurally correct.
- **Action reminders/nudges between retros.** A team survey run for this project's evidence
  base (n=8, see internal tech-lead-task notes) found no team reports >75% retro-action
  completion, and respondents explicitly asked for a nudge mechanism, since boards like Miro
  rarely get reopened between retros. Add a scheduled check that reminds owners of
  outstanding actions ahead of the next retro.
- **Explicit, visible cost/budget ownership.** Survey respondents raised concern over whether
  LLM/API token usage would be billed to an individual vs. the org. Once real service
  accounts/API keys are in place, make clear (in docs and, ideally, in-product) that usage is
  billed at an org level, not to an individual's account.
- **Data privacy/visibility of retro content.** Retro notes can reference sensitive
  inter-person/inter-team friction. Before any real (non-demo) retro content is processed,
  define and document who can see raw board content vs. summarised output, and how it's
  retained — this was flagged directly in user research as a blocker to trust.
- **Keep AI-generated output tight and human-reviewed.** Research feedback specifically
  flagged verbose/hallucinated AI text as a concern. Any future summarisation/theme-clustering
  work should keep prompts tightly scoped and continue this PoC's existing principle that
  "write" tools only execute after explicit human confirmation — the assistant should draft
  and remind, not decide or act autonomously (e.g. it should not contact other teams or close
  out actions on its own).

See [`mcp/README.md`](mcp/README.md) and [`teams/README.md`](teams/README.md) for
package-specific setup and status.
