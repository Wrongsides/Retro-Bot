import { describe, expect, test } from "vitest";
import {
  buildNarrativePrompt,
  summarizeColumn,
  summarizeExperimentBox,
  summarizeMood,
} from "../../src/domain/retroSummary.js";
import { MOOD_STICKY_CONTENT, NEW_EXPERIMENT_PREFIX, GO_NO_GO_PREFIX } from "../../src/domain/retroTemplate.js";
import type { MiroFrameLayout, MiroStickyNote } from "../../src/clients/miroClient.js";

const column: MiroFrameLayout = { id: "column-1", title: "Action items", x: 0, y: 0, width: 400, height: 1000 };
const moodBox: MiroFrameLayout = { id: "mood-1", title: "Mood", x: 0, y: 0, width: 400, height: 400 };
const experimentBox: MiroFrameLayout = {
  id: "experiment-1",
  title: "Experiment Tracking",
  x: 0,
  y: 0,
  width: 400,
  height: 400,
};

describe("summarizeColumn", () => {
  test("lists the non-empty sticky notes that belong to the column", () => {
    const stickyNotes: MiroStickyNote[] = [
      { id: "1", content: "Fix the flaky deploy pipeline", x: 0, y: 0, frameId: column.id },
      { id: "2", content: "Pair more on tricky tickets", x: 0, y: 0, frameId: column.id },
      { id: "3", content: "Unrelated note in another column", x: 0, y: 0, frameId: "column-2" },
    ];

    const summary = summarizeColumn(stickyNotes, column);

    expect(summary).toEqual({ title: "Action items", items: ["Fix the flaky deploy pipeline", "Pair more on tricky tickets"] });
  });

  test("excludes blank placeholder stickies left over from the template", () => {
    const stickyNotes: MiroStickyNote[] = [
      { id: "1", content: "", x: 0, y: 0, frameId: column.id },
      { id: "2", content: "   ", x: 0, y: 0, frameId: column.id },
    ];

    const summary = summarizeColumn(stickyNotes, column);

    expect(summary).toEqual({ title: "Action items", items: [] });
  });
});

describe("summarizeMood", () => {
  test("lists the mood reactions people left, excluding the prompt sticky", () => {
    const stickyNotes: MiroStickyNote[] = [
      { id: "1", content: MOOD_STICKY_CONTENT, x: 0, y: 0, frameId: moodBox.id },
      { id: "2", content: "😀 feeling great about the release", x: 0, y: 0, frameId: moodBox.id },
      { id: "3", content: "😐 a bit stretched thin", x: 0, y: 0, frameId: moodBox.id },
    ];

    const summary = summarizeMood(stickyNotes, moodBox);

    expect(summary).toEqual(["😀 feeling great about the release", "😐 a bit stretched thin"]);
  });

  test("returns an empty list when nobody has left a mood reaction yet", () => {
    const stickyNotes: MiroStickyNote[] = [{ id: "1", content: MOOD_STICKY_CONTENT, x: 0, y: 0, frameId: moodBox.id }];

    const summary = summarizeMood(stickyNotes, moodBox);

    expect(summary).toEqual([]);
  });
});

describe("summarizeExperimentBox", () => {
  test("reports this sprint's experiment and the previous go/no-go outcome", () => {
    const stickyNotes: MiroStickyNote[] = [
      {
        id: "1",
        content: `${NEW_EXPERIMENT_PREFIX}Pair by default on tickets`,
        x: 0,
        y: 0,
        frameId: experimentBox.id,
      },
      {
        id: "2",
        content: `${GO_NO_GO_PREFIX}Go ✅ - keep pairing by default`,
        x: 0,
        y: 0,
        frameId: experimentBox.id,
      },
    ];

    const summary = summarizeExperimentBox(stickyNotes, experimentBox);

    expect(summary).toEqual({
      thisSprintExperiment: "Pair by default on tickets",
      goNoGoOutcome: `${GO_NO_GO_PREFIX}Go ✅ - keep pairing by default`,
    });
  });

  test("omits fields that have not been filled in yet", () => {
    const stickyNotes: MiroStickyNote[] = [];

    const summary = summarizeExperimentBox(stickyNotes, experimentBox);

    expect(summary).toEqual({ thisSprintExperiment: undefined, goNoGoOutcome: undefined });
  });
});

describe("buildNarrativePrompt", () => {
  test("asks for a narrative summary and includes every column, the mood and the experiment outcome", () => {
    const summary = {
      retroFrameTitle: "Retro 2026-09-20",
      columns: [
        { title: "What went well", items: ["Shipped the new onboarding flow"] },
        { title: "What could improve", items: [] },
      ],
      mood: ["😀 feeling great about the release"],
      experiment: {
        thisSprintExperiment: "Pair by default on tickets",
        goNoGoOutcome: "Go ✅ - keep pairing by default",
      },
    };

    const prompt = buildNarrativePrompt(summary);

    expect(prompt).toBe(
      [
        "Write a short, warm narrative summary of this team retrospective for Retro 2026-09-20.",
        "Write it as flowing prose, not a bullet list.",
        "",
        "What went well:",
        "Shipped the new onboarding flow",
        "",
        "What could improve:",
        "Nothing was raised.",
        "",
        "Team mood:",
        "😀 feeling great about the release",
        "",
        "Experiment tracking:",
        "This sprint's experiment: Pair by default on tickets",
        "Previous experiment go/no-go: Go ✅ - keep pairing by default",
      ].join("\n"),
    );
  });

  test("notes when nobody has left a mood reaction or set up an experiment yet", () => {
    const summary = {
      retroFrameTitle: "Retro 2026-09-13",
      columns: [{ title: "What went well", items: [] }],
      mood: [],
      experiment: { thisSprintExperiment: undefined, goNoGoOutcome: undefined },
    };

    const prompt = buildNarrativePrompt(summary);

    expect(prompt).toBe(
      [
        "Write a short, warm narrative summary of this team retrospective for Retro 2026-09-13.",
        "Write it as flowing prose, not a bullet list.",
        "",
        "What went well:",
        "Nothing was raised.",
        "",
        "Team mood:",
        "Nobody has left a mood reaction yet.",
        "",
        "Experiment tracking:",
        "This sprint's experiment: None set up yet.",
        "Previous experiment go/no-go: None recorded yet.",
      ].join("\n"),
    );
  });
});
