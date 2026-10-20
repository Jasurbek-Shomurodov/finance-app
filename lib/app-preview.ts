import { sections } from '@/components/workspace/navigation';

/** The public pages show the real app in a frame: the app opened at `previewSource` starts its sample workspace by
 * itself, says when it is ready, and then shows whichever workspace screen the page asks for. */
const previewParam = 'preview';
export const previewSource = `/?${previewParam}=1`;
/** The size the framed app is laid out at before it is scaled to fit: a laptop window, so it shows the desktop layout. */
export const previewSize = { width: 1280, height: 800 } as const;

type PreviewMessage = { source: 'hoggish-preview'; type: 'ready' } | { source: 'hoggish-preview'; type: 'open'; path: string };
export const previewReady: PreviewMessage = { source: 'hoggish-preview', type: 'ready' };
export const previewOpen = (path: string): PreviewMessage => ({ source: 'hoggish-preview', type: 'open', path });

/** Whether this window is an app preview: framed by a page and opened with the preview flag. */
export function isPreviewFrame(search: string, framed: boolean) {
 return framed && new URLSearchParams(search).has(previewParam);
}

/** The workspace screen a message asks the preview to show, or null for anything else: only drawer destinations are opened. */
export function previewPath(data: unknown) {
 const message = data as Partial<PreviewMessage> | null;
 if (!message || message.source !== 'hoggish-preview' || message.type !== 'open') return null;
 const path = (message as { path?: unknown }).path;
 return typeof path === 'string' && sections.some(section => section.path === path) ? path : null;
}

/** Whether a message says the preview is ready. */
export function isPreviewReady(data: unknown) {
 const message = data as Partial<PreviewMessage> | null;
 return !!message && message.source === 'hoggish-preview' && message.type === 'ready';
}

/** Resolves on the first frame the screen shows no loading placeholder, or after `limit` milliseconds at the latest:
 * the preview says it is ready only then, so visitors never watch a chart load. */
export function whenLoaded(root: ParentNode, limit = 5000) {
 const until = performance.now() + limit;
 return new Promise<void>(done => {
  const check = () => root.querySelector('.chart-skeleton, .loading-placeholder') && performance.now() < until ? requestAnimationFrame(check) : done();
  check();
 });
}
