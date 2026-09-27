import { describe, expect, test } from "vitest";
import { buildRetroSummary, createActionTickets, formatSummary } from "../../src/tools/summaryTools.js";
import { buildRetroTemplateLayout, experimentBoxLayout, MOOD_BOX_TITLE } from "../../src/domain/retroTemplate.js";
import { MiroClient, type MiroFrameLayout } from "../../src/clients/miroClient.js";
import { JiraClient } from "../../src/clients/jiraClient.js";
import { LlmClient } from "../../src/clients/llmClient.js";

const layout = buildRetroTemplateLayout(new Date("2026-09-26T00:00:00.000Z"));
const experiment = experimentBoxLayout(layout.frame);

function framesFromLayout(): MiroFrameLayout[] {
  return [
    { id: "frame-outer", title: layout.frame.title, x: layout.frame.x, y: layout.frame.y, width: layout.frame.width, height: layout.frame.height },
    { id: "frame-mood", title: layout.moodBox.title, x: layout.moodBox.x, y: layout.moodBox.y, width: layout.moodBox.width, height: layout.moodBox.height },
    ...layout.columns.map((column, index) => ({
      id: `frame-column-${index}`,
      title: column.title,
      x: column.x,
      y: column.y,
      width: column.width,
      height: column.height,
    })),
    { id: "frame-experiment", title: experiment.frame.title, x: experiment.frame.x, y: experiment.frame.y, width: experiment.frame.width, height: experiment.frame.height },
  ];
}

describe("buildRetroSummary", () => {
  test("summarises every column, the mood board and the experiment tracking box", async () => {
    const miroClient = MiroClient.createNull({
      frames: framesFromLayout(),
      stickyNotes: [
        { id: "1", content: "Deploys went smoothly", x: 0, y: 0, frameId: "frame-column-0" },
        { id: "2", content: "😀 great sprint", x: 0, y: 0, frameId: "frame-mood" },
        { id: "3", content: "Fix the flaky pipeline", x: 0, y: 0, frameId: "frame-column-3" },
      ],
    });
    const jiraClient = JiraClient.createNull({ searchIssues: [] });
    const llmClient = LlmClient.createNull({ completion: "A narrative summary of the retro." });

    const summary = await buildRetroSummary(miroClient, jiraClient, llmClient, { projectKey: "RETRO" });

    expect(summary.retroFrameTitle).toBe(layout.frame.title);
    expect(summary.columns[0]).toEqual({ title: "What went well?", items: ["Deploys went smoothly"] });
    expect(summary.columns[3]).toEqual({ title: "Action items", items: ["Fix the flaky pipeline"] });
    expect(summary.mood).toEqual(["😀 great sprint"]);
    expect(summary.narrative).toBe("A narrative summary of the retro.");
  });

  test("throws a clear error when the Miro board has no retro frame", async () => {
    const miroClient = MiroClient.createNull({ frames: [] });
    const jiraClient = JiraClient.createNull();
    const llmClient = LlmClient.createNull();

    await expect(buildRetroSummary(miroClient, jiraClient, llmClient)).rejects.toThrow(
      "No previous retro date found on the Miro board",
    );
  });

  test("creates a Jira ticket for each action item that is not already tracked", async () => {
    const miroClient = MiroClient.createNull({
      frames: framesFromLayout(),
      stickyNotes: [{ id: "1", content: "Fix the flaky pipeline", x: 0, y: 0, frameId: "frame-column-3" }],
    });
    const jiraClient = JiraClient.createNull({ searchIssues: [] });
    const llmClient = LlmClient.createNull();

    const summary = await buildRetroSummary(miroClient, jiraClient, llmClient, { projectKey: "RETRO" });

    expect(summary.tickets.created).toEqual([
      { key: "RETRO-102", summary: "Fix the flaky pipeline", status: "To Do", url: "https://example.atlassian.net/browse/RETRO-102" },
    ]);
    expect(summary.tickets.skipped).toEqual([]);
  });

  test("skips creating a ticket when a matching action already exists in Jira", async () => {
    const miroClient = MiroClient.createNull({
      frames: framesFromLayout(),
      stickyNotes: [{ id: "1", content: "Fix the flaky pipeline", x: 0, y: 0, frameId: "frame-column-3" }],
    });
    const jiraClient = JiraClient.createNull({
      searchIssues: [{ key: "RETRO-5", summary: "Fix the flaky pipeline", status: "In Progress", url: "https://example.test/RETRO-5" }],
    });
    const llmClient = LlmClient.createNull();

    const summary = await buildRetroSummary(miroClient, jiraClient, llmClient, { projectKey: "RETRO" });

    expect(summary.tickets.created).toEqual([]);
    expect(summary.tickets.skipped).toEqual(["Fix the flaky pipeline"]);
  });

  test("fails closed when the LLM cannot generate a narrative", async () => {
    const miroClient = MiroClient.createNull({
      frames: framesFromLayout(),
      stickyNotes: [{ id: "1", content: "Deploys went smoothly", x: 0, y: 0, frameId: "frame-column-0" }],
    });
    const jiraClient = JiraClient.createNull({ searchIssues: [] });
    const llmClient = LlmClient.createNull({ failure: { status: 503 } });

    await expect(buildRetroSummary(miroClient, jiraClient, llmClient, { projectKey: "RETRO" })).rejects.toThrow(
      "LLM completion failed: 503",
    );
  });
});

describe("createActionTickets", () => {
  test("labels created tickets as retro-action", async () => {
    const jiraClient = JiraClient.createNull({ searchIssues: [] });

    await createActionTickets(jiraClient, ["Pair more on tricky tickets"], "RETRO");

    const requests = jiraClient.trackRequests();
    const createRequest = requests.find((r) => r.method === "POST" && r.url.endsWith("/rest/api/3/issue"));
    expect(createRequest?.body).toMatchObject({ fields: { labels: ["retro-action"] } });
  });

  test("does nothing when there are no action items", async () => {
    const jiraClient = JiraClient.createNull();

    const result = await createActionTickets(jiraClient, [], "RETRO");

    expect(result).toEqual({ created: [], skipped: [] });
    expect(jiraClient.trackRequests()).toEqual([]);
  });
});

describe("formatSummary", () => {
  test("renders the narrative summary plus the experiment tracking and Jira actions sections", () => {
    const text = formatSummary({
      retroFrameTitle: "Retro - 2026-09-26",
      columns: [
        { title: "What went well?", items: ["Deploys went smoothly"] },
        { title: "What should we do differently?", items: [] },
        { title: "What should we start doing?", items: [] },
        { title: "Action items", items: ["Fix the flaky pipeline"] },
      ],
      mood: ["😀 great sprint"],
      experiment: { thisSprintExperiment: "Pair by default on tickets", goNoGoOutcome: undefined },
      tickets: { created: [{ key: "RETRO-9", summary: "Fix the flaky pipeline", status: "To Do", url: "https://example.test/RETRO-9" }], skipped: [] },
      narrative: "The team shipped smoothly and morale is high.",
    });

    expect(text).toContain("Retro - 2026-09-26");
    expect(text).toContain("The team shipped smoothly and morale is high.");
    expect(text).not.toContain("- Deploys went smoothly");
    expect(text).toContain("Pair by default on tickets");
    expect(text).toContain("RETRO-9");
  });
});
