# retro-bot

Proof-of-concept MCP server for a **Retrospective Optimiser / Assistant**.

## What this is

A raw [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
MCP server exposing Jira, Miro and GitHub tools alongside retro template creation, cycle
overview, LLM-written summaries, GitHub examples, sentiment trends and feedback. Theme
clustering, action drafting suggestions and between-retro nudges remain planned.

**Why raw SDK, not Mastra?** This intentionally follows
[`msmg-private/ai-tools` ADR-0005](https://github.com/msmg-private/ai-tools/blob/main/docs/adr/adr-0005-do-not-adopt-mastra-for-mcp-server.md),
which found Mastra's MCP layer strips `_meta` from error/resource responses and only supports
endpoint-level (not per-tool) auth. The current [Teams bot](../teams/README.md) calls this
server directly as an MCP client; no Mastra wrapper is involved.

## Tools

| Tool | Type | Description |
|---|---|---|
| `jira_search_actions` | read | Search Jira issues via JQL (avoid duplicate actions) |
| `jira_create_action` | write | Create a Jira issue for a retro action |
| `miro_get_retro_notes` | read | Read raw sticky-note content from a Miro retro board |
| `miro_create_frame` | write | Create a Miro frame |
| `miro_create_sticky_note` | write | Create a Miro sticky note |
| `miro_create_retro` | write | Build an empty retro template (frames, columns, mood/dot-vote boxes, an Experiment Tracking box with a Go/No-Go on the previous experiment, dated marker) on a Miro board |
| `cycle_overview` | read + write | Use a dated Miro sticky to find Jira issues marked Done and updated since that date plus all issues currently In Progress; append ticket summaries to a "Cycle overview" box below the latest retro |
| `github_list_open_issues` | read | List open issues in a GitHub repo |
| `github_create_issue` | write | Create a GitHub issue for a technical retro action |
| `github_search_examples` | read | Search GitHub code for a supplied query (no LLM or commit search); reports search errors to the caller |
| `retro_summary` | read + write | Generate an LLM narrative of the latest retro's four columns, mood and experiment, and create a Jira ticket for each untracked action item *before* calling the LLM. An LLM error returns no summary but does not roll back created tickets |
| `retro_github_examples` | read | Search GitHub code and commits for problems and actions in the latest retro, using best-effort LLM-generated queries and relevance filtering. Flags incomplete GitHub search results per item |
| `retro_sentiment_trend` | read | Score recent retros (five by default, configurable with `count`) from their columns and mood (1-5) with an LLM; list scores and, when possible, a trend narrative. Flags individual retros that could not be scored |
| `retro_feedback` | write | Record a 1-5 star rating (with optional comment) of Retro-Bot itself, stored in a JSON file with real clients or in memory with null clients |
| `retro_feedback_summary` | read | Report the average star rating and most recent comments from the feedback store |

**Writes and approval:** There is no enforced confirmation step. Calling a write tool
creates the corresponding Miro/Jira/GitHub item immediately. In particular, `retro_summary`
searches Jira and creates tickets for untracked action items *before* requesting its LLM
narrative; if the LLM later fails, those tickets remain. `cycle_overview` reuses its box on
repeat calls but appends ticket stickies again, including duplicates. Review the board and
intended actions before invoking these tools.

## Running locally

From the repository root (Node.js >=22; pnpm 11):

```bash
pnpm install
cp mcp/.env.example mcp/.env   # USE_NULL_CLIENTS=true by default
pnpm --filter mcp dev          # starts on http://localhost:8080
```

Health check: `GET http://localhost:8080/health`

MCP endpoint (stateless Streamable HTTP): `POST http://localhost:8080/mcp`.
It is **unauthenticated**; do not expose it publicly or forward it through a tunnel.

### Inspecting tools interactively

With the MCP server running, launch the
[MCP Inspector](https://github.com/modelcontextprotocol/inspector) separately:

```bash
pnpm dlx @modelcontextprotocol/inspector
```

In the Inspector, select **Streamable HTTP** and connect to
`http://localhost:8080/mcp`. The package's `inspect` script invokes the
Inspector with `node dist/server.js` as a stdio server, so it does not
connect to this HTTP endpoint.

### Using the live Jira/Miro/GitHub APIs

Set `USE_NULL_CLIENTS=false` in `mcp/.env` and fill in the relevant credentials
(`JIRA_*`, `MIRO_*`, `GITHUB_*`). With null clients on (default), each integration returns
in-memory demo data; feedback is also in memory. With real clients, feedback is written to
`FEEDBACK_STORE_PATH` (relative to the MCP process working directory; the package script
runs from `mcp/`). Real Miro notes sent to the LLM may contain sensitive retro feedback;
define visibility and retention before using non-demo content.
The Teams commands use configured defaults, so set `MIRO_DEFAULT_BOARD_ID`,
`JIRA_DEFAULT_PROJECT_KEY` and `GITHUB_DEFAULT_OWNER`/`GITHUB_DEFAULT_REPO` for
the corresponding live integrations.

### Testing

From the repository root:

```bash
pnpm --filter mcp test
pnpm --filter mcp typecheck
pnpm --filter mcp build
```

There is no CI/CD or deployment workflow configured in this repository.

### LLM-backed narrative summaries

`retro_summary` calls an LLM to turn the retro's raw sticky notes, mood reactions and
experiment tracking box into a short narrative, rather than a literal list of post-its.
`retro_github_examples` also calls an LLM, to turn each retro item into a concise GitHub
search query and to filter the raw search results for relevance. `retro_sentiment_trend`
calls an LLM once per retro (to score 1-5 sentiment from its columns and mood board) plus
once more for an overall trend narrative across the scored retros. With
`USE_NULL_CLIENTS=false`, the LLM endpoint defaults to a **local Ollama instance** — GitHub
Models (the original default) was fully retired in July 2026. With `USE_NULL_CLIENTS=true`
(the default) canned output is returned instead of calling a real LLM. If the LLM call fails,
`retro_summary` returns an error rather than falling back to a partial/literal narrative
(but does not roll back tickets created earlier). `retro_github_examples` instead falls
back silently to a literal search query or unfiltered results if its LLM call fails.
`retro_sentiment_trend` marks an individual retro as unscored if its LLM score call fails;
an LLM failure when generating the trend narrative simply omits that narrative.

The default null LLM returns generic narrative text, not a `Score`/`Reason` response.
Thus the default null-client demo cannot produce sentiment scores or a Teams chart;
meaningful sentiment analysis requires the real LLM.

### `retro_github_examples` searches both code and commits

For each retro item, `retro_github_examples` searches GitHub's `/search/code` and
`/search/commits` endpoints (scoped to the configured repo/org) and reports each
separately — code matches as file examples, commit matches as a "Relevant commits"
list (commit messages sometimes reveal "we fixed this once before" history that a
current-code search alone would miss). Both searches are capped at 3 results per item
and, when an LLM is configured, filtered for relevance.

GitHub's code/commit search index can lag behind pushes, especially for
new or low-activity repositories — GitHub reports this as `incomplete_results: true`
rather than an error. When that happens for a given retro item, `retro_github_examples`
flags that item with a clear "Couldn't be checked — GitHub's code search index for this
repository is still building. Try again shortly." note instead of silently reporting "no
examples found", so it's never mistaken for a genuine no-match.

Other GitHub search errors (including HTTP 403) are logged but skipped for that item.
If all searches fail this way, the tool may say "No GitHub examples found"; this does
**not** guarantee the repository has no matches. The direct `github_search_examples`
tool instead returns an error for a failed code search.

### `retro_sentiment_trend` scores mood across recent retros

`retro_sentiment_trend` finds retro outer frames on the board (5 by default, configurable
via the `count` input), and for each one asks the LLM to score team sentiment 1-5 from
every column plus the mood board, with a one-line reason. It then asks the LLM once
more for a short narrative describing the trend across those scores (e.g. "sentiment
dipped after the on-call incident before recovering"). The narrative is only requested
when at least two retros were successfully scored. Frames are ordered by vertical
position, as the template places newer retros below older ones; moving frames manually
can change which retros count as "most recent."

If scoring a given retro fails (LLM error or an unparseable response), that retro is
flagged inline — `"Couldn't be scored — sentiment analysis failed for this retro."` —
rather than dropping it silently or failing the whole tool call, so a single bad LLM
response doesn't hide the trend for every other retro.

Scores are derived from the board's *current* sticky notes on every request, not stored
as historical snapshots. Edited or missing notes can change past scores. Treat these
LLM interpretations as a conversation prompt, not a measurement of individuals or
the team's wellbeing.

The Teams bot's `"sentiment trend"` command also renders a simple Adaptive Card
bar chart for successfully scored retros, in addition to the plain-text tool output.

**Local dev with Ollama (default):** `LlmClient` POSTs to `{LLM_BASE_URL}/chat/completions`
using the standard OpenAI chat-completions shape, which [Ollama's OpenAI-compatible
API](https://github.com/ollama/ollama/blob/main/docs/openai.md) also implements — no code
changes needed. Install Ollama locally:

```bash
ollama serve       # start the server
ollama pull llama3.1
```

Stop it by quitting the app, `brew services stop ollama`, or killing the `ollama serve`
process.

(A Docker Compose setup was tried but doesn't work on networks with TLS-inspecting
corporate proxies — the host trusts the proxy's root CA, but the Ollama container's model
pull doesn't, so `ollama pull` fails inside the container. Running Ollama natively avoids
this since it uses the host's own trust store.)

Either way, the defaults already point here — no `.env` changes required:

```bash
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1
GITHUB_MODELS_TOKEN=ollama   # ignored by Ollama, but the client always sends a Bearer token
```

**Using a hosted provider instead:** point `LLM_BASE_URL`/`LLM_MODEL`/`GITHUB_MODELS_TOKEN`
at any other OpenAI-compatible chat-completions endpoint (e.g.
[Azure AI Foundry](https://ai.azure.com/), which GitHub now points to as GitHub Models'
replacement).

## Status

Proof of concept — retro template creation and cycle overview (Jira actions summary written
to the Miro board) have been exercised against demo Jira/Miro accounts through the Teams
bot (see [`../teams/README.md`](../teams/README.md)). Summaries, GitHub examples and
sentiment trends are implemented; theme clustering, action drafting suggestions and
follow-up nudges are not.

`cycle_overview` takes the **first** dated retro sticky returned by Miro, not necessarily
the most recent when a board holds multiple retros. Its Jira query includes every
currently In Progress issue in the project, regardless of when it was updated.

See [the root README](../README.md#plans-beyond-the-poc) for what's planned beyond the PoC —
notably moving off personal API tokens onto dedicated Jira/Miro/GitHub service accounts, and
adding OAuth in front of this server's `/mcp` endpoint (currently unauthenticated).
