/** How a scripted scroll should move: smoothly, or at once for someone who asked for reduced motion. Every
 * `scrollIntoView` that would glide reads this, so none of them travels under that setting. */
export function scrollBehavior(): ScrollBehavior {
 return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
