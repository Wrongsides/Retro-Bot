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
| `miro_create_frame` | write | Create a Miro frame |
| `miro_create_sticky_note` | write | Create a Miro sticky note |
| `miro_create_retro` | write | Build an empty retro template (frames, columns, mood/dot-vote boxes, an Experiment Tracking box with a Go/No-Go on the previous experiment, dated marker) on a Miro board |
| `cycle_overview` | read + write | Summarise Jira actions completed/in-progress since the previous retro, and write ticket summaries as sticky notes to a "Cycle overview" box below the current retro |
| `github_list_open_issues` | read | List open issues in a GitHub repo |
| `github_create_issue` | write | Create a GitHub issue for a technical retro action |
| `github_search_examples` | read | Search the GitHub codebase for real code matching a query |
| `retro_summary` | read + write | Generate a warm narrative summary (via an LLM) of the latest retro's four columns, mood board and experiment tracking box, and create a Jira ticket (searching first to avoid duplicates) for each action item not already tracked. Fails closed (returns an error, no partial output) if the LLM call fails |
| `retro_github_examples` | read | Search GitHub for real code and commits matching items raised in the "What should we do differently?" and "Action items" columns of the latest retro (the LLM turns each item into a concise search query and filters the raw results for relevance). Reports, per item, if GitHub's search index is still building rather than silently showing "no examples found" |
| `retro_feedback` | write | Record a 1-5 star rating (with optional comment) of Retro-Bot itself, stored in a filesystem-backed feedback store |
| `retro_feedback_summary` | read | Report the average star rating and most recent comments from the feedback store |

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

### LLM-backed narrative summaries

`retro_summary` calls an LLM to turn the retro's raw sticky notes, mood reactions and
experiment tracking box into a short narrative, rather than a literal list of post-its.
`retro_github_examples` also calls an LLM, to turn each retro item into a concise GitHub
search query and to filter the raw search results for relevance. By default these run
against a **local Ollama instance** — GitHub Models (the original default) was fully retired
in July 2026, so there's no free hosted option to fall back to. With `USE_NULL_CLIENTS=true`
(default) canned output is returned instead of calling a real LLM. If the LLM call fails,
`retro_summary` fails closed — it returns an error rather than falling back to a
partial/literal narrative. `retro_github_examples` degrades gracefully instead: if the LLM
call fails for a given retro item, it falls back to a plain-text search query and skips
relevance filtering for that item, rather than failing the whole tool call.

### `retro_github_examples` searches both code and commits

For each retro item, `retro_github_examples` searches GitHub's `/search/code` and
`/search/commits` endpoints (scoped to the configured repo/org) and reports each
separately — code matches as file examples, commit matches as a "Relevant commits"
list (commit messages sometimes reveal "we fixed this once before" history that a
current-code search alone would miss). Both searches are capped at 3 results per item
and, when an LLM is configured, filtered for relevance.

GitHub's code/commit search index can lag a few minutes behind pushes, especially for
new or low-activity repositories — GitHub reports this as `incomplete_results: true`
rather than an error. When that happens for a given retro item, `retro_github_examples`
flags that item with a clear "Couldn't be checked — GitHub's code search index for this
repository is still building. Try again shortly." note instead of silently reporting "no
examples found", so it's never mistaken for a genuine no-match.

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
to the Miro board) are working end-to-end against real demo Jira/Miro accounts, driven from a
Teams bot (see [`../teams/README.md`](../teams/README.md)). Deeper retro-specific reasoning
(theme clustering, action drafting, follow-up nudges) is not yet implemented.

See [the root README](../README.md#plans-beyond-the-poc) for what's planned beyond the PoC —
notably moving off personal API tokens onto dedicated Jira/Miro/GitHub service accounts, and
adding OAuth in front of this server's `/mcp` endpoint (currently unauthenticated).
