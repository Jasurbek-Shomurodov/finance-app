"use client";

import { useRef, useState, type RefObject } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { FieldError } from '@/components/presentation-foundation/field-error';
import { maxPasswordLength, minPasswordLength } from '@/lib/password-policy';
import styles from './sign-in-screen.module.css';

const passwordHint = 'Use a unique password with at least 8 characters.';
type Field = 'password' | 'repeat';
type Props = { password: string; repeat: string; onPassword: (value: string) => void; onRepeat: (value: string) => void; passwordError?: string; repeatError?: string; onLeave: (field: Field) => void; passwordField: RefObject<HTMLInputElement | null>; repeatField: RefObject<HTMLInputElement | null> };

/**
 * A new password and its repeat for the public account cards (Create account, the emailed reset link). A password
 * that is too short, or a repeat that differs, is said under its field once the person has left that field or tried
 * to continue. `check` says whether the form may be sent, and otherwise shows what is wrong and moves to that field.
 * While `active` is false nothing is asked for.
 */
export function useNewPassword(active = true) {
  const [password, setPassword] = useState(''), [repeat, setRepeat] = useState('');
  const [left, setLeft] = useState<Record<Field, boolean>>({ password: false, repeat: false });
  const passwordField = useRef<HTMLInputElement>(null), repeatField = useRef<HTMLInputElement>(null);
  const short = active && password.length < minPasswordLength, mismatch = active && password !== repeat;
  const onLeave = (field: Field) => setLeft(current => ({ ...current, [field]: true }));
  const check = () => {
    if (short) { onLeave('password'); passwordField.current?.focus(); return false; }
    if (mismatch) { onLeave('repeat'); repeatField.current?.focus(); return false; }
    return true;
  };
  const clear = () => { setPassword(''); setRepeat(''); };
  const fields: Props = { password, repeat, onPassword: setPassword, onRepeat: setRepeat, onLeave, passwordField, repeatField,
    passwordError: short && left.password ? passwordHint : undefined, repeatError: mismatch && left.repeat ? 'Passwords do not match.' : undefined };
  return { password, check, clear, fields };
}

/** The two fields. The eye shows both passwords at once; each field says under itself what is wrong with it. */
export function NewPasswordFields({ password, repeat, onPassword, onRepeat, passwordError, repeatError, onLeave, passwordField, repeatField }: Props) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  return <>
    <div className={styles.passwordLabel}><label htmlFor="access-password">{t('New password')}</label></div>
    <div className={styles.password}><Input ref={passwordField} id="access-password" type={show ? 'text' : 'password'} placeholder={t('Create a password')} autoComplete="new-password" maxLength={maxPasswordLength} required aria-invalid={passwordError ? true : undefined} aria-describedby={passwordError ? 'access-password-error' : 'access-password-hint'} value={password} onChange={event => onPassword(event.target.value)} onBlur={() => { if (password) onLeave('password'); }}/><Button type="button" variant="ghost" size="icon" aria-label={t(show ? 'Hide password' : 'Show password')} aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</Button></div>
    {passwordError ? <FieldError id="access-password-error" message={passwordError}/> : <p id="access-password-hint" className={styles.hint}>{t(passwordHint)}</p>}
    <div className={styles.passwordLabel}><label htmlFor="access-repeat">{t('Confirm password')}</label></div>
    <Input ref={repeatField} id="access-repeat" type={show ? 'text' : 'password'} placeholder={t('Repeat your password')} autoComplete="new-password" required aria-invalid={repeatError ? true : undefined} aria-describedby={repeatError ? 'access-repeat-error' : undefined} value={repeat} onChange={event => onRepeat(event.target.value)} onBlur={() => { if (repeat) onLeave('repeat'); }}/>
    <FieldError id="access-repeat-error" message={repeatError}/>
  </>;
}
