import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import {
  RETRO_COLUMN_TITLES,
  MOOD_BOX_TITLE,
  findColumnFrame,
  findExperimentBox,
  findLatestRetroFrame,
} from "../domain/retroTemplate.js";
import {
  summarizeColumn,
  summarizeMood,
  summarizeExperimentBox,
  buildNarrativePrompt,
  type ColumnSummary,
  type ExperimentSummary,
} from "../domain/retroSummary.js";
import { findGithubExamples, formatGithubExamples, type GithubExampleGroup } from "../domain/githubExamples.js";
import { buildFeedbackSummary, formatFeedbackSummary } from "../domain/feedbackSummary.js";
import {
  jiraClient as defaultJiraClient,
  miroClient as defaultMiroClient,
  feedbackStore as defaultFeedbackStore,
  llmClient as defaultLlmClient,
  githubClient as defaultGithubClient,
} from "../clients/index.js";
import { JiraClient, type JiraIssue } from "../clients/jiraClient.js";
import { MiroClient, type MiroFrameLayout, type MiroStickyNote } from "../clients/miroClient.js";
import { FeedbackStore } from "../clients/feedbackStore.js";
import { LlmClient } from "../clients/llmClient.js";
import { GitHubClient } from "../clients/githubClient.js";
import { logger } from "../utils/logger.js";

const ACTION_ITEMS_COLUMN_TITLE = "Action items";
const PROBLEM_COLUMN_TITLE = "What should we do differently?";
const GITHUB_EXAMPLE_COLUMN_TITLES = [PROBLEM_COLUMN_TITLE, ACTION_ITEMS_COLUMN_TITLE];
const ACTION_TICKET_LABEL = "retro-action";

export interface RetroSummaryOptions {
  boardId?: string;
  projectKey?: string;
  githubOwner?: string;
  githubRepo?: string;
}

export interface TicketResult {
  created: JiraIssue[];
  skipped: string[];
}

