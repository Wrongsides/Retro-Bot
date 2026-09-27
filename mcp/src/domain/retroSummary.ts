import type { MiroFrameLayout, MiroStickyNote } from "../clients/miroClient.js";
import { extractExperimentText, MOOD_STICKY_CONTENT, NEW_EXPERIMENT_LABEL } from "./retroTemplate.js";

export interface ColumnSummary {
  title: string;
  items: string[];
}

export interface ExperimentSummary {
  thisSprintExperiment?: string;
  goNoGoOutcome?: string;
}

function stickiesInFrame(stickyNotes: MiroStickyNote[], frame: MiroFrameLayout): MiroStickyNote[] {
  return stickyNotes.filter((sticky) => sticky.frameId === frame.id && sticky.content.trim().length > 0);
}

export function summarizeColumn(stickyNotes: MiroStickyNote[], column: MiroFrameLayout): ColumnSummary {
  return {
    title: column.title,
    items: stickiesInFrame(stickyNotes, column).map((sticky) => sticky.content),
  };
}

export function summarizeMood(stickyNotes: MiroStickyNote[], moodBox: MiroFrameLayout): string[] {
  return stickiesInFrame(stickyNotes, moodBox)
    .filter((sticky) => sticky.content !== MOOD_STICKY_CONTENT)
    .map((sticky) => sticky.content);
}

export interface NarrativePromptInput {
  retroFrameTitle: string;
  columns: ColumnSummary[];
  mood: string[];
  experiment: ExperimentSummary;
}

export function buildNarrativePrompt(summary: NarrativePromptInput): string {
  const lines = [
    `Write a short, warm narrative summary of this team retrospective for ${summary.retroFrameTitle}.`,
    "Write it as flowing prose, not a bullet list.",
    "",
  ];

  for (const column of summary.columns) {
    lines.push(`${column.title}:`);
    lines.push(column.items.length ? column.items.join(" ") : "Nothing was raised.");
    lines.push("");
  }

  lines.push("Team mood:");
  lines.push(summary.mood.length ? summary.mood.join(" ") : "Nobody has left a mood reaction yet.");
  lines.push("");

  lines.push("Experiment tracking:");
  lines.push(`This sprint's experiment: ${summary.experiment.thisSprintExperiment ?? "None set up yet."}`);
  lines.push(`Previous experiment go/no-go: ${summary.experiment.goNoGoOutcome ?? "None recorded yet."}`);

  return lines.join("\n");
}

export function summarizeExperimentBox(stickyNotes: MiroStickyNote[], experimentBox: MiroFrameLayout): ExperimentSummary {
  const stickies = stickiesInFrame(stickyNotes, experimentBox);
  const experimentSticky = stickies.find((sticky) => sticky.content.startsWith(NEW_EXPERIMENT_LABEL));
  const outcomeSticky = stickies.find((sticky) => sticky !== experimentSticky);

  return {
    thisSprintExperiment: experimentSticky ? extractExperimentText(experimentSticky.content) : undefined,
    goNoGoOutcome: outcomeSticky?.content,
  };
}
