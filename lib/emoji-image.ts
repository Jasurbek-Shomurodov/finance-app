// Category icons for the report PDF: the PDF's text font has no emoji, so each emoji is drawn once by the browser's own
// emoji font on a canvas and embedded as a picture. Without a canvas, or when nothing is drawn, the icon shows the
// category's first letter instead.
import type { EmojiImage } from './financial-report-pdf';

export function canvasEmojiImage(size = 96): EmojiImage {
 return async emoji => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.font = `${Math.round(size * .78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(emoji, size / 2, size * .54);
  // A browser without an emoji font may draw nothing at all; the letter is better than an empty tile.
  if (!context.getImageData(0, 0, size, size).data.some((value, index) => index % 4 === 3 && value > 0)) return null;
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
 };
}
