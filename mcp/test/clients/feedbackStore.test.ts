import { describe, expect, test } from "vitest";
import { FeedbackStore } from "../../src/clients/feedbackStore.js";

describe("FeedbackStore.createNull", () => {
  test("records a star rating with a recorded timestamp", async () => {
    const store = FeedbackStore.createNull();
    const recordedAt = new Date("2026-09-13T09:00:00.000Z");

    const entry = await store.record(5, "Loved the new experiment tracking box", recordedAt);

    expect(entry).toEqual({
      rating: 5,
      comment: "Loved the new experiment tracking box",
      recordedAt: "2026-09-13T09:00:00.000Z",
    });
  });

  test("records a rating without a comment", async () => {
    const store = FeedbackStore.createNull();
    const recordedAt = new Date("2026-09-13T09:00:00.000Z");

    const entry = await store.record(3, undefined, recordedAt);

    expect(entry).toEqual({ rating: 3, comment: undefined, recordedAt: "2026-09-13T09:00:00.000Z" });
  });

  test("lists every recorded entry in the order they were recorded", async () => {
    const store = FeedbackStore.createNull();
    const first = new Date("2026-09-13T09:00:00.000Z");
    const second = new Date("2026-09-20T09:00:00.000Z");
    await store.record(4, "Good session", first);
    await store.record(2, "Ran long", second);

    const entries = await store.list();

    expect(entries).toEqual([
      { rating: 4, comment: "Good session", recordedAt: "2026-09-13T09:00:00.000Z" },
      { rating: 2, comment: "Ran long", recordedAt: "2026-09-20T09:00:00.000Z" },
    ]);
  });

  test("starts pre-seeded with any configured entries", async () => {
    const store = FeedbackStore.createNull({
      entries: [{ rating: 5, comment: "Seeded entry", recordedAt: "2026-09-06T09:00:00.000Z" }],
    });

    const entries = await store.list();

    expect(entries).toEqual([{ rating: 5, comment: "Seeded entry", recordedAt: "2026-09-06T09:00:00.000Z" }]);
  });

  test("tracks each write for assertions without touching the filesystem", async () => {
    const store = FeedbackStore.createNull();

    await store.record(5, "Great retro", new Date("2026-09-13T09:00:00.000Z"));

    const writes = store.trackWrites();
    expect(writes).toEqual([
      { rating: 5, comment: "Great retro", recordedAt: "2026-09-13T09:00:00.000Z" },
    ]);
  });

  test("clears tracked writes once they have been read", async () => {
    const store = FeedbackStore.createNull();
    await store.record(5, undefined, new Date("2026-09-13T09:00:00.000Z"));
    store.trackWrites();

    const writes = store.trackWrites();

    expect(writes).toEqual([]);
  });
});
