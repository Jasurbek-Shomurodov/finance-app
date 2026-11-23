// One calendar day for the whole browser-test run. The Dashboard and the schedules print "today", the day of the
// month and how many payments are overdue, so a run on another day would draw other pages; screenshot tests
// (e2e/screens.spec.mjs) need the same page every time. The clock is moved, not stopped: it starts at
// `startsAt` and ticks on, so timers, sessions and token expiry behave as usual.
//
// It is loaded into every process of a run: the test runner and its workers (imported by e2e/fixture.mjs), both
// servers (through NODE_OPTIONS in playwright.config.mjs; PGlite's now() follows the JS clock), and the browser
// (`browserClock`, added to each page by e2e/test.mjs). The day lies in the future on purpose: the browser keeps
// cookies by the real clock, and a session cookie dated in the past would be dropped at once.

/** Noon in Tashkent (the tests' time zone) on a mid-month weekday, so no month or year boundary is near. */
export const startsAt = Date.parse(process.env.E2E_NOW ?? '2030-03-13T12:00:00+05:00');

/** Moves `scope`'s Date so that now is `start`, keeping every other use of Date (parsing, fields, UTC) as it was. */
function shiftClock(scope, start) {
  const RealDate = scope.Date;
  if (RealDate.shifted) return;
  const offset = start - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [RealDate.now() + offset])); }
    static now() { return RealDate.now() + offset; }
  }
  // Own copies of parse, UTC and the rest: Next.js wraps Date by copying its own properties, not inherited ones.
  for (const key of ['parse', 'UTC']) Object.defineProperty(ShiftedDate, key, { value: RealDate[key], writable: true, configurable: true });
  // Called without `new`, Date returns a string of the current time.
  const callable = new Proxy(ShiftedDate, { apply: () => new ShiftedDate().toString() });
  Object.defineProperty(ShiftedDate, 'shifted', { value: true });
  scope.Date = callable;
}

shiftClock(globalThis, startsAt);

/** The same shift as a browser init script; `page.clock` would stop timers instead of moving the day. */
export const browserClock = { content: `(${shiftClock})(globalThis, ${startsAt});` };
