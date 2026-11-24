"use client";

import { useRef, useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { FieldError } from '@/components/presentation-foundation/field-error';
import { AuthPage, ProviderChoices } from '@/components/auth-card';
import { requestAccountAccess } from '@/lib/account-access-request';
import { showNotice } from '@/lib/feedback';
import { legalPaths } from '@/lib/legal';
import { maxPasswordLength, minPasswordLength } from '@/lib/password-policy';
import { signInPath } from '@/lib/sign-in-path';
import styles from './sign-in-screen.module.css';

/** Create account and Forgot password, in the sign-in card. `intent` picks one form, never both together. */
export function AccountAccessCard({ brand, intent }: { brand: React.ReactNode; intent: 'signup' | 'recover' }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState('');
  // A repeated password that differs is said under its field once the person has tried to continue or left the field.
  const [checked, setChecked] = useState(false);
  const repeatField = useRef<HTMLInputElement>(null);
  const signup = intent === 'signup';
  const mismatch = signup && password !== repeat;
  const repeatError = mismatch && checked ? 'Passwords do not match.' : undefined;
  const back = <p className={styles.register}>{signup && <>{t('Already have an account?')} </>}<Link href={signInPath}>{t(signup ? 'Sign in' : 'Back to sign in')}</Link></p>;
  // The form gives way to a plain confirmation, so a sent email is never mistaken for nothing happening.
  if (sent) return <AuthPage brand={brand} title="Check your email">
    <div className={styles.sent} role="status"><span className={styles.mark}><MailCheck size={26} aria-hidden="true"/></span><p>{t(signup ? 'We sent a confirmation link to {email}. Press it to finish creating your account.' : 'If an account exists for {email}, we sent a link to reset your password.', { email: sent })}</p><p>{t('It can take a minute. If you do not see it, check your spam or junk folder.')}</p></div>
    <Button type="button" variant="outline" className={styles.secondary} onClick={() => setSent('')}>{t('Use a different email')}</Button>
    <p className={styles.register}><Link href={signInPath}>{t('Back to sign in')}</Link></p>
  </AuthPage>;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mismatch) { setChecked(true); repeatField.current?.focus(); return; }
    setBusy(true); setError('');
    try {
      const result = await requestAccountAccess({ action: intent, email, password });
      if (result.message) showNotice(result.message);
      setPassword(''); setRepeat(''); setSent(email);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  const form = <form className={styles.form} onSubmit={submit} aria-busy={busy}>
    <label htmlFor="access-email">{t('Email address')}</label><Input id="access-email" type="email" placeholder="you@example.com" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={event => setEmail(event.target.value)}/>
    {signup && <>
      <div className={styles.passwordLabel}><label htmlFor="access-password">{t('New password')}</label></div><Input id="access-password" type="password" placeholder={t('Create a password')} autoComplete="new-password" minLength={minPasswordLength} maxLength={maxPasswordLength} required value={password} onChange={event => setPassword(event.target.value)}/>
      <p className={styles.hint}>{t('Use a unique password with at least 8 characters.')}</p>
      <div className={styles.passwordLabel}><label htmlFor="access-repeat">{t('Confirm password')}</label></div><Input ref={repeatField} id="access-repeat" type="password" placeholder={t('Repeat your password')} autoComplete="new-password" required aria-invalid={repeatError ? true : undefined} aria-describedby={repeatError ? 'access-repeat-error' : undefined} value={repeat} onChange={event => setRepeat(event.target.value)} onBlur={() => { if (repeat) setChecked(true); }}/>
      <FieldError id="access-repeat-error" message={repeatError}/>
    </>}
    <Button type="submit" className={styles.submit} disabled={busy}>{t(busy ? 'Saving…' : 'Continue')}</Button>
  </form>;
  return <AuthPage brand={brand} title={signup ? 'Create account' : 'Forgot password'}>
    {signup ? <ProviderChoices disabled={busy} footer={<><p className={styles.consent}>{t('By creating an account, you agree to the terms of use and privacy policy.')} <Link href={legalPaths.terms}>{t('Terms of use')}</Link> · <Link href={legalPaths.privacy}>{t('Privacy policy')}</Link></p>{back}</>}>{form}</ProviderChoices> : <>{form}{back}</>}
    <ErrorPopup message={error}/>
  </AuthPage>;
}
