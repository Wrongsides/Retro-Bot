import { describe, expect, test } from "vitest";
import { buildSentimentTrendNarrative, formatSentimentTrend, scoreRetroSentiment } from "../../src/domain/sentimentTrend.js";
import { LlmClient } from "../../src/clients/llmClient.js";
import type { ColumnSummary } from "../../src/domain/retroSummary.js";

const columns: ColumnSummary[] = [
  { title: "What went well?", items: ["Shipped the release on time"] },
  { title: "What should we do differently?", items: ["CI is too slow"] },
  { title: "What should we start doing?", items: [] },
  { title: "Action items", items: ["Speed up CI"] },
];

describe("scoreRetroSentiment", () => {
  test("asks the LLM for a 1-5 score and a one-line reason", async () => {
    const llmClient = LlmClient.createNull({ completion: "Score: 4\nReason: The team felt positive about the release." });

    const sentiment = await scoreRetroSentiment("Retro - 2026-08-01", columns, ["😀 great sprint"], llmClient);

    expect(sentiment).toEqual({
      retroFrameTitle: "Retro - 2026-08-01",
      score: 4,
      reason: "The team felt positive about the release.",
    });
  });

  test("records a note instead of throwing when the LLM call fails", async () => {
    const llmClient = LlmClient.createNull({ failure: { status: 503 } });

    const sentiment = await scoreRetroSentiment("Retro - 2026-08-01", columns, [], llmClient);

    expect(sentiment).toEqual({
      retroFrameTitle: "Retro - 2026-08-01",
      note: "Couldn't be scored — sentiment analysis failed for this retro.",
    });
  });

  test("records a note instead of throwing when the LLM response can't be parsed", async () => {
    const llmClient = LlmClient.createNull({ completion: "I'm not sure how to score this." });

    const sentiment = await scoreRetroSentiment("Retro - 2026-08-01", columns, [], llmClient);

    expect(sentiment).toEqual({
      retroFrameTitle: "Retro - 2026-08-01",
      note: "Couldn't be scored — sentiment analysis failed for this retro.",
    });
  });
});

describe("buildSentimentTrendNarrative", () => {
  test("asks the LLM to describe the trend across scored retros", async () => {
    const llmClient = LlmClient.createNull({ completion: "Sentiment improved after the CI fix landed." });
    const sentiments = [
      { retroFrameTitle: "Retro - 2026-08-01", score: 2, reason: "CI frustration" },
      { retroFrameTitle: "Retro - 2026-08-15", score: 4, reason: "CI fixed" },
    ];

    const narrative = await buildSentimentTrendNarrative(sentiments, llmClient);

    expect(narrative).toBe("Sentiment improved after the CI fix landed.");
  });

  test("returns undefined when fewer than two retros were successfully scored", async () => {
    const llmClient = LlmClient.createNull({ completion: "Should never be called." });
    const sentiments = [{ retroFrameTitle: "Retro - 2026-08-01", score: 2, reason: "CI frustration" }];

    const narrative = await buildSentimentTrendNarrative(sentiments, llmClient);

    expect(narrative).toBeUndefined();
  });

  test("returns undefined instead of throwing when the LLM call fails", async () => {
    const llmClient = LlmClient.createNull({ failure: { status: 503 } });
    const sentiments = [
      { retroFrameTitle: "Retro - 2026-08-01", score: 2, reason: "CI frustration" },
      { retroFrameTitle: "Retro - 2026-08-15", score: 4, reason: "CI fixed" },
    ];

    const narrative = await buildSentimentTrendNarrative(sentiments, llmClient);

    expect(narrative).toBeUndefined();
  });
});

describe("formatSentimentTrend", () => {
  test("lists each retro's score and reason, then the trend narrative", () => {
    const text = formatSentimentTrend(
      [
        { retroFrameTitle: "Retro - 2026-08-01", score: 2, reason: "CI frustration" },
        { retroFrameTitle: "Retro - 2026-08-15", score: 4, reason: "CI fixed" },
      ],
      "Sentiment improved after the CI fix landed.",
    );

    expect(text).toBe(
      [
        "Sentiment trend",
        "",
        "- Retro - 2026-08-01: 2/5 — CI frustration",
        "- Retro - 2026-08-15: 4/5 — CI fixed",
        "",
        "Trend: Sentiment improved after the CI fix landed.",
      ].join("\n"),
    );
  });

  test("shows the note for a retro that couldn't be scored, without breaking the list", () => {
    const text = formatSentimentTrend(
      [
        { retroFrameTitle: "Retro - 2026-08-01", note: "Couldn't be scored — sentiment analysis failed for this retro." },
        { retroFrameTitle: "Retro - 2026-08-15", score: 4, reason: "CI fixed" },
      ],
      undefined,
    );

    expect(text).toBe(
      [
        "Sentiment trend",
        "",
        "- Retro - 2026-08-01: Couldn't be scored — sentiment analysis failed for this retro.",
        "- Retro - 2026-08-15: 4/5 — CI fixed",
      ].join("\n"),
    );
  });

  test("returns a clear message when there are no retros to show", () => {
    expect(formatSentimentTrend([], undefined)).toBe("No retros found on the board to analyse.");
  });
});
