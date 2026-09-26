import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { JiraClient } from "../integrations/jiraClient.js";
import { logger } from "../utils/logger.js";

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

const defaultClient = config.useNullClients ? JiraClient.createNull() : JiraClient.create();

export function registerJiraTools(server: McpServer, client: JiraClient = defaultClient) {
  server.registerTool(
    "jira_search_actions",
    {
      title: "Search Jira actions",
      description:
        "Search existing Jira issues using a JQL query. Use this to check whether an action from a " +
        "previous retrospective already exists before creating a duplicate.",
      inputSchema: {
        jql: z.string().describe("JQL query, e.g. 'project = RETRO AND status != Done'"),
      },
    },
    async ({ jql }) => {
      try {
        const issues = await client.searchIssues(jql);
        return {
          content: [
            {
              type: "text" as const,
              text: issues.length
                ? issues.map((i) => `${i.key} [${i.status}] ${i.summary} — ${i.url}`).join("\n")
                : "No matching issues found.",
            },
          ],
        };
      } catch (err) {
        logger.error("jira_search_actions failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "jira_create_action",
    {
      title: "Create Jira action",
      description:
        "Create a Jira issue for a retrospective action item. Requires human confirmation of the " +
        "summary and owner before being called — this tool performs the creation, it does not decide " +
        "what should be created.",
      inputSchema: {
        summary: z.string().describe("Short, specific action title, e.g. 'Add retry logic to X'"),
        description: z.string().optional().describe("Extra context, including suggested owner"),
        projectKey: z.string().optional().describe("Jira project key, defaults to configured project"),
        labels: z.array(z.string()).optional(),
      },
    },
    async ({ summary, description, projectKey, labels }) => {
      try {
        const issue = await client.createIssue({ summary, description, projectKey, labels });
        return {
          content: [{ type: "text" as const, text: `Created ${issue.key}: ${issue.summary} — ${issue.url}` }],
        };
      } catch (err) {
        logger.error("jira_create_action failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
