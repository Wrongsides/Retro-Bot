import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findAllRetroFrames, findColumnFrame, MOOD_BOX_TITLE, RETRO_COLUMN_TITLES } from "../domain/retroTemplate.js";
import { summarizeColumn, summarizeMood } from "../domain/retroSummary.js";
import {
  buildSentimentTrendNarrative,
  formatSentimentTrend,
  scoreRetroSentiment,
  type RetroSentiment,
} from "../domain/sentimentTrend.js";
import { miroClient as defaultMiroClient, llmClient as defaultLlmClient } from "../clients/index.js";
import { MiroClient } from "../clients/miroClient.js";
import { LlmClient } from "../clients/llmClient.js";
import { logger } from "../utils/logger.js";

const DEFAULT_RETRO_COUNT = 5;

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export interface RetroSentimentTrendOptions {
  boardId?: string;
  count?: number;
}

export interface RetroSentimentTrendResult {
  sentiments: RetroSentiment[];
  narrative?: string;
}

export async function buildRetroSentimentTrend(
  miroClient: MiroClient,
  llmClient: LlmClient,
  options: RetroSentimentTrendOptions = {},
): Promise<RetroSentimentTrendResult> {
  const frames = await miroClient.getBoardFrames(options.boardId);
  const allRetroFrames = findAllRetroFrames(frames);
  if (allRetroFrames.length === 0) {
    throw new Error("No previous retro date found on the Miro board");
  }

  const count = options.count ?? DEFAULT_RETRO_COUNT;
  const retroFrames = allRetroFrames.slice(-count);
  const stickyNotes = await miroClient.getBoardStickyNotes(options.boardId);

  const sentiments: RetroSentiment[] = [];
  for (const outerFrame of retroFrames) {
    const columns = RETRO_COLUMN_TITLES.map((title) => {
      const columnFrame = findColumnFrame(frames, outerFrame, title);
      return columnFrame ? summarizeColumn(stickyNotes, columnFrame) : { title, items: [] };
    });
    const moodFrame = findColumnFrame(frames, outerFrame, MOOD_BOX_TITLE);
    const mood = moodFrame ? summarizeMood(stickyNotes, moodFrame) : [];

    sentiments.push(await scoreRetroSentiment(outerFrame.title, columns, mood, llmClient));
  }

  const narrative = await buildSentimentTrendNarrative(sentiments, llmClient);

  return { sentiments, ...(narrative ? { narrative } : {}) };
}

export function registerSentimentTrendTools(
  server: McpServer,
  miroClient: MiroClient = defaultMiroClient,
  llmClient: LlmClient = defaultLlmClient,
) {
  server.registerTool(
    "retro_sentiment_trend",
    {
      title: "Retro sentiment trend",
      description:
        "Use an LLM to score team sentiment (1-5) from every column and the mood box of recent Miro retros " +
        "(five by default, configurable with count), then describe the trend. Retros that cannot be scored " +
        "are marked individually.",
      inputSchema: {
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
        count: z.number().int().positive().optional().describe("How many of the most recent retros to include, defaults to 5"),
      },
    },
    async ({ boardId, count }) => {
      try {
        const result = await buildRetroSentimentTrend(miroClient, llmClient, { boardId, count });
        return { content: [{ type: "text" as const, text: formatSentimentTrend(result.sentiments, result.narrative) }] };
      } catch (err) {
        logger.error("retro_sentiment_trend failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
