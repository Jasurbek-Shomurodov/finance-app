"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

/** Leaves the browser's own full screen, when the page is in it. */
const leaveScreen = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };

/** A card that can fill the screen and go back. The card stays where it is in the page (so everything it shows
 * keeps its state) and is laid over the app by `[data-fullscreen]` in the stylesheet, which also gives its chart
 * (`.portfolio-chart`) the room the rest of the card leaves. The whole page goes to the browser's full screen with
 * it, so dialogs opened from the card still show; where the browser has none (an iPhone) or refuses, the card fills
 * the window instead. The page behind stops scrolling and Escape returns, unless a dialog took the key first. `chartHeight` is that room in pixels, for a chart that
 * draws to a fixed height: undefined while the card is in the page. */
export function useFullscreenCard<T extends HTMLElement>() {
 const ref = useRef<T>(null);
 const [open, setOpen] = useState(false);
 const [chartHeight, setChartHeight] = useState<number>();
 const toggle = useCallback(() => {
  // Asked for from the press itself: a browser only grants full screen to a gesture.
  if (open) leaveScreen(); else void document.documentElement.requestFullscreen?.().catch(() => {});
  setOpen(!open);
 }, [open]);
 useEffect(() => {
  if (!open) return;
  const root = document.documentElement, scroll = root.style.overflow;
  root.style.overflow = 'hidden';
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { leaveScreen(); setOpen(false); } };
  // The browser's own exit (its Escape, a swipe, the F11 key) brings the card back to the page as well.
  const onScreen = () => { if (!document.fullscreenElement) setOpen(false); };
  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onScreen);
  // The chart can be swapped for a skeleton and back (another period, another comparison), so the watcher follows
  // whichever chart the card holds now.
  const card = ref.current;
  let watched: HTMLElement | null = null;
  const sync = () => {
   const chart = card?.querySelector<HTMLElement>('.portfolio-chart') ?? null;
   if (chart !== watched) { if (watched) sizes.unobserve(watched); watched = chart; if (chart) sizes.observe(chart); }
   if (chart) setChartHeight(Math.floor(chart.clientHeight));
  };
  const sizes = new ResizeObserver(sync), children = new MutationObserver(sync);
  if (card) children.observe(card, { childList: true });
  sync();
  return () => { root.style.overflow = scroll; document.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onScreen); sizes.disconnect(); children.disconnect(); setChartHeight(undefined); };
 }, [open]);
 return { ref, open, toggle, chartHeight };
}
