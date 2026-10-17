"use client";
import { useState } from 'react';
import { Activity } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { Button } from '@/components/ui/button';
import { checkDatabaseHealth, type DatabaseHealth as Health } from '@/lib/database-health';
import { formatDateTime, formatNumber } from '@/lib/format';

/** Settings › Import & backup: asks the database on demand whether every migration this app version needs is applied. */
export function DatabaseHealth({ demo }: { demo: boolean }) {
 const { t, locale } = useLanguage();
 const [busy, setBusy] = useState(false);
 const [result, setResult] = useState<(Health & { checkedAt: string }) | null>(null);
 const check = async () => { setBusy(true); try { setResult({ ...await checkDatabaseHealth(), checkedAt: new Date().toISOString() }); } finally { setBusy(false); } };
 const versions = result && result.schemaVersion !== null && result.requiredVersion !== null;
 return <section className="panel tools-panel database-health">
  <h2>{t('Database health')}<InfoHint>{t('Checks that every database migration this version of the app needs has been applied.')}</InfoHint></h2>
  {demo ? <p className="muted">{t('The sample workspace has no database to check.')}</p> : <>
   <Button type="button" variant="outline" disabled={busy} onClick={check}><Activity size={16} aria-hidden="true"/>{t(busy ? 'Checking database…' : 'Check database')}</Button>
   {result && <div role="status" aria-live="polite">
    <p><span className={result.compatible ? 'status-badge is-paid' : 'status-badge is-overdue'}>{t(result.compatible ? 'Up to date' : result.requiredVersion !== null ? 'Update needed' : 'Check failed')}</span> <span className="muted">{t('Checked {time}', { time: formatDateTime(result.checkedAt, locale) })}</span></p>
    {versions && <p>{t('Database version {version}; the app needs {required}.', { version: formatNumber(result.schemaVersion!, locale, 0), required: formatNumber(result.requiredVersion!, locale, 0) })}</p>}
    {result.error && <p role="alert">{t(result.error)}</p>}
   </div>}
  </>}
 </section>;
}
