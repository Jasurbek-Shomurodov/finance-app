"use client";
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';

/** The Edit multiple bar: how many are selected. The drawer that changes their fields together is `bulk-edit-sheet.tsx`. */
export function BulkEditBar({ count, total, onAll, onEdit, onCancel }: { count: number; total: number; onAll: (select: boolean) => void; onEdit: () => void; onCancel: () => void }) {
 const { t, locale } = useLanguage();
 const shown = formatNumber(count, locale, 0);
 return <div className="bulk-bar" role="region" aria-label={t('Edit multiple')}>
  <strong>{t('{count} selected', { count: shown })}</strong>
  <Button size="sm" variant="outline" disabled={!total} onClick={() => onAll(count < total)}>{t(total > 0 && count >= total ? 'Clear selection' : 'Select all')}</Button>
  <Button size="sm" disabled={!count} onClick={onEdit}>{t('Edit {count}', { count: shown })}</Button>
  <Button size="sm" variant="outline" onClick={onCancel}>{t('Done')}</Button>
 </div>;
}
