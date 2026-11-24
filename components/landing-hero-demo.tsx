"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { AnimatedMoney } from '@/components/presentation-foundation/animated-money';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { sections } from '@/components/workspace/navigation';
import { shiftDay } from '@/lib/calendar-days';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney } from '@/lib/format';
import styles from './landing-hero-demo.module.css';

// Sample data only, in one sample currency: a grocery expense joins the day's list and the Groceries budget.
// `dayBefore` is the day's other spending (the `today` rows below).
export const heroSample = { currency: 'USD', amount: 86, dayBefore: 70, budget: 400, spentBefore: 214 } as const;

/** What the scene shows at one moment. The loop starts and ends on `heroStart`; `heroPayoff` is the still frame. */
export type HeroScene = { added: boolean; counted: boolean; hover: boolean; pressed: 'add' | 'bin' | null };
export const heroStart: HeroScene = { added: false, counted: false, hover: false, pressed: null };
export const heroPayoff: HeroScene = { ...heroStart, added: true, counted: true };

/** The figures a scene shows: the day's total, the category's spending and its share of the budget. */
export function heroFigures(scene: HeroScene) {
 const day = heroSample.dayBefore + (scene.counted ? heroSample.amount : 0);
 const spent = heroSample.spentBefore + (scene.counted ? heroSample.amount : 0);
 return { day, spent, share: spent / heroSample.budget };
}

type Target = 'add' | 'bin' | 'rest';
type Cursor = { x: number; y: number; ms: number; shown: boolean };
/** One beat: it changes the scene or moves the cursor, and says how long to wait before the next one. */
type Beat = (play: { scene: (change: Partial<HeroScene>) => void; move: (to: Target) => number }) => number;
const press = 140;

/** The story, beat by beat: the cursor adds an expense, the totals follow, it holds, then the cursor deletes it and returns. */
export const heroBeats: Beat[] = [
 () => 900,
 ({ move }) => move('add'),
 ({ scene }) => { scene({ pressed: 'add' }); return press; },
 // Release: the row rises into the list, then the figures it changes roll and the bar grows.
 ({ scene }) => { scene({ pressed: null, added: true }); return 320; },
 ({ scene }) => { scene({ counted: true }); return 500; },
 ({ move }) => move('rest') + 2000,
 ({ move, scene }) => { const ms = move('bin'); scene({ hover: true }); return ms; },
 ({ scene }) => { scene({ pressed: 'bin' }); return press; },
 // Exits are quicker than arrivals: the row leaves, the list closes, the figures roll back.
 ({ scene }) => { scene({ pressed: null, added: false }); return 200; },
 ({ scene }) => { scene({ counted: false, hover: false }); return 700; },
 ({ move }) => move('rest') + 300,
];

/** How long the cursor takes to travel: longer for a longer way, like a hand. */
export const travelMs = (distance: number) => Math.round(Math.min(900, Math.max(380, 260 + distance * .8)));

/** Runs the beats in a loop on a clock that stops while paused and resumes with the time it had left. */
function loop(beats: Beat[], play: Parameters<Beat>[0]) {
 let index = 0, left = 0, due = 0, running = false;
 let timer: ReturnType<typeof setTimeout> | undefined;
 const schedule = (ms: number) => { left = ms; due = performance.now() + ms; timer = setTimeout(next, ms); };
 function next() { const ms = beats[index](play); index = (index + 1) % beats.length; schedule(ms); }
 return {
  play() { if (running) return; running = true; due = performance.now() + left; timer = setTimeout(next, left); },
  pause() { if (!running) return; running = false; clearTimeout(timer); left = Math.max(0, due - performance.now()); },
 };
}

/** Where a target sits, measured from the stage's inline start so the cursor lands right in either direction. */
function pointOf(stage: HTMLElement, target: Target, refs: Record<'add' | 'bin', RefObject<HTMLElement | null>>) {
 const box = stage.getBoundingClientRect(), rtl = getComputedStyle(stage).direction === 'rtl';
 const node = target === 'rest' ? null : refs[target].current;
 const spot = node?.getBoundingClientRect();
 const x = spot ? spot.left + spot.width * .55 : box.left + box.width * (rtl ? .42 : .58);
 const y = spot ? spot.top + spot.height * .6 : box.top + box.height * .78;
 return { x: rtl ? x - box.right : x - box.left, y: y - box.top };
}

