import { describe, expect, test } from "vitest";
import { addCycleOverviewToBoard, buildCycleOverview, type CycleOverview } from "../../src/tools/cycleOverviewTools.js";
import { buildRetroTemplateLayout, cycleOverviewBoxLayout } from "../../src/domain/retroTemplate.js";
import { MiroClient } from "../../src/clients/miroClient.js";
import { JiraClient } from "../../src/clients/jiraClient.js";

describe("buildCycleOverview", () => {
  test("groups issues into completed and in-progress using the date found on the Miro board", async () => {
    const miroClient = MiroClient.createNull({
      stickyNotes: [
        { id: "1", content: "Retro: 2026-08-15", x: 0, y: 0 },
        { id: "2", content: "Some feedback", x: 0, y: 100 },
      ],
    });
    const jiraClient = JiraClient.createNull({
      searchIssues: [
        { key: "RETRO-1", summary: "Shipped the thing", status: "Done", url: "https://example.test/RETRO-1" },
        { key: "RETRO-2", summary: "Still working on it", status: "In Progress", url: "https://example.test/RETRO-2" },
      ],
    });

    const overview = await buildCycleOverview(miroClient, jiraClient);

    expect(overview).toEqual({
      sinceDate: "2026-08-15",
      completed: [{ key: "RETRO-1", summary: "Shipped the thing", status: "Done", url: "https://example.test/RETRO-1" }],
      inProgress: [
        { key: "RETRO-2", summary: "Still working on it", status: "In Progress", url: "https://example.test/RETRO-2" },
      ],
    });
  });

  test("throws a clear error when the Miro board has no previous retro date recorded", async () => {
    const miroClient = MiroClient.createNull({ stickyNotes: [{ id: "1", content: "No date here", x: 0, y: 0 }] });
    const jiraClient = JiraClient.createNull();

    await expect(buildCycleOverview(miroClient, jiraClient)).rejects.toThrow(
      "No previous retro date found on the Miro board",
    );
  });

  test("passes the previous retro date and default project key through to the Jira search", async () => {
    const miroClient = MiroClient.createNull({ stickyNotes: [{ id: "1", content: "Retro: 2026-09-10", x: 0, y: 0 }] });
    const jiraClient = JiraClient.createNull();

    await buildCycleOverview(miroClient, jiraClient);

    const requests = jiraClient.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({ jql: expect.stringContaining('project = "RETRO"') });
    expect(requests[0].body).toMatchObject({ jql: expect.stringContaining('updated >= "2026-09-10"') });
  });

  test("uses a supplied project key and board id instead of the defaults", async () => {
    const miroClient = MiroClient.createNull({ stickyNotes: [{ id: "1", content: "Retro: 2026-09-10", x: 0, y: 0 }] });
    const jiraClient = JiraClient.createNull();

    await buildCycleOverview(miroClient, jiraClient, { boardId: "board-9", projectKey: "TEAM" });

    const miroRequests = miroClient.trackRequests();
    const jiraRequests = jiraClient.trackRequests();
    expect(miroRequests[0].url).toContain("/boards/board-9/items");
    expect(jiraRequests[0].body).toMatchObject({ jql: expect.stringContaining('project = "TEAM"') });
  });
});

