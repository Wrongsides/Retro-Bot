import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { githubClient as defaultClient } from "../clients/index.js";
import { GitHubClient } from "../clients/githubClient.js";
import { logger } from "../utils/logger.js";

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export function registerGitHubTools(server: McpServer, client: GitHubClient = defaultClient) {
  server.registerTool(
    "github_list_open_issues",
    {
      title: "List open GitHub issues",
      description:
        "List open issues in a GitHub repository. Use this to check whether a tech-debt retro action " +
        "already has a tracked issue before creating a new one.",
      inputSchema: {
        owner: z.string().optional().describe("Repository owner, defaults to configured owner"),
        repo: z.string().optional().describe("Repository name, defaults to configured repo"),
      },
    },
    async ({ owner, repo }) => {
      try {
        const issues = await client.listOpenIssues(owner, repo);
        return {
          content: [
            {
              type: "text" as const,
              text: issues.length
                ? issues.map((i) => `#${i.number} [${i.state}] ${i.title} — ${i.url}`).join("\n")
                : "No open issues found.",
            },
          ],
        };
      } catch (err) {
        logger.error("github_list_open_issues failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "github_create_issue",
    {
      title: "Create GitHub issue",
      description:
        "Create a GitHub issue for a retrospective action that is a technical/code-level task. Requires " +
        "human confirmation of the title before being called.",
      inputSchema: {
        title: z.string(),
        body: z.string().optional(),
        owner: z.string().optional(),
        repo: z.string().optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async ({ title, body, owner, repo, labels }) => {
      try {
        const issue = await client.createIssue({ title, body, owner, repo, labels });
        return {
          content: [{ type: "text" as const, text: `Created #${issue.number}: ${issue.title} — ${issue.url}` }],
        };
      } catch (err) {
        logger.error("github_create_issue failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "github_search_examples",
    {
      title: "Search GitHub for code examples",
      description:
        "Search the GitHub codebase for real code matching a query. Useful for finding concrete evidence " +
        "in the code of a problem raised in a retro.",
      inputSchema: {
        query: z.string().describe("Search text, e.g. a problem or action item raised in the retro"),
        owner: z.string().optional().describe("Repository owner or GitHub org to scope the search to"),
        repo: z.string().optional().describe("Repository name to scope the search to (requires owner)"),
      },
    },
    async ({ query, owner, repo }) => {
      try {
        const results = await client.searchCode(query, owner, repo);
        return {
          content: [
            {
              type: "text" as const,
              text: results.length
                ? results.map((r) => `${r.repository} ${r.path} — ${r.url}`).join("\n")
                : "No matching code found.",
            },
          ],
        };
      } catch (err) {
        logger.error("github_search_examples failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
