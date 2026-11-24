// Cloudflare may stand in front of the Vercel deployment (docs/cloudflare.md). Vercel then sees Cloudflare's own
// address as the visitor, so the visitor's address and country have to come from Cloudflare's headers. Anyone can send
// those headers straight to the deployment, so they are believed only on a request that also carries the secret a
// Cloudflare rule adds (CLOUDFLARE_ORIGIN_SECRET). Without the variable nothing here applies and Vercel's headers stand.
import { createHash, timingSafeEqual } from 'node:crypto';

/** The request header the Cloudflare transform rule sets to the shared secret. */
export const originSecretHeader = 'x-origin-secret';
const minSecretLength = 32;
const digest = (value: string) => createHash('sha256').update(value).digest();

/** True when the request reached the app through our Cloudflare zone. */
export function throughCloudflare(req: Request, secret = process.env.CLOUDFLARE_ORIGIN_SECRET) {
 const sent = req.headers.get(originSecretHeader);
 if (!secret || secret.length < minSecretLength || !sent) return false;
 return timingSafeEqual(digest(sent), digest(secret));
}

/** A header Cloudflare sets about the visitor (cf-connecting-ip, cf-ipcountry), or null on a request that did not come through it. */
export function cloudflareHeader(req: Request, name: string, secret = process.env.CLOUDFLARE_ORIGIN_SECRET) {
 return throughCloudflare(req, secret) ? req.headers.get(name)?.trim() || null : null;
}
