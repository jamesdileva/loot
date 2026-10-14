export const DRAG_THRESHOLD = 5;

export function shouldStartDrag(dx, dy, threshold = DRAG_THRESHOLD) {
  return dx * dx + dy * dy > threshold * threshold;
}