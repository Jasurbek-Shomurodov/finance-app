"use client";

import { useEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { FieldError } from '@/components/presentation-foundation/field-error';
import { AuthPage, ProviderChoices } from '@/components/auth-card';
import { requestAccountAccess } from '@/lib/account-access-request';
import { showNotice } from '@/lib/feedback';
import { legalPaths } from '@/lib/legal';
import { maxPasswordLength, minPasswordLength } from '@/lib/password-policy';
import { signInPath, takeRecoverEmail } from '@/lib/sign-in-path';
import styles from './sign-in-screen.module.css';

const passwordHint = 'Use a unique password with at least 8 characters.';
type NewPasswordProps = { password: string; repeat: string; onPassword: (value: string) => void; onRepeat: (value: string) => void; passwordError?: string; repeatError?: string; onLeave: (field: 'password' | 'repeat') => void; passwordField: RefObject<HTMLInputElement | null>; repeatField: RefObject<HTMLInputElement | null> };

/** The new password and its repeat. The eye shows both at once; each field says under itself what is wrong with it. */
function NewPasswordFields({ password, repeat, onPassword, onRepeat, passwordError, repeatError, onLeave, passwordField, repeatField }: NewPasswordProps) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  return <>
      <div className={styles.passwordLabel}><label htmlFor="access-password">{t('New password')}</label></div><div className={styles.password}><Input ref={passwordField} id="access-password" type={show ? 'text' : 'password'} placeholder={t('Create a password')} autoComplete="new-password" maxLength={maxPasswordLength} required aria-invalid={passwordError ? true : undefined} aria-describedby={passwordError ? 'access-password-error' : 'access-password-hint'} value={password} onChange={event => onPassword(event.target.value)} onBlur={() => { if (password) onLeave('password'); }}/><Button type="button" variant="ghost" size="icon" aria-label={t(show ? 'Hide password' : 'Show password')} aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</Button></div>
      {passwordError ? <FieldError id="access-password-error" message={passwordError}/> : <p id="access-password-hint" className={styles.hint}>{t(passwordHint)}</p>}
      <div className={styles.passwordLabel}><label htmlFor="access-repeat">{t('Confirm password')}</label></div><Input ref={repeatField} id="access-repeat" type={show ? 'text' : 'password'} placeholder={t('Repeat your password')} autoComplete="new-password" required aria-invalid={repeatError ? true : undefined} aria-describedby={repeatError ? 'access-repeat-error' : undefined} value={repeat} onChange={event => onRepeat(event.target.value)} onBlur={() => { if (repeat) onLeave('repeat'); }}/>
      <FieldError id="access-repeat-error" message={repeatError}/>
  </>;
}

/** Create account and Forgot password, in the sign-in card. `intent` picks one form, never both together. */
export function AccountAccessCard({ brand, intent }: { brand: React.ReactNode; intent: 'signup' | 'recover' }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState('');
  // A password that is too short, or a repeat that differs, is said under its field once the person has left that
  // field or tried to continue.
  const [checked, setChecked] = useState(false), [passwordChecked, setPasswordChecked] = useState(false);
  const passwordField = useRef<HTMLInputElement>(null), repeatField = useRef<HTMLInputElement>(null);
  const signup = intent === 'signup';
  const short = signup && password.length < minPasswordLength, mismatch = signup && password !== repeat;
  const leave = (field: 'password' | 'repeat') => { if (field === 'password') setPasswordChecked(true); else setChecked(true); };
  const passwordError = short && passwordChecked ? passwordHint : undefined;
  const repeatError = mismatch && checked ? 'Passwords do not match.' : undefined;
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
    if (busy) return;
    if (short) { setPasswordChecked(true); passwordField.current?.focus(); return; }
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
    <label htmlFor="access-email">{t('Email address')}</label><Input id="access-email" type="email" placeholder="you@example.com" autoComplete="email" autoCapitalize="none" spellCheck={false} required autoFocus={!signup} value={email} onChange={event => setEmail(event.target.value)}/>
    {signup && <NewPasswordFields password={password} repeat={repeat} onPassword={setPassword} onRepeat={setRepeat} passwordError={passwordError} repeatError={repeatError} onLeave={leave} passwordField={passwordField} repeatField={repeatField}/>}
    <Button type="submit" className={styles.submit} disabled={busy}>{t(busy ? 'Saving…' : signup ? 'Create account' : 'Send reset link')}</Button>
  </form>;
  return <AuthPage brand={brand} preferences={preferences} title={signup ? 'Create account' : 'Forgot password'} subtitle={signup ? undefined : 'Enter your email and we will send you a link to reset your password.'}>
    {signup ? <ProviderChoices disabled={busy} footer={<><p className={styles.consent}>{t('By creating an account, you agree to the terms of use and privacy policy.')} <Link href={legalPaths.terms}>{t('Terms of use')}</Link> · <Link href={legalPaths.privacy}>{t('Privacy policy')}</Link></p>{back}</>}>{form}</ProviderChoices> : <>{form}{back}</>}
    <ErrorPopup message={error}/>
  </AuthPage>;
}
