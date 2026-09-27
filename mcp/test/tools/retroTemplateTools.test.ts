import { describe, expect, test } from "vitest";
import { createRetroTemplate } from "../../src/tools/retroTemplateTools.js";
import { MiroClient } from "../../src/clients/miroClient.js";

describe("createRetroTemplate", () => {
  test("creates an outer frame, four column frames, and a dated marker sticky note", async () => {
    const miroClient = MiroClient.createNull();

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.frame.title).toBe("Retro - 2026-09-26");
    expect(template.columns.map((column) => column.title)).toEqual([
      "What went well?",
      "What should we do differently?",
      "What should we start doing?",
      "Action items",
    ]);
    expect(template.marker.content).toBe("Retro: 2026-09-26");
  });

  test("nests the date marker sticky note inside the outer frame", async () => {
    const miroClient = MiroClient.createNull();

    await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    const requests = miroClient.trackRequests();
    const markerRequest = requests.find(
      (request) =>
        request.url.includes("/sticky_notes") && (request.body as { data?: { content?: string } })?.data?.content?.includes("Retro:"),
    );
    const frameRequests = requests.filter((request) => request.url.includes("/frames"));
    expect(frameRequests).toHaveLength(8);
    expect(markerRequest?.body).toMatchObject({ parent: { id: "frame-1" } });
  });

  test("creates a mood box and a dot votes box alongside the four retro columns", async () => {
    const miroClient = MiroClient.createNull();

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.moodBox.title).toBe("Mood");
    expect(template.dotVoteBox.title).toBe("Dot Votes");
  });

  test("gives every retro column a stack of starter sticky notes parented to that column", async () => {
    const miroClient = MiroClient.createNull();

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.columnStickyStacks).toHaveLength(template.columns.length);
    const requests = miroClient.trackRequests();
    const stickyRequests = requests.filter((request) => request.url.includes("/sticky_notes"));
    const firstColumnStackRequests = stickyRequests.filter(
      (request) => (request.body as { parent?: { id: string } })?.parent?.id === template.columns[0].id,
    );
    expect(firstColumnStackRequests.length).toBe(template.columnStickyStacks[0].length);
  });

  test("gives the mood box and dot votes box an instructional sticky note parented to them", async () => {
    const miroClient = MiroClient.createNull();

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.moodBoxSticky.content.length).toBeGreaterThan(0);
    expect(template.dotVoteBoxSticky.content.length).toBeGreaterThan(0);
    const requests = miroClient.trackRequests();
    const stickyRequests = requests.filter((request) => request.url.includes("/sticky_notes"));
    expect(
      stickyRequests.some((request) => (request.body as { parent?: { id: string } })?.parent?.id === template.moodBox.id),
    ).toBe(true);
    expect(
      stickyRequests.some(
        (request) => (request.body as { parent?: { id: string } })?.parent?.id === template.dotVoteBox.id,
      ),
    ).toBe(true);
  });

  test("creates an Experiment Tracking box with a Go/No-Go prompt and a fresh experiment prompt", async () => {
    const miroClient = MiroClient.createNull();

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.experimentBox.title).toBe("Experiment Tracking");
    expect(template.goNoGoSticky.content).toBe("No previous experiment recorded yet.");
    expect(template.newExperimentSticky.content).toContain("This sprint's experiment:");
    const requests = miroClient.trackRequests();
    const stickyRequests = requests.filter((request) => request.url.includes("/sticky_notes"));
    const experimentStickies = stickyRequests.filter(
      (request) => (request.body as { parent?: { id: string } })?.parent?.id === template.experimentBox.id,
    );
    expect(experimentStickies).toHaveLength(2);
  });

  test("carries the previous retro's recorded experiment forward as a Go/No-Go prompt on the new retro", async () => {
    const miroClient = MiroClient.createNull({
      frames: [
        { id: "frame-outer-old", title: "Retro - 2026-09-12", x: 0, y: 0, width: 2350, height: 1250 },
        { id: "frame-experiment-old", title: "Experiment Tracking", x: 0, y: 1650, width: 478, height: 308 },
      ],
      stickyNotes: [
        {
          id: "sticky-experiment-old",
          content: "🧪 This sprint's experiment:\nPairing by default on tickets",
          x: 0,
          y: 0,
          frameId: "frame-experiment-old",
        },
      ],
    });

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.goNoGoSticky.content).toContain("Pairing by default on tickets");
    expect(template.goNoGoSticky.content).toContain("Go ✅");
    expect(template.goNoGoSticky.content).toContain("No-Go ❌");
  });

  test("treats an unedited placeholder experiment sticky as no experiment having been recorded", async () => {
    const miroClient = MiroClient.createNull({
      frames: [
        { id: "frame-outer-old", title: "Retro - 2026-09-12", x: 0, y: 0, width: 2350, height: 1250 },
        { id: "frame-experiment-old", title: "Experiment Tracking", x: 0, y: 1650, width: 478, height: 308 },
      ],
      stickyNotes: [
        {
          id: "sticky-experiment-old",
          content: "🧪 This sprint's experiment:\n(describe what we're trying)",
          x: 0,
          y: 0,
          frameId: "frame-experiment-old",
        },
      ],
    });

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.goNoGoSticky.content).toBe("No previous experiment recorded yet.");
  });

  test("defaults to today when no date is supplied", async () => {
    const miroClient = MiroClient.createNull();

    const template = await createRetroTemplate(miroClient);

    const today = new Date().toISOString().slice(0, 10);
    expect(template.frame.title).toBe(`Retro - ${today}`);
  });

  test("uses a supplied board id and origin instead of the defaults", async () => {
    const miroClient = MiroClient.createNull();

    await createRetroTemplate(miroClient, {
      date: new Date("2026-09-26T00:00:00.000Z"),
      boardId: "board-9",
      x: 5000,
      y: 2000,
    });

    const requests = miroClient.trackRequests();
    expect(requests.every((request) => request.url.includes("/boards/board-9/"))).toBe(true);
    const firstFrameRequest = requests.find((request) => request.url.includes("/frames"));
    expect(firstFrameRequest?.body).toMatchObject({ position: { x: 7400, y: 2625 } });
  });

  test("positions a new template below the lowest existing retro frame when no origin is given", async () => {
    const miroClient = MiroClient.createNull({
      frames: [
        { id: "frame-1", title: "Retro - 2026-09-01", x: 0, y: 0, width: 800, height: 600 },
        { id: "frame-2", title: "Retro - 2026-09-15", x: 0, y: 1000, width: 800, height: 900 },
      ],
    });

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.frame.x).toBe(2400);
    expect(template.frame.y).toBe(2275);
  });

  test("recognises manually named retro frames like 'Retro 1 - Project Kickoff' when computing the automatic offset", async () => {
    const miroClient = MiroClient.createNull({
      frames: [
        { id: "frame-1", title: "Retro 1 - Project Kickoff (2026-09-01)", x: 0, y: 0, width: 800, height: 600 },
        { id: "frame-2", title: "Retro 2 - Sprint 0 (2026-09-08)", x: 0, y: 1000, width: 800, height: 900 },
      ],
    });

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.frame.x).toBe(2400);
    expect(template.frame.y).toBe(2275);
  });

  test("ignores frames that are not retro templates when computing the automatic offset", async () => {
    const miroClient = MiroClient.createNull({
      frames: [{ id: "frame-1", title: "Sprint planning notes", x: 0, y: 5000, width: 400, height: 400 }],
    });

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.frame.y).toBe(625);
  });

  test("starts at the origin when there are no existing frames", async () => {
    const miroClient = MiroClient.createNull({ frames: [] });

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.frame.x).toBe(2400);
    expect(template.frame.y).toBe(625);
  });

  test("positions a new template below an existing Cycle overview box, not just the outer retro frame", async () => {
    const miroClient = MiroClient.createNull({
      frames: [
        { id: "frame-1", title: "Retro - 2026-09-01", x: 0, y: 0, width: 800, height: 600 },
        { id: "frame-2", title: "Cycle overview", x: 0, y: 1200, width: 800, height: 400 },
      ],
    });

    const template = await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z") });

    expect(template.frame.y).toBe(1400 + 200 + template.frame.height / 2);
  });

  test("does not query for existing frames when an explicit origin is given", async () => {
    const miroClient = MiroClient.createNull({
      frames: [{ id: "frame-1", title: "Retro - 2026-09-01", x: 0, y: 0, width: 800, height: 600 }],
    });

    await createRetroTemplate(miroClient, { date: new Date("2026-09-26T00:00:00.000Z"), x: 0, y: 0 });

    const requests = miroClient.trackRequests();
    expect(requests.some((request) => request.url.includes("type=frame"))).toBe(false);
  });
});
