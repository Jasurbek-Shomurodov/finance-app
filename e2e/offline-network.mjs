// Loaded into the test app server (`next start`, through NODE_OPTIONS in playwright.config.mjs) before Next.js starts.
// The app reads market prices from public services and a CI runner may wait seconds for each, so here every outside
// address is refused and a run never depends on the network. Exchange rates are seeded in e2e/fake-supabase.mjs.
// Requests to the app and to the test Supabase (localhost) pass through.

const local = new Set(['localhost', '127.0.0.1', '[::1]']);
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return local.has(url.hostname) ? realFetch(input, init) : Promise.resolve(new Response('Outside services are offline in the browser tests.', { status: 503 }));
};
