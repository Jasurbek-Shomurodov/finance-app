import { useEffect } from 'react';

/** The surfaces that glow under the pointer: key figures, holdings and every tappable card. `app/styles/interaction.css`
 * draws the glow at --glow-x / --glow-y for this same list (`tests/pointer-glow.mjs` keeps the two in step). */
export const glowing = '.stat-tile,.asset-card,.recurring-bar,.choice-card,.payoff-methods>button,.goal-template,.account-type-options>button,.asset-type-options>button,.transaction-details-cards>button,button.goal-available';

/** Tells the tile or card under the pointer where the pointer is, once per frame. One listener for
 * the whole workspace; touch screens, which have no pointer to follow, are left alone. */
export function usePointerGlow() {
 useEffect(() => {
  if (!window.matchMedia('(hover: hover)').matches) return;
  let frame = 0;
  const follow = (event: PointerEvent) => {
   if (frame) return;
   frame = requestAnimationFrame(() => {
    frame = 0;
    const surface = event.target instanceof Element ? event.target.closest<HTMLElement>(glowing) : null;
    if (!surface) return;
    const box = surface.getBoundingClientRect();
    surface.style.setProperty('--glow-x', `${Math.round(event.clientX - box.left)}px`);
    surface.style.setProperty('--glow-y', `${Math.round(event.clientY - box.top)}px`);
   });
  };
  document.addEventListener('pointermove', follow, { passive: true });
  return () => { document.removeEventListener('pointermove', follow); cancelAnimationFrame(frame); };
 }, []);
}
