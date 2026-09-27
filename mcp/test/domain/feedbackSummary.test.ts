import { describe, expect, test } from "vitest";
import { buildFeedbackSummary, formatFeedbackSummary } from "../../src/domain/feedbackSummary.js";
import type { FeedbackEntry } from "../../src/clients/feedbackStore.js";

describe("buildFeedbackSummary", () => {
  test("averages the star ratings across every recorded entry", () => {
    const entries: FeedbackEntry[] = [
      { rating: 5, recordedAt: "2026-09-01T09:00:00.000Z" },
      { rating: 3, recordedAt: "2026-09-08T09:00:00.000Z" },
      { rating: 4, recordedAt: "2026-09-15T09:00:00.000Z" },
    ];

    const summary = buildFeedbackSummary(entries);

    expect(summary.totalCount).toBe(3);
    expect(summary.averageRating).toBeCloseTo(4, 5);
  });

  test("reports no average when nobody has given feedback yet", () => {
    const summary = buildFeedbackSummary([]);

    expect(summary.totalCount).toBe(0);
    expect(summary.averageRating).toBeNull();
  });

  test("lists the most recent comments first, most recent overall capped at 5", () => {
    const entries: FeedbackEntry[] = [
      { rating: 5, comment: "Loved the narrative", recordedAt: "2026-09-01T09:00:00.000Z" },
      { rating: 2, recordedAt: "2026-09-08T09:00:00.000Z" },
      { rating: 4, comment: "Nice touch with the star card", recordedAt: "2026-09-15T09:00:00.000Z" },
      { rating: 3, comment: "Missed the previous experiment", recordedAt: "2026-09-22T09:00:00.000Z" },
      { rating: 5, comment: "Great as always", recordedAt: "2026-09-29T09:00:00.000Z" },
      { rating: 1, comment: "Too slow", recordedAt: "2026-10-06T09:00:00.000Z" },
    ];

    const summary = buildFeedbackSummary(entries);

    expect(summary.recentComments).toEqual([
      { rating: 1, comment: "Too slow", recordedAt: "2026-10-06T09:00:00.000Z" },
      { rating: 5, comment: "Great as always", recordedAt: "2026-09-29T09:00:00.000Z" },
      { rating: 3, comment: "Missed the previous experiment", recordedAt: "2026-09-22T09:00:00.000Z" },
      { rating: 4, comment: "Nice touch with the star card", recordedAt: "2026-09-15T09:00:00.000Z" },
      { rating: 5, comment: "Loved the narrative", recordedAt: "2026-09-01T09:00:00.000Z" },
    ]);
  });

  test("excludes ratings with no comment from the recent comments list", () => {
    const entries: FeedbackEntry[] = [
      { rating: 5, recordedAt: "2026-09-01T09:00:00.000Z" },
      { rating: 4, comment: "Nice touch with the star card", recordedAt: "2026-09-15T09:00:00.000Z" },
    ];

    const summary = buildFeedbackSummary(entries);

    expect(summary.recentComments).toEqual([
      { rating: 4, comment: "Nice touch with the star card", recordedAt: "2026-09-15T09:00:00.000Z" },
    ]);
  });
});

describe("formatFeedbackSummary", () => {
  test("presents the average rating, total count and recent comments as readable text", () => {
    const text = formatFeedbackSummary({
      totalCount: 3,
      averageRating: 4,
      recentComments: [{ rating: 4, comment: "Nice touch with the star card", recordedAt: "2026-09-15T09:00:00.000Z" }],
    });

    expect(text).toBe(
      "Retro-Bot feedback: 4.0/5 average from 3 ratings\n\nRecent comments\n- 4/5: Nice touch with the star card"
    );
  });

  test("says so when nobody has given feedback yet", () => {
    const text = formatFeedbackSummary({ totalCount: 0, averageRating: null, recentComments: [] });

    expect(text).toBe("No feedback recorded yet.");
  });

  test("omits the recent comments section when nobody left a comment", () => {
    const text = formatFeedbackSummary({ totalCount: 2, averageRating: 4.5, recentComments: [] });

    expect(text).toBe("Retro-Bot feedback: 4.5/5 average from 2 ratings");
  });
});
