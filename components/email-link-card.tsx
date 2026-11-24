"use client";

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { AuthPage } from '@/components/auth-card';
import { NewPasswordFields, useNewPassword } from '@/components/new-password-fields';
import { requestAccountAccess } from '@/lib/account-access-request';
import { showNotice } from '@/lib/feedback';
import { recoverPath, signInPath } from '@/lib/sign-in-path';
import styles from './sign-in-screen.module.css';

/**
 * Where an emailed link lands, in the sign-in card: first a button that uses the link (a press, so a mail scanner
 * that opens links cannot spend it), then, for a reset link, the new password. A confirmation link signs the person
 * in; a changed password sends them to sign in with it. Opened without a link, it says so and offers a new one.
 */
export function EmailLinkCard({ brand, tokenHash, tokenType }: { brand: ReactNode; tokenHash: string; tokenType: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [step, setStep] = useState<'verify' | 'reset'>('verify');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const next = useNewPassword(step === 'reset');
  const preferences = <div className="preferences"><ThemeToggle/></div>;
  const back = <p className={styles.register}><Link href={signInPath}>{t('Back to sign in')}</Link></p>;
  if (!tokenHash) return <AuthPage brand={brand} preferences={preferences} title="Account access">
    <p className={styles.notice} role="status">{t('This link is invalid or expired. Request a new email.')}</p>
    <Button asChild variant="outline" className={styles.secondary}><Link href={recoverPath}>{t('Forgot password?')}</Link></Button>
    {back}
  </AuthPage>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (step === 'reset' && !next.check())) return;
    setBusy(true); setError('');
    try {
      const result = await requestAccountAccess(step === 'verify' ? { action: 'verify', token_hash: tokenHash, type: tokenType } : { action: 'reset', password: next.password });
      if (result.message) showNotice(result.message);
      if (step === 'reset') { next.clear(); router.replace(signInPath); }
      else if (result.next === 'reset') setStep('reset');
      else { router.replace('/'); router.refresh(); }
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  const reset = step === 'reset';
  return <AuthPage brand={brand} preferences={preferences} title={reset ? 'Change password' : 'Account access'} subtitle={reset ? undefined : 'Continue to verify this email link. Links expire and can only be used once.'}>
    <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      {reset && <NewPasswordFields {...next.fields}/>}
      <Button type="submit" className={styles.submit} disabled={busy}>{t(busy ? 'Saving…' : reset ? 'Change password' : 'Verify email link')}</Button>
    </form>
    {back}
    <ErrorPopup message={error}/>
  </AuthPage>;
}
