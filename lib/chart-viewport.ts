// The stretch of time a pannable chart shows, in milliseconds: zoomed around a point, moved sideways, and never
// past the history it has. Pure, so the gestures in `use-chart-viewport` stay a thin layer over tested arithmetic.
export type Viewport = { start: number; end: number };

/** The shortest stretch a chart zooms in to: two days, so at least one line segment stays in view. */
export const minViewportSpan = 2 * 86_400_000;

/** Keeps a view inside `extent`, no shorter than `minSpan` (or the whole extent, when that is shorter). */
export function clampViewport(view: Viewport, extent: Viewport, minSpan = minViewportSpan): Viewport {
 const full = extent.end - extent.start;
 const span = Math.min(full, Math.max(minSpan, view.end - view.start));
 const start = Math.min(extent.end - span, Math.max(extent.start, view.start));
 return { start, end: start + span };
}

/** Zooms by `factor` (below 1 zooms in) around `anchor`, a fraction of the width from the left edge: the day under the pointer stays under it. */
export function zoomViewport(view: Viewport, extent: Viewport, anchor: number, factor: number, minSpan = minViewportSpan): Viewport {
 const at = Math.min(1, Math.max(0, anchor));
 const span = view.end - view.start, next = span * factor;
 const pivot = view.start + span * at;
 return clampViewport({ start: pivot - next * at, end: pivot - next * at + next }, extent, minSpan);
}

/** Moves the view by `shift` milliseconds (negative goes back in time), stopping at either end of the history. */
export function panViewport(view: Viewport, extent: Viewport, shift: number): Viewport {
 const span = view.end - view.start;
 const start = Math.min(extent.end - span, Math.max(extent.start, view.start + shift));
 return { start, end: start + span };
}

/** Whether a view shows the whole history, so the chart can drop its Reset control. */
export function showsAll(view: Viewport, extent: Viewport): boolean {
 return view.start <= extent.start && view.end >= extent.end;
}

/** The points a view draws: those inside it plus one neighbour on each side, so the lines run out to both edges. */
export function pointsInView<T extends { timestamp: number }>(points: readonly T[], view: Viewport): T[] {
 const first = points.findIndex(point => point.timestamp >= view.start);
 if (first === -1) return points.slice(-1);
 // A gap with no point inside the view: the two around it carry the line across.
 if (points[first].timestamp > view.end) return points.slice(Math.max(0, first - 1), first + 1);
 let last = first;
 while (last + 1 < points.length && points[last + 1].timestamp <= view.end) last++;
 return points.slice(Math.max(0, first - 1), Math.min(points.length, last + 2));
}