export interface RetroSummary {
  retroFrameTitle: string;
  columns: ColumnSummary[];
  mood: string[];
  experiment: ExperimentSummary;
  tickets: TicketResult;
  narrative: string;
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

function escapeJqlText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function createActionTickets(
  jiraClient: JiraClient,
  actionItems: string[],
  projectKey: string,
): Promise<TicketResult> {
  const created: JiraIssue[] = [];
  const skipped: string[] = [];

  for (const summary of actionItems) {
    const jql = `project = "${projectKey}" AND summary ~ "${escapeJqlText(summary)}"`;
    const matches = await jiraClient.searchIssues(jql);
    const alreadyTracked = matches.some((issue) => issue.summary.trim().toLowerCase() === summary.trim().toLowerCase());
    if (alreadyTracked) {
      skipped.push(summary);
      continue;
    }
    const issue = await jiraClient.createIssue({ projectKey, summary, labels: [ACTION_TICKET_LABEL] });
    created.push(issue);
  }

  return { created, skipped };
}

interface RetroBoardData {
  outerFrameTitle: string;
  frames: MiroFrameLayout[];
  outerFrame: MiroFrameLayout;
  stickyNotes: MiroStickyNote[];
  columns: ColumnSummary[];
}

async function loadRetroBoard(miroClient: MiroClient, boardId: string | undefined): Promise<RetroBoardData> {
  const frames = await miroClient.getBoardFrames(boardId);
  const outerFrame = findLatestRetroFrame(frames);
  if (!outerFrame) {
    throw new Error("No previous retro date found on the Miro board");
  }

  const stickyNotes = await miroClient.getBoardStickyNotes(boardId);

  const columns = RETRO_COLUMN_TITLES.map((title) => {
    const columnFrame = findColumnFrame(frames, outerFrame, title);
    return columnFrame ? summarizeColumn(stickyNotes, columnFrame) : { title, items: [] };
  });

  return { outerFrameTitle: outerFrame.title, frames, outerFrame, stickyNotes, columns };
}

export async function buildRetroSummary(
  miroClient: MiroClient,
  jiraClient: JiraClient,
  llmClient: LlmClient,
  options: RetroSummaryOptions = {},
): Promise<RetroSummary> {
  const { outerFrameTitle, frames, outerFrame, stickyNotes, columns } = await loadRetroBoard(
    miroClient,
    options.boardId,
  );

  const moodFrame = findColumnFrame(frames, outerFrame, MOOD_BOX_TITLE);
  const mood = moodFrame ? summarizeMood(stickyNotes, moodFrame) : [];

  const experimentFrame = findExperimentBox(frames, outerFrame);
  const experiment = experimentFrame
    ? summarizeExperimentBox(stickyNotes, experimentFrame)
    : { thisSprintExperiment: undefined, goNoGoOutcome: undefined };

  const actionItems = columns.find((column) => column.title === ACTION_ITEMS_COLUMN_TITLE)?.items ?? [];
  const projectKey = options.projectKey ?? config.jira.defaultProjectKey;
  const tickets = await createActionTickets(jiraClient, actionItems, projectKey);

  const narrative = await llmClient.complete(
    buildNarrativePrompt({ retroFrameTitle: outerFrameTitle, columns, mood, experiment }),
  );

  return { retroFrameTitle: outerFrameTitle, columns, mood, experiment, tickets, narrative };
}

export async function buildRetroGithubExamples(
  miroClient: MiroClient,
  githubClient: GitHubClient,
  llmClient: LlmClient,
  options: RetroSummaryOptions = {},
): Promise<GithubExampleGroup[]> {
  const { columns } = await loadRetroBoard(miroClient, options.boardId);

  const itemsToSearchGithub = columns
    .filter((column) => GITHUB_EXAMPLE_COLUMN_TITLES.includes(column.title))
    .flatMap((column) => column.items);

  return findGithubExamples(githubClient, itemsToSearchGithub, {
    owner: options.githubOwner,
    repo: options.githubRepo,
    llmClient,
  });
}

export function formatSummary(summary: RetroSummary): string {
  const lines = [summary.retroFrameTitle, "", summary.narrative, ""];

  lines.push("Experiment tracking");
  lines.push(`- This sprint: ${summary.experiment.thisSprintExperiment ?? "None"}`);
  lines.push(`- Previous experiment go/no-go: ${summary.experiment.goNoGoOutcome ?? "None"}`);
  lines.push("");

  lines.push("Jira actions");
  if (summary.tickets.created.length === 0 && summary.tickets.skipped.length === 0) {
    lines.push("- None");
  }
  lines.push(...summary.tickets.created.map((issue) => `- Created ${issue.key}: ${issue.summary} — ${issue.url}`));
  lines.push(...summary.tickets.skipped.map((item) => `- Already tracked: ${item}`));

  return lines.join("\n");
}

export function registerSummaryTools(
  server: McpServer,
  miroClient: MiroClient = defaultMiroClient,
  jiraClient: JiraClient = defaultJiraClient,
  feedbackStore: FeedbackStore = defaultFeedbackStore,
  llmClient: LlmClient = defaultLlmClient,
  githubClient: GitHubClient = defaultGithubClient,
) {
  server.registerTool(
    "retro_summary",
    {
      title: "Retro summary",
      description:
        "Summarise the outcomes of the most recent retro on the Miro board across every column, the mood " +
        "board and experiment tracking box. Create Jira tickets for untracked action items before generating " +
        "the LLM narrative; tickets are not rolled back if generation fails.",
      inputSchema: {
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
        projectKey: z.string().optional().describe("Jira project key, defaults to configured project"),
      },
    },
    async ({ boardId, projectKey }) => {
      try {
        const summary = await buildRetroSummary(miroClient, jiraClient, llmClient, {
          boardId,
          projectKey,
        });
        return { content: [{ type: "text" as const, text: formatSummary(summary) }] };
      } catch (err) {
        logger.error("retro_summary failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "retro_github_examples",
    {
      title: "Retro GitHub examples",
      description:
        "Find GitHub code and commits related to problems and actions in the most recent Miro retro, using " +
        "best-effort LLM-generated queries and relevance filtering.",
      inputSchema: {
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
        githubOwner: z.string().optional().describe("GitHub org/user to scope example search to"),
        githubRepo: z.string().optional().describe("GitHub repo to scope example search to (requires githubOwner)"),
      },
    },
    async ({ boardId, githubOwner, githubRepo }) => {
      try {
        const examples = await buildRetroGithubExamples(miroClient, githubClient, llmClient, {
          boardId,
          githubOwner,
          githubRepo,
        });
        const formatted = formatGithubExamples(examples);
        const text = formatted || "No GitHub examples found for the items raised in this retro.";
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        logger.error("retro_github_examples failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "retro_feedback",
    {
      title: "Retro-Bot feedback",
      description: "Record feedback on Retro-Bot itself, as a 1-5 star rating with an optional comment.",
      inputSchema: {
        rating: z.number().int().min(1).max(5).describe("Star rating from 1 to 5"),
        comment: z.string().optional().describe("Optional free-text feedback"),
      },
    },
    async ({ rating, comment }) => {
      try {
        const entry = await feedbackStore.record(rating, comment);
        return { content: [{ type: "text" as const, text: `Thanks for the feedback! Recorded ${entry.rating}/5.` }] };
      } catch (err) {
        logger.error("retro_feedback failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "retro_feedback_summary",
    {
      title: "Retro-Bot feedback summary",
      description: "Show the average star rating and most recent comments recorded for Retro-Bot itself.",
      inputSchema: {},
    },
    async () => {
      try {
        const entries = await feedbackStore.list();
        const summary = buildFeedbackSummary(entries);
        return { content: [{ type: "text" as const, text: formatFeedbackSummary(summary) }] };
      } catch (err) {
        logger.error("retro_feedback_summary failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
