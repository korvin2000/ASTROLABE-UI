/** How close to the end the conversation must be scrolled for new items to keep it there. */
export const FOLLOW_SLACK = 80;

/** The smallest drop of the scroll offset, in pixels, taken as the user moving up. */
const MOVE_UP = 2;

/**
 * Whether the conversation follows its end after a scroll event. A move up is the user's and stops the following at
 * once, however small: a distance threshold alone pulls the view back to the end on every new item while the user is
 * still inside it. An offset that fell because the content shrank ends at the end, so the view stays pinned; following
 * the end only ever raises the offset.
 */
export function pinnedAfterScroll(pinned: boolean, lastTop: number, top: number, toEnd: number): boolean {
  // More than a layout's rounding: at 125% or 150% display scaling the offset can fall by a fraction of a pixel on its own.
  if (top < lastTop - MOVE_UP && toEnd > MOVE_UP) return false;
  if (toEnd < FOLLOW_SLACK) return true;
  return pinned;
}
