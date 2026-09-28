import type { LlmClient } from "../clients/llmClient.js";
import type { ColumnSummary } from "./retroSummary.js";

const SCORING_FAILED_NOTE = "Couldn't be scored — sentiment analysis failed for this retro.";
const MIN_SCORED_RETROS_FOR_NARRATIVE = 2;

export interface RetroSentiment {
  retroFrameTitle: string;
  score?: number;
  reason?: string;
  note?: string;
}

function buildSentimentPrompt(retroFrameTitle: string, columns: ColumnSummary[], mood: string[]): string {
  const lines = [
    `Score how the team felt during this retrospective, based on everything raised in it: ${retroFrameTitle}.`,
    "Respond with exactly two lines, in this format, and nothing else:",
    "Score: <a single whole number from 1 (very negative) to 5 (very positive)>",
    "Reason: <one short sentence explaining the score>",
    "",
  ];

  for (const column of columns) {
    lines.push(`${column.title}:`);
    lines.push(column.items.length ? column.items.join(" ") : "Nothing was raised.");
    lines.push("");
  }

  lines.push("Team mood:");
  lines.push(mood.length ? mood.join(" ") : "Nobody left a mood reaction.");

  return lines.join("\n");
}

function parseSentimentCompletion(completion: string): { score: number; reason: string } | undefined {
  const scoreMatch = completion.match(/Score:\s*([1-5])/i);
  const reasonMatch = completion.match(/Reason:\s*(.+)/is);
  if (!scoreMatch || !reasonMatch) {
    return undefined;
  }
  const reason = reasonMatch[1].trim().split(/\r?\n/)[0].trim();
  if (!reason) {
    return undefined;
  }
  return { score: Number.parseInt(scoreMatch[1], 10), reason };
}

export async function scoreRetroSentiment(
  retroFrameTitle: string,
  columns: ColumnSummary[],
  mood: string[],
  llmClient: LlmClient,
): Promise<RetroSentiment> {
  try {
    const completion = await llmClient.complete(buildSentimentPrompt(retroFrameTitle, columns, mood));
    const parsed = parseSentimentCompletion(completion);
    if (!parsed) {
      return { retroFrameTitle, note: SCORING_FAILED_NOTE };
    }
    return { retroFrameTitle, score: parsed.score, reason: parsed.reason };
  } catch {
    return { retroFrameTitle, note: SCORING_FAILED_NOTE };
  }
}

function buildTrendNarrativePrompt(sentiments: RetroSentiment[]): string {
  const lines = [
    "Here is a team's sentiment score (1-5) for a sequence of retrospectives, oldest first.",
    "Write one short sentence describing the trend across them.",
    "",
  ];
  for (const sentiment of sentiments) {
    lines.push(`${sentiment.retroFrameTitle}: ${sentiment.score}/5 — ${sentiment.reason}`);
  }
  return lines.join("\n");
}

export async function buildSentimentTrendNarrative(
  sentiments: RetroSentiment[],
  llmClient: LlmClient,
): Promise<string | undefined> {
  const scored = sentiments.filter((sentiment) => sentiment.score !== undefined);
  if (scored.length < MIN_SCORED_RETROS_FOR_NARRATIVE) {
    return undefined;
  }
  try {
    const completion = await llmClient.complete(buildTrendNarrativePrompt(scored));
    return completion.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function formatSentimentTrend(sentiments: RetroSentiment[], narrative: string | undefined): string {
  if (sentiments.length === 0) {
    return "No retros found on the board to analyse.";
  }

  const lines = ["Sentiment trend", ""];
  for (const sentiment of sentiments) {
    const detail = sentiment.note ?? `${sentiment.score}/5 — ${sentiment.reason}`;
    lines.push(`- ${sentiment.retroFrameTitle}: ${detail}`);
  }
  if (narrative) {
    lines.push("", `Trend: ${narrative}`);
  }

  return lines.join("\n");
}
