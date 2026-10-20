"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties, type DetailedHTMLProps, type HTMLAttributes } from 'react';

// The figure is drawn with its own tags rather than spans, so a page's broad `.panel span` rules
// can never resize or space out the digit strips.
declare module 'react' {
 // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX element types can only be widened through this namespace.
 namespace JSX {
  interface IntrinsicElements {
   'roll-text': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
   'roll-chars': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
   'roll-char': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
   'roll-digit': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
   'roll-strip': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
  }
 }
}

/** How long one roll takes; the stylesheet's roll-strip transition uses the same duration. */
const rollMs = 900;
const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The characters of a formatted figure, keyed from the right so a digit keeps its column when the figure grows or shrinks. */
export function rollingColumns(text: string) {
 // The figure is already isolated left to right by the stylesheet, so the formatter's isolate marks have no column.
 const chars = [...text.replace(/[\u2066-\u2069]/g, '')];
 return chars.map((char, index) => ({ key: chars.length - index, char, digit: /[0-9]/.test(char) ? Number(char) : null }));
}

/** One digit as a strip of 0–9 that slides up or down when its value changes. A digit that appears (a page opening, a
 * figure arriving after its loading dash, a new column) is drawn at its value at once: nothing counts up from 0.
 * Once it has arrived the strip is swapped for the plain digit, so a resting figure is drawn exactly like text
 * (a strip moved by fractions of a pixel can leave its digit a hair above or below its neighbours). */
function RollingDigit({ digit, column }: { digit: number; column: number }) {
 const [shown, setShown] = useState(digit);
 const [settled, setSettled] = useState(true);
 const at = useRef(digit), drawn = useRef(false);
 const delay = Math.min(column, 8) * 35;
 useLayoutEffect(() => {
  // The first run only notes that the digit is on screen at its value; later runs roll.
  if (!drawn.current) { drawn.current = true; return; }
  // The strip must be back on screen before the next roll is painted.
  setSettled(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Two frames: the browser must paint the strip where it is before a move can be animated.
  let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
   const still = at.current === digit || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   at.current = digit;
   setShown(digit);
   // Nothing to roll (or no motion wanted): no transition will end, so rest now. Otherwise rest when the
   // slide ends, or once its time is up: a slide cut short before it began never reports an end.
   if (still) setSettled(true); else timer = setTimeout(() => setSettled(true), rollMs + delay + 100);
  }); });
  return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
 }, [digit, delay]);
 // React names a custom element's events from the prop as written (`onTransitionEnd` would wait for "TransitionEnd"), so listen directly.
 const strip = useRef<HTMLElement>(null);
 useLayoutEffect(() => {
  const node = strip.current, rest = () => setSettled(true);
  node?.addEventListener('transitionend', rest);
  return () => node?.removeEventListener('transitionend', rest);
 }, [settled]);
 if (settled) return <roll-digit><roll-char>{digit}</roll-char></roll-digit>;
 return <roll-digit><roll-strip ref={strip} style={{ transform: `translateY(-${shown * 10}%)`, '--roll-delay': `${delay}ms` } as CSSProperties}>{digits.map(item => <roll-char key={item}>{item}</roll-char>)}</roll-strip></roll-digit>;
}

/** An already formatted figure (money, a percentage, a count) whose digits roll into place like an odometer and roll up or down when it changes. Signs and separators stay put; screen readers and reduced motion get the final text only. */
export function RollingText({ text }: { text: string }) {
 // Right-to-left words (an Arabic "remaining") cannot be split into rolling characters without breaking how their letters
 // join, so such a value is shown as it is; a figure alone rolls, left to right in every language.
 if (/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/.test(text)) return <span>{text}</span>;
 return <roll-text><roll-chars aria-hidden="true">{rollingColumns(text).map(({ key, char, digit }) => digit === null ? <roll-char key={`c${key}`}>{char}</roll-char> : <RollingDigit key={`d${key}`} digit={digit} column={key}/>)}</roll-chars><span className="sr-only">{text}</span></roll-text>;
}
