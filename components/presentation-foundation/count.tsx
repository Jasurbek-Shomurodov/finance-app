"use client";
import { useLanguage } from '@/components/language-provider';
import { formatNumber } from '@/lib/format';

/** The number of items behind a heading or destination, as a pill; a dash while the count is still loading.
 * `label` is what a screen reader hears instead of the bare number ("14 payments"), for a pill that sits beside a
 * heading rather than inside one sentence. */
export function Count({ value, loading = false, label }: { value: number; loading?: boolean; label?: string }) {
 const { locale } = useLanguage();
 const shown = loading ? '—' : formatNumber(value, locale, 0);
 return label && !loading ? <span className="count"><span aria-hidden="true">{shown}</span><span className="sr-only">{label}</span></span> : <span className="count">{shown}</span>;
}
