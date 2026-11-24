# Cloudflare in front of the app

The app runs on Vercel, which already absorbs network-level floods on every plan. Cloudflare in
front adds a second filter people reach first: its DDoS mitigation, bot filtering, a firewall
rule set and an "Under Attack" switch. This page is the whole setup. The app side is already in
the code (`lib/cloudflare.ts`) and stays switched off until `CLOUDFLARE_ORIGIN_SECRET` is set.

Cloudflare can only stand in front of a domain you own. It cannot protect a `*.vercel.app`
address, so the custom domain comes first (`docs/public-launch-audit.md`, Custom domain).

## What the code does

Behind Cloudflare, Vercel sees Cloudflare's address as the visitor. Left alone, every visitor
would share one rate-limit allowance (`lib/rate-limit.ts`) and the phone sign-in country would be
the Cloudflare site's. So:

- A Cloudflare rule adds the header `x-origin-secret` to every request it forwards.
- A request whose header equals `CLOUDFLARE_ORIGIN_SECRET` (32 characters or more) is believed:
  the visitor's address is `cf-connecting-ip` and the country is `cf-ipcountry`.
- Any other request, such as one sent straight to the `vercel.app` address with a made-up
  `cf-connecting-ip`, is read from Vercel's own headers as before.

`tests/api-route.mjs` and `tests/phone-sign-in.mjs` cover both paths.

## Setup, in order

1. **Domain on Vercel.** Add the domain to the Vercel project and confirm the site opens on it.
2. **Add the site to Cloudflare** (the Free plan is enough) and switch the domain's nameservers
   at the registrar to the two Cloudflare gives you.
3. **DNS.** Recreate the records Vercel shows for the domain and leave them **Proxied** (orange
   cloud). Records for email (MX, SPF, DKIM for Resend) stay **DNS only**.
4. **SSL/TLS mode: Full (strict).** Never Flexible: it loops redirects and sends traffic to
   Vercel unencrypted.
5. **Let Vercel renew its certificate.** Add a Configuration Rule (or WAF skip rule) for
   `/.well-known/acme-challenge/*` that turns off Automatic HTTPS Rewrites, security checks and
   caching, so Vercel's certificate check is never redirected or challenged.
6. **The secret header.** Generate a secret:

   ```bash
   openssl rand -base64 48
   ```

   In Cloudflare: Rules → Transform Rules → Modify Request Header → all incoming requests →
   *Set static* `x-origin-secret` to the secret. In Vercel: add `CLOUDFLARE_ORIGIN_SECRET` with
   the same value for Production, then redeploy.
7. **Close the side door.** The `vercel.app` address still answers and skips Cloudflare. In the
   Vercel project's Firewall, add a custom rule: *deny* when the request header
   `x-origin-secret` does not equal the secret **and** the path does not start with `/api/cron/`,
   `/api/telegram/webhook` or `/api/auth/send-sms-hook`. Those three are called by Vercel,
   Telegram and Supabase, each checks its own secret, and they keep using the `vercel.app`
   address so Cloudflare's bot filter never stops them.
8. **Cloudflare security settings.**
   - Security → Bots: **Bot Fight Mode** on.
   - Security → WAF: the free managed rules on; one rate limiting rule, for example path starts
     with `/api/`, more than 100 requests in 10 seconds from one address, block.
   - Security → Settings: Security Level Medium, Browser Integrity Check on.
   - Leave **off**: Rocket Loader, Email Address Obfuscation, any "Cache Everything" rule and
     Cloudflare Web Analytics. They rewrite or add scripts to pages the app renders itself, and
     the default cache rules already leave pages and `/api/` uncached.
9. **Point everything at the domain.** `APP_ORIGIN` on Vercel, the Supabase Site URL and
   redirect URLs, and the Google OAuth origins (`VERCEL.md`, `docs/email-setup-resend.md`).

## Checking it works

- `https://<domain>/api/health` answers 200; the response headers include `cf-ray`.
- Thirty-one quick requests to `/api/health` from one connection get a 429 while a second
  connection still gets 200: addresses are told apart again.
- After step 7, `https://<project>.vercel.app/` is denied.
- The phone sign-in form preselects your own country.

## During an attack

Cloudflare → Overview → **Under Attack Mode** shows every visitor a short browser check. Turn it
off when traffic settles. Vercel's Firewall has the matching **Attack Challenge Mode** for
traffic that reaches it.

## What this does not cover

The Supabase project address is public (the browser uploads attachments to it directly) and is
not behind this Cloudflare zone. It is protected by Supabase's own platform limits, row-level
security and the app's rate limits.
