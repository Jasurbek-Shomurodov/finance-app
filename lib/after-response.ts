import { after } from 'next/server';
/** Runs `work` once the response is sent (keeping kept rates or prices up to date); outside a request, such as in a
 * test or a script, `after` is unavailable and the work runs at once, unawaited. */
export const afterResponse = (work: () => Promise<unknown>) => { try { after(work); } catch { void work(); } };
