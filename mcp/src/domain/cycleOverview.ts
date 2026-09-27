import type { JiraIssue } from "../clients/jiraClient.js";
import type { MiroStickyNote } from "../clients/miroClient.js";

const RETRO_DATE_PATTERN = /retro[^0-9]{0,20}(\d{4}-\d{2}-\d{2})/i;

export interface CategorizedIssues {
  completed: JiraIssue[];
  inProgress: JiraIssue[];
}

export function findPreviousCycleDate(notes: MiroStickyNote[]): string | undefined {
  for (const note of notes) {
    const match = RETRO_DATE_PATTERN.exec(note.content);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export function buildCycleJql(sinceDate: string, projectKey?: string): string {
  const statusClause = `status = "In Progress" OR (status = "Done" AND updated >= "${sinceDate}")`;
  return projectKey ? `project = "${projectKey}" AND (${statusClause})` : statusClause;
}

export function categorizeIssues(issues: JiraIssue[]): CategorizedIssues {
  const completed = issues.filter((issue) => issue.status === "Done");
  const inProgress = issues.filter((issue) => issue.status !== "Done");
  return { completed, inProgress };
}
