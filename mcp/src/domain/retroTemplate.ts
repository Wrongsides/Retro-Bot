export const RETRO_COLUMN_TITLES = [
  "What went well?",
  "What should we do differently?",
  "What should we start doing?",
  "Action items",
] as const;

export const MOOD_BOX_TITLE = "Mood";
export const DOT_VOTE_BOX_TITLE = "Dot Votes";
export const RETRO_FRAME_TITLE_PATTERN = /^Retro(\s+\d+)?\s*-\s*/;

const COLUMN_WIDTH = 850;
const HALF_COLUMN_WIDTH = COLUMN_WIDTH / 2;
export const COLUMN_HEIGHT = 1000;
const COLUMN_GAP = 50;
const MARKER_MARGIN = 250;
const FRAME_PADDING_TOP = 150;
const FRAME_PADDING_BOTTOM = 100;
const FRAME_PADDING_RIGHT = 50;
const MARKER_OFFSET = { x: 50, y: FRAME_PADDING_TOP };
export const STICKY_STACK_SIZE = 3;
export const STICKY_NOTE_SIZE = { width: 199, height: 228 };
export const STICKY_MARGIN = 40;
export const STICKY_STACK_INSET = {
  x: STICKY_MARGIN + STICKY_NOTE_SIZE.width / 2,
  y: STICKY_MARGIN + STICKY_NOTE_SIZE.height / 2,
};
export const STICKY_STACK_STAGGER = 15;
const MOOD_STICKY_OFFSET = { x: HALF_COLUMN_WIDTH / 2, y: COLUMN_HEIGHT / 2 };
const DOT_VOTE_STICKY_OFFSET = { x: HALF_COLUMN_WIDTH / 2, y: COLUMN_HEIGHT / 2 };
const MOOD_STICKY_CONTENT = "How's everyone feeling about this sprint? 😀 😐 😞";
const DOT_VOTE_STICKY_CONTENT = "Add a dot 🔴 to vote for the action you care about most";

