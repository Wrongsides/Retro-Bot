import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { buildCycleJql, categorizeIssues, findPreviousCycleDate, type CategorizedIssues } from "../domain/cycleOverview.js";
import {
  cycleOverviewBoxLayout,
  cycleOverviewStickySlot,
  findCycleOverviewBox,
  findExperimentBox,
  findLatestRetroFrame,
} from "../domain/retroTemplate.js";
import { jiraClient as defaultJiraClient, miroClient as defaultMiroClient } from "../clients/index.js";
import { JiraClient, type JiraIssue } from "../clients/jiraClient.js";
import { MiroClient } from "../clients/miroClient.js";
import { logger } from "../utils/logger.js";

export interface CycleOverview extends CategorizedIssues {
  sinceDate: string;
}

export interface CycleOverviewOptions {
  boardId?: string;
  projectKey?: string;
}

export interface BoardUpdateResult {
  retroFrameTitle?: string;
  addedCount: number;
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export async function buildCycleOverview(
  miroClient: MiroClient,
  jiraClient: JiraClient,
  options: CycleOverviewOptions = {},
): Promise<CycleOverview> {
  const notes = await miroClient.getBoardStickyNotes(options.boardId);
  const sinceDate = findPreviousCycleDate(notes);
  if (!sinceDate) {
    throw new Error("No previous retro date found on the Miro board");
  }

  const projectKey = options.projectKey ?? config.jira.defaultProjectKey;
  const jql = buildCycleJql(sinceDate, projectKey);
  const issues = await jiraClient.searchIssues(jql);
  const { completed, inProgress } = categorizeIssues(issues);

  return { sinceDate, completed, inProgress };
}

/**
 * Adds a sticky note per completed/in-progress Jira issue to a dedicated
 * "Cycle overview" box below the most recently created retro frame on the
 * board, so ticket summaries get their own space instead of crowding the
 * "Action items" column. Reuses an existing box for the same retro (and
 * appends after its current notes) rather than creating a duplicate.
 */
export async function addCycleOverviewToBoard(
  miroClient: MiroClient,
  overview: CycleOverview,
  boardId?: string,
): Promise<BoardUpdateResult> {
  const items: Array<{ issue: JiraIssue; done: boolean }> = [
    ...overview.completed.map((issue) => ({ issue, done: true })),
    ...overview.inProgress.map((issue) => ({ issue, done: false })),
  ];
  if (items.length === 0) {
    return { addedCount: 0 };
  }

  const frames = await miroClient.getBoardFrames(boardId);
  const retroFrame = findLatestRetroFrame(frames);
  if (!retroFrame) {
    return { addedCount: 0 };
  }

  let box = findCycleOverviewBox(frames, retroFrame);
  let startIndex = 0;
  if (box) {
    const stickyNotes = await miroClient.getBoardStickyNotes(boardId);
    startIndex = stickyNotes.filter((note) => note.frameId === box!.id).length;
  } else {
    const belowFrame = findExperimentBox(frames, retroFrame) ?? retroFrame;
    const layout = cycleOverviewBoxLayout(retroFrame, items.length, belowFrame);
    const created = await miroClient.createFrame({ ...layout, boardId });
    box = { ...created, x: layout.x, y: layout.y, width: layout.width, height: layout.height };
  }

  for (let index = 0; index < items.length; index += 1) {
    const { issue, done } = items[index];
    const slot = cycleOverviewStickySlot(startIndex + index, box.width);
    await miroClient.createStickyNote({
      content: `${done ? "✅" : "🔄"} ${issue.key}: ${issue.summary}`,
      x: slot.x,
      y: slot.y,
      boardId,
      frameId: box.id,
    });
  }

  return { retroFrameTitle: retroFrame.title, addedCount: items.length };
}

function formatOverview(overview: CycleOverview): string {
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

function formatBoardUpdate(overview: CycleOverview, boardUpdate: BoardUpdateResult): string {
  const totalIssues = overview.completed.length + overview.inProgress.length;
  if (totalIssues === 0) {
    return "No tickets to add to the board.";
  }
  if (boardUpdate.addedCount > 0) {
    return `Added ${boardUpdate.addedCount} ticket summaries to the "Cycle overview" box below ${boardUpdate.retroFrameTitle}.`;
  }
  return "No retro board found on this Miro board to add ticket summaries to.";
}

export function registerCycleOverviewTools(
  server: McpServer,
  miroClient: MiroClient = defaultMiroClient,
  jiraClient: JiraClient = defaultJiraClient,
) {
  server.registerTool(
    "cycle_overview",
    {
      title: "Cycle overview",
      description:
        "Summarise Jira actions completed or still in progress since the previous retrospective, and add a " +
        "sticky note per ticket to a dedicated 'Cycle overview' box below the current retro board. Reads the " +
        "previous retro date from a dated sticky note on the Miro board, then searches Jira for matching issues.",
      inputSchema: {
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
        projectKey: z.string().optional().describe("Jira project key, defaults to configured project"),
      },
    },
    async ({ boardId, projectKey }) => {
      try {
        const overview = await buildCycleOverview(miroClient, jiraClient, { boardId, projectKey });
        const boardUpdate = await addCycleOverviewToBoard(miroClient, overview, boardId);
        const text = [formatOverview(overview), "", formatBoardUpdate(overview, boardUpdate)].join("\n");
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        logger.error("cycle_overview failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}


