"use client";
import { Trash2 } from 'lucide-react';
import { showNotice } from '@/lib/feedback';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import {useId,useState} from 'react';
import {useSessionResource} from '@/hooks/use-owner-resource';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLanguage} from '@/components/language-provider';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {maxPasswordLength,minPasswordLength} from '@/lib/password-policy';
import {recoverPath} from '@/lib/sign-in-path';
import {requestAccountAccess} from '@/lib/account-access-request';
const noCapabilities:{deletion?:unknown;phoneOnly?:unknown;googleOnly?:unknown}={};
/** Account security in Settings: change the password, add an email to a phone-only account, delete the account. Create
 * account and Forgot password are `AccountAccessCard`; an emailed link lands on `EmailLinkCard`. */
export function AccountAccessPanel({onSignedOut}:{onSignedOut?:()=>void}){
 const {t}=useLanguage();const router=useRouter();const [chosenMode,setMode]=useState('change_password'),[email,setEmail]=useState(''),[current,setCurrent]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[confirmation,setConfirmation]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 // What the account may do; a failed read leaves both off, without a message (the form says when deletion is not set up).
 const {data:served}=useSessionResource('/api/account-access',true,0,noCapabilities);
 const capabilities={deletion:served.deletion===true,phoneOnly:served.phoneOnly===true,googleOnly:served.googleOnly===true};
 const passwordHint=useId();
 // A phone-only account has no password to change: it can add an email and password, or delete the account.
 const mode=capabilities.phoneOnly&&chosenMode==='change_password'?'add_email':chosenMode;
 const needsPassword=['change_password','add_email'].includes(mode);
 return <section className="panel tools-panel account-security-panel" data-mode={mode}><h2>{t(mode==='add_email'?'Add an email and password':'Account security')}</h2>{mode==='add_email'&&<p>{t('Your account was created with a phone number. Add an email and password to sign in with them too.')}</p>}
 <form className="record-form" onSubmit={async event=>{event.preventDefault();if(busy||(mode==='delete_account'&&!capabilities.deletion))return;setBusy(true);setError('');try{const result=await requestAccountAccess({action:mode,email,password,current_password:current,confirmation});if(result.message)showNotice(result.message);setPassword('');setRepeat('');setCurrent('');setConfirmation('');if(result.next==='signed_in'){router.replace('/');router.refresh();}if(['change_password','delete_account'].includes(mode)){onSignedOut?.();router.replace('/');router.refresh();}}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}>
 <fieldset disabled={busy||(mode==='delete_account'&&!capabilities.deletion)} className="tracker-fields">
 {mode==='add_email'&&<label>{t('Email address')}<Input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>}
 {(mode==='change_password'||(mode==='delete_account'&&!capabilities.phoneOnly))&&<label>{t('Current password')}<Input type="password" autoComplete="current-password" required value={current} onChange={event=>setCurrent(event.target.value)}/></label>}
 {capabilities.googleOnly&&(mode==='change_password'||mode==='delete_account')&&<p className="muted">{t('You signed in with Google, so this account may not have a password yet. Set one with Forgot password, then enter it here.')} <Link href={recoverPath}>{t('Forgot password?')}</Link></p>}
 {needsPassword&&<><label>{t('New password')}<Input type="password" autoComplete="new-password" aria-describedby={passwordHint} minLength={minPasswordLength} maxLength={maxPasswordLength} required value={password} onChange={event=>setPassword(event.target.value)}/><small id={passwordHint} className="muted">{t('Use a unique password with at least 8 characters.')}</small></label><label>{t('Confirm password')}<Input type="password" autoComplete="new-password" required value={repeat} onChange={event=>setRepeat(event.target.value)}/></label></>}
 {mode==='delete_account'&&<><p role="alert">{t('This permanently deletes your account and financial records. Download a backup first. This cannot be undone.')}</p><a href="/api/backup">{t('Download complete backup')}</a><label>{t('Type DELETE to confirm')}<Input value={confirmation} onChange={event=>setConfirmation(event.target.value)} required pattern="DELETE"/></label></>}
 </fieldset>{mode==='delete_account'&&!capabilities.deletion&&<p role="status">{t('Account deletion is awaiting server setup.')}</p>}<Button variant={mode==='delete_account'?'destructive':'default'} disabled={busy||(needsPassword&&password!==repeat)||(mode==='delete_account'&&(!capabilities.deletion||confirmation!=='DELETE'||(!current&&!capabilities.phoneOnly)))}>{t(busy?'Saving…':mode==='change_password'?'Change password':mode==='delete_account'?'Permanently delete account':'Continue')}</Button>
 {mode==='delete_account'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setMode('change_password');setCurrent('');setConfirmation('');setError('');}}>{t('Cancel')}</Button>}
 </form>{mode!=='delete_account'&&<div className="account-danger-zone mt-6 border-t border-destructive/30 pt-6"><h3 className="font-semibold negative">{t('Permanently delete account')}</h3><p className="my-3 text-sm text-muted-foreground">{t('This permanently deletes your account and financial records. Download a backup first. This cannot be undone.')}</p><Button type="button" variant="destructive" disabled={busy} onClick={()=>{setMode('delete_account');setCurrent('');setPassword('');setRepeat('');setConfirmation('');setError('');}}><Trash2 aria-hidden="true"/>{t('Delete account')}</Button></div>}<ErrorPopup message={error}/>
 </section>;
}
