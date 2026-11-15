"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { clampViewport, panViewport, showsAll, zoomViewport, type Viewport } from '@/lib/chart-viewport';

/** How far a press must travel before it counts as a drag rather than a click on a day. */
const dragThreshold = 4;
type Press = { x: number; view: Viewport; moved: boolean };
type Pinch = { distance: number; mid: number; view: Viewport };

/** The plot's own box (inside the axes), so a pointer's place maps to the right day; the chart's box until it draws. */
function plotBox(element: HTMLElement): DOMRect {
 return (element.querySelector('.recharts-cartesian-grid') ?? element).getBoundingClientRect();
}

/** Pan and zoom over time, as on a trading chart: drag (or swipe) moves through history, the wheel, a trackpad pinch
 * or a two-finger pinch zooms around the pointer, a sideways scroll moves, and a double click shows the whole
 * history. `extent` is the history the chart holds; with `enabled` false the view always shows all of it. `initial`
 * is where the view opens (a chosen period, from its start to the latest day): choosing a period only zooms, and
 * the history before it stays a drag away. A new `initial.pick` (the same period chosen again) opens it afresh.
 * `onMove` hears every move the person makes (a drag, a zoom, showing all), so a chosen period can stop looking chosen.
 * `consumeDrag` tells a click handler that the press it ends was a drag, so a drag never opens a day. */
export function useChartViewport(extent: Viewport | null, enabled: boolean, initial?: { start: number; pick: number }, onMove?: () => void) {
 const ref = useRef<HTMLDivElement>(null);
 // The view belongs to one history and one choice of period: another of either opens at the chosen period again.
 const key = enabled && extent ? `${extent.start}:${extent.end}:${initial?.start}:${initial?.pick}` : '';
 const [state, setState] = useState<{ key: string; view: Viewport | null }>({ key: '', view: null });
 const viewRef = useRef<Viewport | null>(null), extentRef = useRef(extent), moveRef = useRef(onMove);
 // Only a view that really changed counts as a move: zooming out at the whole history leaves the period chosen.
 const setView = useCallback((view: Viewport | null) => {
  const now = viewRef.current;
  setState({ key, view });
  if (view && (!now || now.start !== view.start || now.end !== view.end)) moveRef.current?.();
 }, [key]);
 const press = useRef<Press | null>(null), dragged = useRef(false);
 const touches = useRef(new Map<number, number>()), pinch = useRef<Pinch | null>(null);
 const view = state.key === key ? state.view : null;
 const opening = extent && initial ? { start: initial.start, end: extent.end } : extent;
 const current = enabled && extent && opening ? clampViewport(view ?? opening, extent) : extent;
 // The gesture listeners read the latest view and history without being added again on every move.
 useEffect(() => { viewRef.current = current; extentRef.current = extent; moveRef.current = onMove; });
 const zoom = useCallback((factor: number, anchor = .5) => {
  const now = viewRef.current, all = extentRef.current;
  if (now && all) setView(zoomViewport(now, all, anchor, factor));
 }, [setView]);
 const reset = useCallback(() => setView(extentRef.current), [setView]);
 useEffect(() => {
  const element = ref.current;
  if (!enabled || !element) return;
  const fraction = (clientX: number) => { const box = plotBox(element); return box.width ? (clientX - box.left) / box.width : .5; };
  const shiftFor = (pixels: number, now: Viewport) => -pixels / Math.max(1, plotBox(element).width) * (now.end - now.start);
  const onWheel = (event: WheelEvent) => {
   const now = viewRef.current, all = extentRef.current;
   if (!now || !all) return;
   event.preventDefault();
   if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey) { setView(panViewport(now, all, -shiftFor(event.deltaX, now))); return; }
   // A trackpad pinch arrives as a wheel with Ctrl held and small steps, so it zooms faster per step.
   setView(zoomViewport(now, all, fraction(event.clientX), Math.exp(event.deltaY * (event.ctrlKey ? .01 : .0015))));
  };
  const onDown = (event: PointerEvent) => {
   if (event.button !== 0 || !viewRef.current) return;
   dragged.current = false;
   if (event.pointerType === 'touch') {
    touches.current.set(event.pointerId, event.clientX);
    if (touches.current.size === 2) {
     const [a, b] = [...touches.current.values()];
     pinch.current = { distance: Math.max(1, Math.abs(a - b)), mid: fraction((a + b) / 2), view: viewRef.current };
     press.current = null;
     return;
    }
   }
   press.current = { x: event.clientX, view: viewRef.current, moved: false };
  };
  const onMove = (event: PointerEvent) => {
   const all = extentRef.current;
   if (!all) return;
   if (touches.current.has(event.pointerId)) touches.current.set(event.pointerId, event.clientX);
   if (pinch.current && touches.current.size === 2) {
    const [a, b] = [...touches.current.values()];
    setView(zoomViewport(pinch.current.view, all, pinch.current.mid, pinch.current.distance / Math.max(1, Math.abs(a - b))));
    dragged.current = true;
    return;
   }
   const held = press.current;
   if (!held) return;
   const dx = event.clientX - held.x;
   if (!held.moved && Math.abs(dx) < dragThreshold) return;
   held.moved = dragged.current = true;
   element.dataset.panning = '';
   setView(panViewport(held.view, all, shiftFor(dx, held.view)));
  };
  const onUp = (event: PointerEvent) => {
   touches.current.delete(event.pointerId);
   if (touches.current.size < 2) pinch.current = null;
   press.current = null;
   delete element.dataset.panning;
  };
  const onDouble = () => setView(extentRef.current);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('pointerdown', onDown);
  element.addEventListener('dblclick', onDouble);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  return () => {
   element.removeEventListener('wheel', onWheel);
   element.removeEventListener('pointerdown', onDown);
   element.removeEventListener('dblclick', onDouble);
   window.removeEventListener('pointermove', onMove);
   window.removeEventListener('pointerup', onUp);
   window.removeEventListener('pointercancel', onUp);
  };
 }, [enabled, setView]);
 const consumeDrag = useCallback(() => { const was = dragged.current; dragged.current = false; return was; }, []);
 const whole = !current || !extent || showsAll(current, extent);
 return { ref, view: current, whole, zoom, reset, consumeDrag };
}
