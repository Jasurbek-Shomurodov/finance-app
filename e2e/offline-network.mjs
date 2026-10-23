// Loaded into the test app server (`next start`, through NODE_OPTIONS in playwright.config.mjs) before Next.js starts.
// The app reads exchange rates and market prices from public services; a CI runner may wait seconds for each of them
// (cbu.uz times out from abroad), which left the workspace loading past every test's timeout. Here the rate services
// answer at once with fixed rates and every other outside address is refused, so a run never depends on the network
// and its figures are the same everywhere. Requests to the app and to the test Supabase (localhost) pass through.

// Units of each currency per US dollar.
const perUsd = { USD: 1, EUR: 0.92, UZS: 12700 };
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const today = () => new Date().toISOString().slice(0, 10);
const cbuDate = day => day.split('-').reverse().join('.');
// The Central Bank of Uzbekistan lists UZS per `Nominal` units of each currency.
const cbuRows = (day, only) => Object.entries(perUsd).filter(([code]) => code !== 'UZS' && (!only || code === only))
  .map(([code, rate]) => ({ Ccy: code, Rate: String(perUsd.UZS / rate), Nominal: '1', Date: cbuDate(day) }));

function answer(url) {
  if (url.hostname === 'cbu.uz') {
    const day = url.pathname.match(/\/json\/all\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1];
    if (day) return json(cbuRows(day));
    const code = url.pathname.match(/\/json\/([A-Z]{3})\/?$/)?.[1];
    if (code) return json(cbuRows(today(), code));
  }
  if (url.hostname === 'api.frankfurter.dev') {
    const date = url.pathname.match(/\/v1\/(\d{4}-\d{2}-\d{2})$/)?.[1];
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (date && perUsd[from] && perUsd[to]) return json({ base: from, date, rates: { [to]: perUsd[to] / perUsd[from] } });
  }
  if (url.hostname === 'open.er-api.com' && url.pathname === '/v6/latest/USD') {
    return json({ result: 'success', base_code: 'USD', rates: perUsd, time_last_update_unix: Math.floor(Date.now() / 1000) });
  }
  return new Response('Outside services are offline in the browser tests.', { status: 503 });
}

const local = new Set(['localhost', '127.0.0.1', '[::1]']);
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return local.has(url.hostname) ? realFetch(input, init) : Promise.resolve(answer(url));
};
