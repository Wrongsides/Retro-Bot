import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { buildRetroJql, categorizeIssues, findPreviousRetroDate, type CategorizedIssues } from "../domain/retroOverview.js";
import { JiraClient } from "../integrations/jiraClient.js";
import { MiroClient } from "../integrations/miroClient.js";
import { logger } from "../utils/logger.js";

export interface RetroOverview extends CategorizedIssues {
  sinceDate: string;
}

export interface RetroOverviewOptions {
  boardId?: string;
  projectKey?: string;
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

const defaultMiroClient = config.useNullClients ? MiroClient.createNull() : MiroClient.create();
const defaultJiraClient = config.useNullClients ? JiraClient.createNull() : JiraClient.create();

export async function buildRetroOverview(
  miroClient: MiroClient,
  jiraClient: JiraClient,
  options: RetroOverviewOptions = {},
): Promise<RetroOverview> {
  const notes = await miroClient.getBoardStickyNotes(options.boardId);
  const sinceDate = findPreviousRetroDate(notes);
  if (!sinceDate) {
    throw new Error("No previous retro date found on the Miro board");
  }

  const projectKey = options.projectKey ?? config.jira.defaultProjectKey;
  const jql = buildRetroJql(sinceDate, projectKey);
  const issues = await jiraClient.searchIssues(jql);
  const { completed, inProgress } = categorizeIssues(issues);

  return { sinceDate, completed, inProgress };
}

function formatOverview(overview: RetroOverview): string {
  const lines = [`Since previous retro (${overview.sinceDate}):`, "", "Completed:"];
  lines.push(
    ...(overview.completed.length
      ? overview.completed.map((i) => `- ${i.key} ${i.summary} — ${i.url}`)
      : ["- None"]),
  );
  lines.push("", "In progress:");
  lines.push(
    ...(overview.inProgress.length
      ? overview.inProgress.map((i) => `- ${i.key} ${i.summary} — ${i.url}`)
      : ["- None"]),
  );
  return lines.join("\n");
}

export function registerRetroOverviewTools(
  server: McpServer,
  miroClient: MiroClient = defaultMiroClient,
  jiraClient: JiraClient = defaultJiraClient,
) {
  server.registerTool(
    "retro_overview",
    {
      title: "Retro overview",
      description:
        "Summarise Jira actions completed or still in progress since the previous retrospective. Reads the " +
        "previous retro date from a dated sticky note on the Miro board, then searches Jira for matching issues.",
      inputSchema: {
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
        projectKey: z.string().optional().describe("Jira project key, defaults to configured project"),
      },
    },
    async ({ boardId, projectKey }) => {
      try {
        const overview = await buildRetroOverview(miroClient, jiraClient, { boardId, projectKey });
        return { content: [{ type: "text" as const, text: formatOverview(overview) }] };
      } catch (err) {
        logger.error("retro_overview failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
