"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { AuthPage, ProviderChoices } from '@/components/auth-card';
import { NewPasswordFields, useNewPassword } from '@/components/new-password-fields';
import { requestAccountAccess } from '@/lib/account-access-request';
import { showNotice } from '@/lib/feedback';
import { legalPaths } from '@/lib/legal';
import { signInPath, takeRecoverEmail } from '@/lib/sign-in-path';
import styles from './sign-in-screen.module.css';

/** Create account and Forgot password, in the sign-in card. `intent` picks one form, never both together. */
export function AccountAccessCard({ brand, intent }: { brand: React.ReactNode; intent: 'signup' | 'recover' }) {
  const { t } = useLanguage();
  const signup = intent === 'signup';
  const [email, setEmail] = useState('');
  const next = useNewPassword(signup);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState('');
  const preferences = <div className="preferences"><ThemeToggle/></div>;
  // Forgot password starts with the email typed on sign-in, when there was one.
  useEffect(() => { if (signup) return; const carried = takeRecoverEmail(); if (carried) queueMicrotask(() => setEmail(current => current || carried)); }, [signup]);
  const back = <p className={styles.register}>{signup && <>{t('Already have an account?')} </>}<Link href={signInPath}>{t(signup ? 'Sign in' : 'Back to sign in')}</Link></p>;
  // The form gives way to a plain confirmation, so a sent email is never mistaken for nothing happening.
  if (sent) return <AuthPage brand={brand} preferences={preferences} title="Check your email">
    <div className={styles.sent} role="status"><span className={styles.mark}><MailCheck size={26} aria-hidden="true"/></span><p>{t(signup ? 'We sent a confirmation link to {email}. Press it to finish creating your account.' : 'If an account exists for {email}, we sent a link to reset your password.', { email: sent })}</p><p>{t('It can take a minute. If you do not see it, check your spam or junk folder.')}</p></div>
    <Button type="button" variant="outline" className={styles.secondary} onClick={() => setSent('')}>{t('Use a different email')}</Button>
    <p className={styles.register}><Link href={signInPath}>{t('Back to sign in')}</Link></p>
  </AuthPage>;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !next.check()) return;
    setBusy(true); setError('');
    try {
      const result = await requestAccountAccess({ action: intent, email, password: next.password });
      if (result.message) showNotice(result.message);
      next.clear(); setSent(email);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  const form = <form className={styles.form} onSubmit={submit} aria-busy={busy}>
    <label htmlFor="access-email">{t('Email address')}</label><Input id="access-email" type="email" placeholder="you@example.com" autoComplete="email" autoCapitalize="none" spellCheck={false} required autoFocus={!signup} value={email} onChange={event => setEmail(event.target.value)}/>
    {signup && <NewPasswordFields {...next.fields}/>}
    <Button type="submit" className={styles.submit} disabled={busy}>{t(busy ? 'Saving…' : signup ? 'Create account' : 'Send reset link')}</Button>
  </form>;
  return <AuthPage brand={brand} preferences={preferences} title={signup ? 'Create account' : 'Forgot password'} subtitle={signup ? undefined : 'Enter your email and we will send you a link to reset your password.'}>
    {signup ? <ProviderChoices disabled={busy} footer={<><p className={styles.consent}>{t('By creating an account, you agree to the terms of use and privacy policy.')} <Link href={legalPaths.terms}>{t('Terms of use')}</Link> · <Link href={legalPaths.privacy}>{t('Privacy policy')}</Link></p>{back}</>}>{form}</ProviderChoices> : <>{form}{back}</>}
    <ErrorPopup message={error}/>
  </AuthPage>;
}
