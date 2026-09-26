import { describe, expect, test } from "vitest";
import { MiroClient } from "../../src/integrations/miroClient.js";

describe("MiroClient.createNull", () => {
  test("returns default sample sticky notes with HTML stripped from content", async () => {
    const client = MiroClient.createNull();

    const notes = await client.getBoardStickyNotes();

    expect(notes).toEqual([
      { id: "1", content: "Deploys felt smoother this sprint thanks to the new pipeline", x: 0, y: 0 },
      { id: "2", content: "We keep forgetting to close out retro actions from last time", x: 100, y: 0 },
      { id: "3", content: "Onboarding docs for the payments service are out of date", x: 0, y: 100 },
      { id: "4", content: "Pairing session on Thursday was really useful, let's do more", x: 100, y: 100 },
      { id: "5", content: "Incident review took too long because logs were hard to find", x: 0, y: 200 },
      { id: "6", content: "Great shoutout to Sam for helping unblock the release", x: 100, y: 200 },
      { id: "7", content: "Retro: 2026-08-15", x: 200, y: 0 },
    ]);
  });

  test("supports configuring custom sticky notes", async () => {
    const client = MiroClient.createNull({
      stickyNotes: [{ id: "9", content: "Custom note", author: "sam", x: 5, y: 5 }],
    });

    const notes = await client.getBoardStickyNotes();

    expect(notes).toEqual([{ id: "9", content: "Custom note", author: "sam", x: 5, y: 5 }]);
  });

  test("returns an empty list when the board has no sticky notes", async () => {
    const client = MiroClient.createNull({ stickyNotes: [] });

    const notes = await client.getBoardStickyNotes();

    expect(notes).toEqual([]);
  });

  test("requests the configured default board when no board id is given", async () => {
    const client = MiroClient.createNull();

    await client.getBoardStickyNotes();

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toContain("/boards/demo-board/items");
  });

  test("requests the supplied board id when one is given", async () => {
    const client = MiroClient.createNull();

    await client.getBoardStickyNotes("board-42");

    const requests = client.trackRequests();
    expect(requests[0].url).toContain("/boards/board-42/items");
  });

  test("throws when the Miro API responds with a failure status", async () => {
    const client = MiroClient.createNull({ failure: { status: 401 } });

    await expect(client.getBoardStickyNotes()).rejects.toThrow();
  });
});
