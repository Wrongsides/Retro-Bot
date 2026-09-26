import { describe, expect, test } from "vitest";
import { buildRetroOverview } from "../../src/tools/retroOverviewTools.js";
import { MiroClient } from "../../src/integrations/miroClient.js";
import { JiraClient } from "../../src/integrations/jiraClient.js";

describe("buildRetroOverview", () => {
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

    const overview = await buildRetroOverview(miroClient, jiraClient);

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

    await expect(buildRetroOverview(miroClient, jiraClient)).rejects.toThrow(
      "No previous retro date found on the Miro board",
    );
  });

  test("passes the previous retro date and default project key through to the Jira search", async () => {
    const miroClient = MiroClient.createNull({ stickyNotes: [{ id: "1", content: "Retro: 2026-09-10", x: 0, y: 0 }] });
    const jiraClient = JiraClient.createNull();

    await buildRetroOverview(miroClient, jiraClient);

    const requests = jiraClient.trackRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({ jql: expect.stringContaining('project = "RETRO"') });
    expect(requests[0].body).toMatchObject({ jql: expect.stringContaining('updated >= "2026-09-10"') });
  });

  test("uses a supplied project key and board id instead of the defaults", async () => {
    const miroClient = MiroClient.createNull({ stickyNotes: [{ id: "1", content: "Retro: 2026-09-10", x: 0, y: 0 }] });
    const jiraClient = JiraClient.createNull();

    await buildRetroOverview(miroClient, jiraClient, { boardId: "board-9", projectKey: "TEAM" });

    const miroRequests = miroClient.trackRequests();
    const jiraRequests = jiraClient.trackRequests();
    expect(miroRequests[0].url).toContain("/boards/board-9/items");
    expect(jiraRequests[0].body).toMatchObject({ jql: expect.stringContaining('project = "TEAM"') });
  });
});