describe("addCycleOverviewToBoard", () => {
  const overview: CycleOverview = {
    sinceDate: "2026-08-15",
    completed: [{ key: "RETRO-1", summary: "Shipped the thing", status: "Done", url: "https://example.test/RETRO-1" }],
    inProgress: [
      { key: "RETRO-2", summary: "Still working on it", status: "In Progress", url: "https://example.test/RETRO-2" },
    ],
  };

  test("does nothing when there are no completed or in-progress issues", async () => {
    const miroClient = MiroClient.createNull();

    const result = await addCycleOverviewToBoard(miroClient, { sinceDate: "2026-08-15", completed: [], inProgress: [] });

    expect(result).toEqual({ addedCount: 0 });
    expect(miroClient.trackRequests()).toHaveLength(0);
  });

  test("does nothing when the board has no retro frame", async () => {
    const miroClient = MiroClient.createNull({ frames: [] });

    const result = await addCycleOverviewToBoard(miroClient, overview);

    expect(result).toEqual({ addedCount: 0 });
  });

  test("reports the retro frame and creates a new Cycle overview box when none exists yet", async () => {
    const layout = buildRetroTemplateLayout(new Date("2026-09-26T00:00:00.000Z"));
    const miroClient = MiroClient.createNull({
      frames: [{ id: "frame-outer", title: layout.frame.title, x: layout.frame.x, y: layout.frame.y, width: layout.frame.width, height: layout.frame.height }],
    });

    const result = await addCycleOverviewToBoard(miroClient, overview);

    expect(result).toEqual({ retroFrameTitle: layout.frame.title, addedCount: 2 });
    const frameRequests = miroClient.trackRequests().filter((r) => r.url.includes("/frames") && r.method === "POST");
    expect(frameRequests).toHaveLength(1);
    expect(frameRequests[0].body).toMatchObject({ data: { title: "Cycle overview" } });
  });

  test("adds a sticky note per issue to a new Cycle overview box below the latest retro frame", async () => {
    const olderLayout = buildRetroTemplateLayout(new Date("2026-09-12T00:00:00.000Z"));
    const latestLayout = buildRetroTemplateLayout(new Date("2026-09-26T00:00:00.000Z"), { x: 0, y: 5000 });

    const miroClient = MiroClient.createNull({
      frames: [
        { id: "frame-outer-old", title: olderLayout.frame.title, x: olderLayout.frame.x, y: olderLayout.frame.y, width: olderLayout.frame.width, height: olderLayout.frame.height },
        { id: "frame-outer-latest", title: latestLayout.frame.title, x: latestLayout.frame.x, y: latestLayout.frame.y, width: latestLayout.frame.width, height: latestLayout.frame.height },
      ],
    });

    const result = await addCycleOverviewToBoard(miroClient, overview);

    expect(result).toEqual({ retroFrameTitle: latestLayout.frame.title, addedCount: 2 });

    const requests = miroClient.trackRequests();
    const frameRequest = requests.find((r) => r.url.includes("/frames") && r.method === "POST");
    // The box should sit directly below the latest retro frame, not the older one.
    expect(frameRequest?.body).toMatchObject({ position: { x: latestLayout.frame.x } });

    const stickyNoteRequests = requests.filter((r) => r.url.includes("/sticky_notes"));
    expect(stickyNoteRequests).toHaveLength(2);
    expect(stickyNoteRequests[0].body).toMatchObject({
      data: { content: "✅ RETRO-1: Shipped the thing" },
      parent: { id: "frame-1" },
    });
    expect(stickyNoteRequests[1].body).toMatchObject({
      data: { content: "🔄 RETRO-2: Still working on it" },
      parent: { id: "frame-1" },
    });
  });

  test("reuses an existing Cycle overview box and appends after its current notes", async () => {
    const layout = buildRetroTemplateLayout(new Date("2026-09-26T00:00:00.000Z"));
    const boxLayout = cycleOverviewBoxLayout(layout.frame, 1);

    const miroClient = MiroClient.createNull({
      frames: [
        { id: "frame-outer", title: layout.frame.title, x: layout.frame.x, y: layout.frame.y, width: layout.frame.width, height: layout.frame.height },
        { id: "frame-box", title: boxLayout.title, x: boxLayout.x, y: boxLayout.y, width: boxLayout.width, height: boxLayout.height },
      ],
      stickyNotes: [{ id: "sticky-existing", content: "✅ RETRO-0: Already added", x: 0, y: 0, frameId: "frame-box" }],
    });

    const result = await addCycleOverviewToBoard(miroClient, overview);

    expect(result).toEqual({ retroFrameTitle: layout.frame.title, addedCount: 2 });

    const requests = miroClient.trackRequests();
    expect(requests.some((r) => r.url.includes("/frames") && r.method === "POST")).toBe(false);
    const stickyNoteRequests = requests.filter((r) => r.url.includes("/sticky_notes"));
    expect(stickyNoteRequests).toHaveLength(2);
    expect(stickyNoteRequests[0].body).toMatchObject({ parent: { id: "frame-box" } });
  });
});

