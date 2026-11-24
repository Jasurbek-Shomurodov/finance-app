import type { CSSProperties } from 'react';
import { useCategoryEmoji, useCategoryHue } from '@/components/category-icons-context';

/** A category's emoji on a tile tinted with its stable colour. `emoji` shows a given icon instead, as a category
 * whose icon a person chose would (sample rows on the public pages). */
export function CategoryIcon({ kind, size = 'md', emoji }: { kind: string; size?: 'sm' | 'md'; emoji?: string }) {
 const categoryEmoji = useCategoryEmoji(); const categoryHue = useCategoryHue();
 return <span className="category-icon" data-size={size} style={{ '--category-hue': categoryHue(kind) } as CSSProperties} aria-hidden="true">{emoji ?? categoryEmoji(kind)}</span>;
}
