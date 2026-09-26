export const RETRO_COLUMN_TITLES = [
  "What went well?",
  "What should we do differently?",
  "What should we start doing?",
  "Action items",
] as const;

export const MOOD_BOX_TITLE = "Mood";
export const DOT_VOTE_BOX_TITLE = "Dot Votes";

const COLUMN_WIDTH = 850;
const HALF_COLUMN_WIDTH = COLUMN_WIDTH / 2;
const COLUMN_HEIGHT = 1000;
const COLUMN_GAP = 50;
const MARKER_MARGIN = 250;
const FRAME_PADDING_TOP = 150;
const FRAME_PADDING_BOTTOM = 100;
const FRAME_PADDING_RIGHT = 50;
const MARKER_OFFSET = { x: 50, y: FRAME_PADDING_TOP };
const STICKY_STACK_SIZE = 3;
export const STICKY_NOTE_SIZE = { width: 199, height: 228 };
const STICKY_MARGIN = 40;
const STICKY_STACK_INSET = {
  x: STICKY_MARGIN + STICKY_NOTE_SIZE.width / 2,
  y: STICKY_MARGIN + STICKY_NOTE_SIZE.height / 2,
};
const STICKY_STACK_STAGGER = 15;
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
    x: STICKY_STACK_INSET.x + index * STICKY_STACK_STAGGER,
    y: STICKY_STACK_INSET.y + index * STICKY_STACK_STAGGER,
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