/** Plays the story while the stage is on screen and the tab is visible; people who prefer less motion get the payoff, still. */
function useHeroScript(stage: RefObject<HTMLDivElement | null>, refs: Record<'add' | 'bin', RefObject<HTMLElement | null>>) {
 const [scene, setScene] = useState(heroStart);
 const [cursor, setCursor] = useState<Cursor>({ x: 0, y: 0, ms: 0, shown: false });
 useEffect(() => {
  const node = stage.current;
  if (!node) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { queueMicrotask(() => setScene(heroPayoff)); return; }
  let at = pointOf(node, 'rest', refs);
  queueMicrotask(() => setCursor({ ...at, ms: 0, shown: true }));
  const move = (to: Target) => {
   const point = pointOf(node, to, refs), ms = travelMs(Math.hypot(point.x - at.x, point.y - at.y));
   at = point;
   setCursor({ ...point, ms, shown: true });
   return ms;
  };
  const player = loop(heroBeats, { scene: change => setScene(current => ({ ...current, ...change })), move });
  let onScreen = false;
  const update = () => { if (onScreen && document.visibilityState === 'visible') player.play(); else player.pause(); };
  const observer = new IntersectionObserver(([entry]) => { onScreen = !!entry?.isIntersecting; update(); }, { threshold: .2 });
  observer.observe(node);
  document.addEventListener('visibilitychange', update);
  return () => { player.pause(); observer.disconnect(); document.removeEventListener('visibilitychange', update); };
 }, [stage, refs]);
 return { scene, cursor };
}

/** One spending row as Transactions shows it: the category on its tile, where the money came from, the amount. */
function SpendingRow({ kind, emoji, amount }: { kind: string; emoji?: string; amount: number }) {
 const { t, locale } = useLanguage();
 return <div className={styles.row}><CategoryIcon kind={kind} emoji={emoji} size="sm"/><span className={styles.name}><b>{t(kind)}</b><small>{t('Cash')}</small></span>
  <span className={styles.amount} dir="ltr" suppressHydrationWarning>{formatMoney(amount, heroSample.currency, locale)}</span></div>;
}

