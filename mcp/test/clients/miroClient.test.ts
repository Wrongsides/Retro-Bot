import { describe, expect, test } from "vitest";
import { MiroClient } from "../../src/clients/miroClient.js";

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

  test("decodes HTML character entities Miro uses for emoji and apostrophes", async () => {
    const client = MiroClient.createNull({
      stickyNotes: [
        {
          id: "1",
          content: "&#x1f9ea; This sprint&#39;s experiment:\n(describe what we&#39;re trying)",
          x: 0,
          y: 0,
        },
      ],
    });

    const notes = await client.getBoardStickyNotes();

    expect(notes[0].content).toBe("🧪 This sprint's experiment:\n(describe what we're trying)");
  });

  test("follows pagination cursors to return every sticky note across multiple pages", async () => {
    const client = MiroClient.createNull({
      stickyNotePages: [
        [{ id: "1", content: "First page note", x: 0, y: 0 }],
        [{ id: "2", content: "Second page note", x: 100, y: 0 }],
        [{ id: "3", content: "Third page note", x: 200, y: 0 }],
      ],
    });

    const notes = await client.getBoardStickyNotes();

    expect(notes).toEqual([
      { id: "1", content: "First page note", x: 0, y: 0 },
      { id: "2", content: "Second page note", x: 100, y: 0 },
      { id: "3", content: "Third page note", x: 200, y: 0 },
    ]);
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

describe("MiroClient.getBoardFrames", () => {
  test("returns frames on the board with their position and size", async () => {
    const client = MiroClient.createNull({
      frames: [{ id: "frame-1", title: "Retro - 2026-09-01", x: 0, y: 0, width: 800, height: 600 }],
    });

    const frames = await client.getBoardFrames();

    expect(frames).toEqual([{ id: "frame-1", title: "Retro - 2026-09-01", x: 0, y: 0, width: 800, height: 600 }]);
  });

  test("returns an empty list when the board has no frames", async () => {
    const client = MiroClient.createNull({ frames: [] });

    const frames = await client.getBoardFrames();

    expect(frames).toEqual([]);
  });

  test("requests the configured default board when no board id is given", async () => {
    const client = MiroClient.createNull({ frames: [] });

    await client.getBoardFrames();

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toContain("/boards/demo-board/items");
    expect(requests[0].url).toContain("type=frame");
  });

  test("requests the supplied board id when one is given", async () => {
    const client = MiroClient.createNull({ frames: [] });

    await client.getBoardFrames("board-42");

    const requests = client.trackRequests();
    expect(requests[0].url).toContain("/boards/board-42/items");
  });

  test("throws when the Miro API responds with a failure status", async () => {
    const client = MiroClient.createNull({ failure: { status: 401 } });

    await expect(client.getBoardFrames()).rejects.toThrow();
  });
});

describe("MiroClient.createFrame", () => {
  test("creates a frame and returns its id and title", async () => {
    const client = MiroClient.createNull();

    const frame = await client.createFrame({ title: "Retro: 2026-09-01", x: 0, y: 0, width: 800, height: 600 });

    expect(frame).toEqual({ id: "frame-1", title: "Retro: 2026-09-01" });
  });

  test("posts the frame title and geometry to the configured default board", async () => {
    const client = MiroClient.createNull();

    await client.createFrame({ title: "Retro: 2026-09-01", x: 10, y: 20, width: 800, height: 600 });

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/boards/demo-board/frames");
    expect(requests[0].body).toEqual({
      data: { title: "Retro: 2026-09-01" },
      position: { x: 10, y: 20 },
      geometry: { width: 800, height: 600 },
    });
  });

  test("posts to the supplied board id when one is given", async () => {
    const client = MiroClient.createNull();

    await client.createFrame({ title: "Retro", x: 0, y: 0, width: 100, height: 100, boardId: "board-42" });

    const requests = client.trackRequests();
    expect(requests[0].url).toContain("/boards/board-42/frames");
  });

  test("throws when the Miro API responds with a failure status", async () => {
    const client = MiroClient.createNull({ failure: { status: 403 } });

    await expect(client.createFrame({ title: "Retro", x: 0, y: 0, width: 100, height: 100 })).rejects.toThrow();
  });
});

describe("MiroClient.createStickyNote", () => {
  test("creates a sticky note and returns it", async () => {
    const client = MiroClient.createNull();

    const note = await client.createStickyNote({ content: "Went well: pairing sessions", x: 0, y: 0 });

    expect(note).toEqual({ id: "sticky-1", content: "Went well: pairing sessions", x: 0, y: 0 });
  });

  test("posts the note content and position to the configured default board", async () => {
    const client = MiroClient.createNull();

    await client.createStickyNote({ content: "Went well: pairing sessions", x: 10, y: 20 });

    const requests = client.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/boards/demo-board/sticky_notes");
    expect(requests[0].body).toEqual({
      data: { content: "Went well: pairing sessions" },
      position: { x: 10, y: 20 },
    });
  });

  test("nests the sticky note inside a frame when a frameId is given", async () => {
    const client = MiroClient.createNull();

    await client.createStickyNote({ content: "Note", x: 0, y: 0, frameId: "frame-1" });

    const requests = client.trackRequests();
    expect(requests[0].body).toEqual({
      data: { content: "Note" },
      position: { x: 0, y: 0 },
      parent: { id: "frame-1" },
    });
  });

  test("posts to the supplied board id when one is given", async () => {
    const client = MiroClient.createNull();

    await client.createStickyNote({ content: "Note", x: 0, y: 0, boardId: "board-42" });

    const requests = client.trackRequests();
    expect(requests[0].url).toContain("/boards/board-42/sticky_notes");
  });

  test("throws when the Miro API responds with a failure status", async () => {
    const client = MiroClient.createNull({ failure: { status: 403 } });

    await expect(client.createStickyNote({ content: "Note", x: 0, y: 0 })).rejects.toThrow();
  });
});
