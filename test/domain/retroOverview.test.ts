import { describe, expect, test } from "vitest";
import { buildRetroJql, categorizeIssues, findPreviousRetroDate } from "../../src/domain/retroOverview.js";
import type { MiroStickyNote } from "../../src/integrations/miroClient.js";
import type { JiraIssue } from "../../src/integrations/jiraClient.js";

describe("findPreviousRetroDate", () => {
  test("finds the date from a sticky note labelled with the previous retro", () => {
    const notes: MiroStickyNote[] = [
      { id: "1", content: "Deploys felt smoother this sprint", x: 0, y: 0 },
      { id: "2", content: "Retro: 2026-08-15", x: 0, y: 100 },
    ];

    const date = findPreviousRetroDate(notes);

    expect(date).toBe("2026-08-15");
  });

  test("finds the date regardless of wording and casing", () => {
    const notes: MiroStickyNote[] = [{ id: "1", content: "Last RETRO - 2026-09-01", x: 0, y: 0 }];

    const date = findPreviousRetroDate(notes);

    expect(date).toBe("2026-09-01");
  });

  test("returns undefined when no sticky note records a previous retro date", () => {
    const notes: MiroStickyNote[] = [{ id: "1", content: "Just regular feedback", x: 0, y: 0 }];

    const date = findPreviousRetroDate(notes);

    expect(date).toBeUndefined();
  });
});

describe("buildRetroJql", () => {
  test("scopes the query to the given project and date", () => {
    const jql = buildRetroJql("2026-08-15", "RETRO");

    expect(jql).toBe('project = "RETRO" AND (status = "In Progress" OR (status = "Done" AND updated >= "2026-08-15"))');
  });

  test("omits the project clause when no project key is given", () => {
    const jql = buildRetroJql("2026-08-15");

    expect(jql).toBe('status = "In Progress" OR (status = "Done" AND updated >= "2026-08-15")');
  });
});

describe("categorizeIssues", () => {
  test("splits issues into completed and in-progress groups by status", () => {
    const completedIssue: JiraIssue = {
      key: "RETRO-1",
      summary: "Done thing",
      status: "Done",
      url: "https://example.test/RETRO-1",
    };
    const inProgressIssue: JiraIssue = {
      key: "RETRO-2",
      summary: "In flight thing",
      status: "In Progress",
      url: "https://example.test/RETRO-2",
    };

    const result = categorizeIssues([completedIssue, inProgressIssue]);

    expect(result).toEqual({ completed: [completedIssue], inProgress: [inProgressIssue] });
  });

  test("treats any non-Done status as in progress", () => {
    const issue: JiraIssue = { key: "RETRO-3", summary: "Odd status", status: "Blocked", url: "https://example.test/RETRO-3" };

    const result = categorizeIssues([issue]);

    expect(result).toEqual({ completed: [], inProgress: [issue] });
  });
});
