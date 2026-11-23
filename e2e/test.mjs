// The `test` every spec imports: Playwright's own, with each browser page on the run's fixed day (e2e/fixed-clock.mjs).
import { test as base } from '@playwright/test';
import { browserClock } from './fixed-clock.mjs';

export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.addInitScript(browserClock);
    await provide(context);
  },
});
export { expect } from '@playwright/test';