// What surrounds the story, all of it sample data: the drawer's first destinations, the day's other spending (it adds
// up to `dayBefore`), the day before, the other budgets and the payments coming up. Categories a person would have
// added themselves carry the icon they would have picked.
const icons = { Transport: '🚌', Shopping: '🛍️', Utilities: '💡', Fuel: '⛽', Pharmacy: '💊', Clothing: '👕', Subscriptions: '📺' } as const;
const rail = sections.slice(0, 7);
const today = [{ kind: 'Transport', emoji: icons.Transport, amount: 25 }, { kind: 'Shopping', emoji: icons.Shopping, amount: 45 }] as const;
const yesterday = [{ kind: 'Utilities', emoji: icons.Utilities, amount: 120 }, { kind: 'Fuel', emoji: icons.Fuel, amount: 40 }, { kind: 'Pharmacy', emoji: icons.Pharmacy, amount: 18 }, { kind: 'Clothing', emoji: icons.Clothing, amount: 64 }] as const;
const budgets = [{ kind: 'Transport', emoji: icons.Transport, spent: 95, budget: 250 }, { kind: 'Shopping', emoji: icons.Shopping, spent: 140, budget: 220 }, { kind: 'Utilities', emoji: icons.Utilities, spent: 170, budget: 200 }] as const;
const upcoming: readonly { kind: string; emoji?: string; amount: number }[] = [{ kind: 'Rent expense', amount: 900 }, { kind: 'Subscriptions', emoji: icons.Subscriptions, amount: 15 }, { kind: 'Mortgage', amount: 640 }];
const sum = (rows: readonly { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0);

/** The landing hero's product demo: a cropped window of the Transactions screen where a cursor adds a grocery
 * expense, the day's total and the Groceries budget follow, and the cursor deletes it again, in a seamless loop. */
export function LandingHeroDemo() {
 const { t, locale } = useLanguage();
 const stage = useRef<HTMLDivElement>(null), add = useRef<HTMLSpanElement>(null), bin = useRef<HTMLSpanElement>(null);
 const [refs] = useState(() => ({ add, bin }));
 const { scene, cursor } = useHeroScript(stage, refs);
 const { day, spent, share } = heroFigures(scene);
 const { currency } = heroSample;
 const groceries = t('Groceries');
 return <div ref={stage} className={styles.stage} role="img" aria-label={t('A short demo: adding a {category} expense updates the day’s total and the {category} budget.', { category: groceries })} data-added={scene.added || undefined} data-hover={scene.hover || undefined}>
  <div className={styles.window} aria-hidden="true">
   <div className={styles.rail}><i className={styles.mark}>h.</i>{rail.map(({ name, label, icon: Icon }) => <span key={name} data-current={name === 'Transactions' || undefined}><Icon size={15}/>{t(label)}</span>)}</div>
   <div className={styles.main}>
    <div className={styles.bar}><strong>{t('Transactions')}</strong><span ref={add} className={styles.add} data-pressed={scene.pressed === 'add' || undefined}><Plus size={15}/>{t('Add transaction')}</span></div>
    <div className={styles.columns}>
     <section className={styles.panel}>
      <div className={styles.dayHead}><span suppressHydrationWarning>{formatDate(depositToday(), locale)}</span><span className={styles.figure} dir="ltr" suppressHydrationWarning><AnimatedMoney value={day} currency={currency}/></span></div>
      <div className={styles.newRow}>
       <div className={styles.row}><CategoryIcon kind="Groceries" size="sm"/><span className={styles.name}><b>{groceries}</b><small>{t('Cash')}</small></span>
        <span ref={bin} className={styles.bin} data-pressed={scene.pressed === 'bin' || undefined}><Trash2 size={14}/></span>
        <span className={styles.amount} dir="ltr" suppressHydrationWarning>{formatMoney(heroSample.amount, currency, locale)}</span></div>
      </div>
      <div className={styles.below}>
       {today.map(row => <SpendingRow key={row.kind} {...row}/>)}
       <div className={styles.dayHead}><span suppressHydrationWarning>{formatDate(shiftDay(depositToday(), -1), locale)}</span><span className={styles.figure} dir="ltr" suppressHydrationWarning>{formatMoney(sum(yesterday), currency, locale)}</span></div>
       {yesterday.map(row => <SpendingRow key={row.kind} {...row}/>)}
      </div>
     </section>
     <section className={`${styles.panel} ${styles.budget}`}>
      <strong className={styles.panelTitle}>{t('Budget')}</strong>
      <div className={styles.budgetRow}>
       <div className={styles.budgetLine}><CategoryIcon kind="Groceries" size="sm"/><b>{groceries}</b><span className={styles.figure} dir="ltr" suppressHydrationWarning><AnimatedMoney value={spent} currency={currency}/></span></div>
       <small suppressHydrationWarning>{t('of {amount}', { amount: formatMoney(heroSample.budget, currency, locale) })}</small>
       <span className={styles.track}><span className={styles.fill} style={{ transform: `scaleX(${share})` }}/></span>
      </div>
      {budgets.map(row => <div key={row.kind} className={styles.budgetRow}>
       <div className={styles.budgetLine}><CategoryIcon kind={row.kind} emoji={row.emoji} size="sm"/><b>{t(row.kind)}</b><span className={styles.figure} dir="ltr" suppressHydrationWarning>{formatMoney(row.spent, currency, locale)}</span></div>
       <small suppressHydrationWarning>{t('of {amount}', { amount: formatMoney(row.budget, currency, locale) })}</small>
       <span className={styles.track}><span className={styles.fill} style={{ transform: `scaleX(${row.spent / row.budget})` }}/></span>
      </div>)}
     </section>
     <section className={`${styles.panel} ${styles.aside}`}><strong className={styles.panelTitle}>{t('Upcoming payments')}</strong>{upcoming.map(row => <SpendingRow key={row.kind} {...row}/>)}</section>
    </div>
   </div>
  </div>
  <span className={styles.cursor} aria-hidden="true" data-shown={cursor.shown || undefined} style={{ '--x': `${cursor.x}px`, '--y': `${cursor.y}px`, '--ms': `${cursor.ms}ms` } as CSSProperties}>
   <span className={styles.cursorY}><svg className={styles.arrow} data-pressed={scene.pressed ? true : undefined} viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l13 8.2-5.6 1.3 3.4 6.6-2.6 1.3-3.4-6.6L5 18z"/></svg></span>
  </span>
 </div>;
}