export interface RetroFrameLayout {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StickyLayout {
  content: string;
  x: number;
  y: number;
}

export interface RetroTemplateLayout {
  frame: RetroFrameLayout;
  columns: RetroFrameLayout[];
  columnStickyStacks: StickyLayout[][];
  moodBox: RetroFrameLayout;
  moodBoxSticky: StickyLayout;
  dotVoteBox: RetroFrameLayout;
  dotVoteBoxSticky: StickyLayout;
  marker: StickyLayout;
}

export function columnStickySlot(index: number): { x: number; y: number } {
  return {
    x: STICKY_STACK_INSET.x + index * STICKY_STACK_STAGGER,
    y: STICKY_STACK_INSET.y + index * STICKY_STACK_STAGGER,
  };
}

const STICKY_LIST_SPACING = STICKY_NOTE_SIZE.height + STICKY_MARGIN;
const STICKY_STACK_BOTTOM_Y =
  STICKY_STACK_INSET.y + (STICKY_STACK_SIZE - 1) * STICKY_STACK_STAGGER + STICKY_NOTE_SIZE.height / 2;

/**
 * Position for the Nth (0-based) sticky note appended below the starter
 * sticky stack in a column, stacked vertically (not staggered) so an
 * arbitrary number of items - e.g. Jira ticket summaries - can be added
 * without walking sideways off the column.
 */
export function columnListSlot(index: number): { x: number; y: number } {
  return {
    x: STICKY_STACK_INSET.x,
    y: STICKY_STACK_BOTTOM_Y + STICKY_MARGIN + STICKY_NOTE_SIZE.height / 2 + index * STICKY_LIST_SPACING,
  };
}

interface TitledFrame {
  title: string;
  x: number;
  y: number;
}

interface BoundedFrame extends TitledFrame {
  width: number;
  height: number;
}

/**
 * Finds the most recently created retro on the board - the one whose outer
 * frame sits furthest down, since new retros are auto-offset below existing
 * ones (see resolveOrigin in retroTemplateTools.ts).
 */
export function findLatestRetroFrame<T extends TitledFrame>(frames: T[]): T | undefined {
  const retroFrames = frames.filter((frame) => RETRO_FRAME_TITLE_PATTERN.test(frame.title));
  if (retroFrames.length === 0) {
    return undefined;
  }
  return retroFrames.reduce((latest, frame) => (frame.y > latest.y ? frame : latest));
}

/**
 * Finds a column frame (e.g. "Action items") that visually sits inside a
 * given outer retro frame. Miro does not parent column frames to the outer
 * frame, so this matches purely by title and geometric containment.
 */
export function findColumnFrame<T extends TitledFrame>(
  frames: T[],
  outerFrame: BoundedFrame,
  columnTitle: string,
): T | undefined {
  const left = outerFrame.x - outerFrame.width / 2;
  const right = outerFrame.x + outerFrame.width / 2;
  const top = outerFrame.y - outerFrame.height / 2;
  const bottom = outerFrame.y + outerFrame.height / 2;
  return frames.find(
    (frame) =>
      frame.title === columnTitle && frame.x >= left && frame.x <= right && frame.y >= top && frame.y <= bottom,
  );
}

export const CYCLE_OVERVIEW_FRAME_TITLE = "Cycle overview";
const CYCLE_OVERVIEW_GAP = 200;
const CYCLE_OVERVIEW_PADDING_TOP = 100;
const CYCLE_OVERVIEW_PADDING_BOTTOM = 60;
const CYCLE_OVERVIEW_MIN_ROWS = 1;

function cycleOverviewColumnsPerRow(boxWidth: number): number {
  return Math.max(1, Math.floor((boxWidth + STICKY_MARGIN) / (STICKY_NOTE_SIZE.width + STICKY_MARGIN)));
}

/**
 * Lays out a wide box directly below a retro's outer frame, sized to fit
 * `itemCount` ticket-summary sticky notes wrapped across rows as wide as the
 * retro itself, so ticket summaries get their own space instead of crowding
 * the "Action items" column.
 */
export function cycleOverviewBoxLayout(outerFrame: BoundedFrame, itemCount: number): RetroFrameLayout {
  const width = outerFrame.width;
  const columnsPerRow = cycleOverviewColumnsPerRow(width);
  const rows = Math.max(CYCLE_OVERVIEW_MIN_ROWS, Math.ceil(itemCount / columnsPerRow));
  const height = CYCLE_OVERVIEW_PADDING_TOP + rows * (STICKY_NOTE_SIZE.height + STICKY_MARGIN) + CYCLE_OVERVIEW_PADDING_BOTTOM;
  return {
    title: CYCLE_OVERVIEW_FRAME_TITLE,
    x: outerFrame.x,
    y: outerFrame.y + outerFrame.height / 2 + CYCLE_OVERVIEW_GAP + height / 2,
    width,
    height,
  };
}

/**
 * Position for the Nth (0-based) ticket-summary sticky note in the cycle
 * overview box, wrapping into a new row once a row is full of the box's
 * width, relative to the box's top-left corner.
 */
export function cycleOverviewStickySlot(index: number, boxWidth: number): { x: number; y: number } {
  const columnsPerRow = cycleOverviewColumnsPerRow(boxWidth);
  const col = index % columnsPerRow;
  const row = Math.floor(index / columnsPerRow);
  return {
    x: STICKY_MARGIN + STICKY_NOTE_SIZE.width / 2 + col * (STICKY_NOTE_SIZE.width + STICKY_MARGIN),
    y: CYCLE_OVERVIEW_PADDING_TOP + STICKY_NOTE_SIZE.height / 2 + row * (STICKY_NOTE_SIZE.height + STICKY_MARGIN),
  };
}

/**
 * Finds the cycle overview box belonging to a given retro's outer frame.
 * Since a new retro is always auto-offset below every existing frame
 * (including cycle overview boxes, see resolveOrigin), any cycle overview
 * box sitting below this outer frame's bottom edge must belong to it.
 */
export function findCycleOverviewBox<T extends TitledFrame>(frames: T[], outerFrame: BoundedFrame): T | undefined {
  const bottom = outerFrame.y + outerFrame.height / 2;
  return frames.find((frame) => frame.title === CYCLE_OVERVIEW_FRAME_TITLE && frame.y > bottom);
}

export function formatRetroDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildRetroTemplateLayout(
  date: Date,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): RetroTemplateLayout {
  const dateLabel = formatRetroDate(date);
  const boxWidths = [HALF_COLUMN_WIDTH, ...RETRO_COLUMN_TITLES.map(() => COLUMN_WIDTH), HALF_COLUMN_WIDTH];
  const totalBoxWidth = boxWidths.reduce((sum, width) => sum + width, 0);
  const frameWidth = MARKER_MARGIN + totalBoxWidth + (boxWidths.length - 1) * COLUMN_GAP + FRAME_PADDING_RIGHT;
  const frameHeight = FRAME_PADDING_TOP + COLUMN_HEIGHT + FRAME_PADDING_BOTTOM;

  let nextLeft = origin.x + MARKER_MARGIN;
  const boxAt = (width: number, title: string) => {
    const left = nextLeft;
    const top = origin.y + FRAME_PADDING_TOP;
    nextLeft = left + width + COLUMN_GAP;
    return {
      title,
      x: left + width / 2,
      y: top + COLUMN_HEIGHT / 2,
      width,
      height: COLUMN_HEIGHT,
    };
  };

  const moodBox = boxAt(HALF_COLUMN_WIDTH, MOOD_BOX_TITLE);
  const columns = RETRO_COLUMN_TITLES.map((title) => boxAt(COLUMN_WIDTH, title));
  const dotVoteBox = boxAt(HALF_COLUMN_WIDTH, DOT_VOTE_BOX_TITLE);

  const columnStickyStack = Array.from({ length: STICKY_STACK_SIZE }, (_, index) => ({
    content: "",
    ...columnStickySlot(index),
  }));

  return {
    frame: {
      title: `Retro - ${dateLabel}`,
      x: origin.x + frameWidth / 2,
      y: origin.y + frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
    },
    columns,
    columnStickyStacks: columns.map(() => columnStickyStack),
    moodBox,
    moodBoxSticky: { content: MOOD_STICKY_CONTENT, x: MOOD_STICKY_OFFSET.x, y: MOOD_STICKY_OFFSET.y },
    dotVoteBox,
    dotVoteBoxSticky: { content: DOT_VOTE_STICKY_CONTENT, x: DOT_VOTE_STICKY_OFFSET.x, y: DOT_VOTE_STICKY_OFFSET.y },
    marker: { content: `Retro: ${dateLabel}`, x: MARKER_OFFSET.x, y: MARKER_OFFSET.y },
  };
}
