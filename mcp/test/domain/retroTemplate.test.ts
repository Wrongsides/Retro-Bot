import { describe, expect, test } from "vitest";
import {
  buildRetroTemplateLayout,
  DOT_VOTE_BOX_TITLE,
  MOOD_BOX_TITLE,
  RETRO_COLUMN_TITLES,
  STICKY_NOTE_SIZE,
} from "../../src/domain/retroTemplate.js";
import { findPreviousCycleDate } from "../../src/domain/cycleOverview.js";

describe("buildRetroTemplateLayout", () => {
  test("lays out the four retro columns left to right with no overlap", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    expect(layout.columns.map((column) => column.title)).toEqual([...RETRO_COLUMN_TITLES]);
    for (let i = 1; i < layout.columns.length; i++) {
      const previousRightEdge = layout.columns[i - 1].x + layout.columns[i - 1].width / 2;
      const thisLeftEdge = layout.columns[i].x - layout.columns[i].width / 2;
      expect(thisLeftEdge).toBeGreaterThanOrEqual(previousRightEdge);
    }
  });

  test("sizes the outer frame to fully contain every column", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    const frameLeftEdge = layout.frame.x - layout.frame.width / 2;
    const frameRightEdge = layout.frame.x + layout.frame.width / 2;
    const frameTopEdge = layout.frame.y - layout.frame.height / 2;
    const frameBottomEdge = layout.frame.y + layout.frame.height / 2;

    for (const column of layout.columns) {
      expect(column.x - column.width / 2).toBeGreaterThanOrEqual(frameLeftEdge);
      expect(column.x + column.width / 2).toBeLessThanOrEqual(frameRightEdge);
      expect(column.y - column.height / 2).toBeGreaterThanOrEqual(frameTopEdge);
      expect(column.y + column.height / 2).toBeLessThanOrEqual(frameBottomEdge);
    }
  });

  test("titles the outer frame and date marker using the given date", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    expect(layout.frame.title).toBe("Retro - 2026-09-26");
    expect(findPreviousCycleDate([{ id: "1", content: layout.marker.content, x: 0, y: 0 }])).toBe("2026-09-26");
  });

  test("positions the template at a custom origin so multiple retros do not overlap", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date, { x: 5000, y: 2000 });

    expect(layout.frame.x).toBe(5000 + layout.frame.width / 2);
    expect(layout.frame.y).toBe(2000 + layout.frame.height / 2);
    expect(layout.columns[0].x).toBeGreaterThan(5000);
  });

  test("positions the frame and columns as board-absolute centers, since Miro positions unparented items by their center", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date, { x: 0, y: 0 });

    expect(layout.frame.x).toBe(layout.frame.width / 2);
    expect(layout.frame.y).toBe(layout.frame.height / 2);
    expect(layout.moodBox.x).toBe(250 + layout.moodBox.width / 2);
    expect(layout.columns[0].x).toBe(250 + layout.moodBox.width + 50 + layout.columns[0].width / 2);
    expect(layout.columns[0].y).toBe(150 + layout.columns[0].height / 2);
  });

  test("keeps the marker offset relative to the frame's top-left corner, since it is parented to the frame", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const originAtZero = buildRetroTemplateLayout(date, { x: 0, y: 0 });
    const originElsewhere = buildRetroTemplateLayout(date, { x: 5000, y: 2000 });

    expect(originElsewhere.marker.x).toBe(originAtZero.marker.x);
    expect(originElsewhere.marker.y).toBe(originAtZero.marker.y);
  });

  test("puts the mood box before the retro columns, and the dot votes box after them", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    expect(layout.moodBox.title).toBe(MOOD_BOX_TITLE);
    expect(layout.dotVoteBox.title).toBe(DOT_VOTE_BOX_TITLE);
    const firstColumn = layout.columns[0];
    const lastColumn = layout.columns[layout.columns.length - 1];
    expect(firstColumn.x - firstColumn.width / 2).toBeGreaterThanOrEqual(layout.moodBox.x + layout.moodBox.width / 2);
    expect(layout.dotVoteBox.x - layout.dotVoteBox.width / 2).toBeGreaterThanOrEqual(
      lastColumn.x + lastColumn.width / 2,
    );
  });

  test("keeps the mood box and dot votes box fully inside the outer frame", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    const frameLeftEdge = layout.frame.x - layout.frame.width / 2;
    const frameRightEdge = layout.frame.x + layout.frame.width / 2;
    const frameTopEdge = layout.frame.y - layout.frame.height / 2;
    const frameBottomEdge = layout.frame.y + layout.frame.height / 2;

    for (const box of [layout.moodBox, layout.dotVoteBox]) {
      expect(box.x - box.width / 2).toBeGreaterThanOrEqual(frameLeftEdge);
      expect(box.x + box.width / 2).toBeLessThanOrEqual(frameRightEdge);
      expect(box.y - box.height / 2).toBeGreaterThanOrEqual(frameTopEdge);
      expect(box.y + box.height / 2).toBeLessThanOrEqual(frameBottomEdge);
    }
  });

  test("gives every retro column a stack of starter sticky notes to help people get going", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    expect(layout.columnStickyStacks).toHaveLength(layout.columns.length);
    for (const stack of layout.columnStickyStacks) {
      expect(stack.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("keeps the sticky note stack offsets relative to their column, since they are parented to it", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const originAtZero = buildRetroTemplateLayout(date, { x: 0, y: 0 });
    const originElsewhere = buildRetroTemplateLayout(date, { x: 5000, y: 2000 });

    expect(originElsewhere.columnStickyStacks).toEqual(originAtZero.columnStickyStacks);
  });

  test("staggers the sticky notes in a stack so they visually look like a stack", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    const [first, second] = layout.columnStickyStacks[0];
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
  });

  test("keeps every sticky note fully inside its parent box, accounting for the sticky note's own footprint", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    const columnWidth = layout.columns[0].width;
    const columnHeight = layout.columns[0].height;
    const columnStickies = layout.columnStickyStacks.flat();
    for (const sticky of columnStickies) {
      expect(sticky.x - STICKY_NOTE_SIZE.width / 2).toBeGreaterThanOrEqual(0);
      expect(sticky.y - STICKY_NOTE_SIZE.height / 2).toBeGreaterThanOrEqual(0);
      expect(sticky.x + STICKY_NOTE_SIZE.width / 2).toBeLessThanOrEqual(columnWidth);
      expect(sticky.y + STICKY_NOTE_SIZE.height / 2).toBeLessThanOrEqual(columnHeight);
    }

    const sideBoxWidth = layout.moodBox.width;
    const sideBoxHeight = layout.moodBox.height;
    const sideBoxStickies = [layout.moodBoxSticky, layout.dotVoteBoxSticky];
    for (const sticky of sideBoxStickies) {
      expect(sticky.x - STICKY_NOTE_SIZE.width / 2).toBeGreaterThanOrEqual(0);
      expect(sticky.y - STICKY_NOTE_SIZE.height / 2).toBeGreaterThanOrEqual(0);
      expect(sticky.x + STICKY_NOTE_SIZE.width / 2).toBeLessThanOrEqual(sideBoxWidth);
      expect(sticky.y + STICKY_NOTE_SIZE.height / 2).toBeLessThanOrEqual(sideBoxHeight);
    }
  });

  test("makes the mood box and dot votes box half the width of a retro column, but the same height", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const layout = buildRetroTemplateLayout(date);

    const columnWidth = layout.columns[0].width;
    const columnHeight = layout.columns[0].height;
    expect(layout.moodBox.width).toBe(columnWidth / 2);
    expect(layout.moodBox.height).toBe(columnHeight);
    expect(layout.dotVoteBox.width).toBe(columnWidth / 2);
    expect(layout.dotVoteBox.height).toBe(columnHeight);
  });

  test("gives the mood box and the dot votes box an instructional sticky note, parented relative to their own box", () => {
    const date = new Date("2026-09-26T00:00:00.000Z");

    const originAtZero = buildRetroTemplateLayout(date, { x: 0, y: 0 });
    const originElsewhere = buildRetroTemplateLayout(date, { x: 5000, y: 2000 });

    expect(originAtZero.moodBoxSticky.content.length).toBeGreaterThan(0);
    expect(originAtZero.dotVoteBoxSticky.content.length).toBeGreaterThan(0);
    expect(originElsewhere.moodBoxSticky).toEqual(originAtZero.moodBoxSticky);
    expect(originElsewhere.dotVoteBoxSticky).toEqual(originAtZero.dotVoteBoxSticky);
  });
});
