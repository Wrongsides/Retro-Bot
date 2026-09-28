import { describe, expect, test } from "vitest";
import { buildRetroSentimentTrend } from "../../src/tools/sentimentTrendTools.js";
import { buildRetroTemplateLayout, MOOD_BOX_TITLE } from "../../src/domain/retroTemplate.js";
import { MiroClient, type MiroFrameLayout, type MiroStickyNote } from "../../src/clients/miroClient.js";
import { LlmClient } from "../../src/clients/llmClient.js";

function retroFrames(prefix: string, date: string, originY: number): MiroFrameLayout[] {
  const layout = buildRetroTemplateLayout(new Date(date), { x: 0, y: originY });
  return [
    { id: `${prefix}-outer`, title: layout.frame.title, x: layout.frame.x, y: layout.frame.y, width: layout.frame.width, height: layout.frame.height },
    { id: `${prefix}-mood`, title: layout.moodBox.title, x: layout.moodBox.x, y: layout.moodBox.y, width: layout.moodBox.width, height: layout.moodBox.height },
    ...layout.columns.map((column, index) => ({
      id: `${prefix}-column-${index}`,
      title: column.title,
      x: column.x,
      y: column.y,
      width: column.width,
      height: column.height,
    })),
  ];
}

describe("buildRetroSentimentTrend", () => {
  test("scores each retro found on the board, oldest first, and builds a trend narrative", async () => {
    const miroClient = MiroClient.createNull({
      frames: [...retroFrames("r1", "2026-08-01T00:00:00.000Z", 0), ...retroFrames("r2", "2026-08-15T00:00:00.000Z", 5000)],
      stickyNotes: [
        { id: "1", content: "CI is too slow", x: 0, y: 0, frameId: "r1-column-1" },
        { id: "2", content: "😞 frustrated", x: 0, y: 0, frameId: "r1-mood" },
        { id: "3", content: "Shipped the release on time", x: 0, y: 0, frameId: "r2-column-0" },
        { id: "4", content: "😀 great sprint", x: 0, y: 0, frameId: "r2-mood" },
      ],
    });
    const llmClient = LlmClient.createNull({
      completion: ["Score: 2\nReason: CI frustration.", "Score: 4\nReason: Smooth release.", "Sentiment improved after the CI fix landed."],
    });

    const result = await buildRetroSentimentTrend(miroClient, llmClient);

    expect(result.sentiments).toEqual([
      { retroFrameTitle: "Retro - 2026-08-01", score: 2, reason: "CI frustration." },
      { retroFrameTitle: "Retro - 2026-08-15", score: 4, reason: "Smooth release." },
    ]);
    expect(result.narrative).toBe("Sentiment improved after the CI fix landed.");
  });

  test("only analyses the most recent retros up to the given count", async () => {
    const miroClient = MiroClient.createNull({
      frames: [
        ...retroFrames("r1", "2026-08-01T00:00:00.000Z", 0),
        ...retroFrames("r2", "2026-08-15T00:00:00.000Z", 5000),
        ...retroFrames("r3", "2026-08-29T00:00:00.000Z", 10000),
      ],
      stickyNotes: [],
    });
    const llmClient = LlmClient.createNull({ completion: "Score: 3\nReason: Steady." });

    const result = await buildRetroSentimentTrend(miroClient, llmClient, { count: 2 });

    expect(result.sentiments.map((sentiment) => sentiment.retroFrameTitle)).toEqual([
      "Retro - 2026-08-15",
      "Retro - 2026-08-29",
    ]);
  });

  test("throws a clear error when there are no retro frames on the board", async () => {
    const miroClient = MiroClient.createNull({ frames: [] });
    const llmClient = LlmClient.createNull();

    await expect(buildRetroSentimentTrend(miroClient, llmClient)).rejects.toThrow(
      "No previous retro date found on the Miro board",
    );
  });
});
