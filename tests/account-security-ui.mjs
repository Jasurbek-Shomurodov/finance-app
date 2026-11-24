import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
function render(settings,deletion=false,mode,googleOnly=false){
 const {AccountAccessPanel}=loadTS('components/account-access-panel.tsx',{
  react:{...React,useEffect(){},useState(initial){return [initial==='change_password'&&mode?mode:initial,()=>{}];}},
  '@/hooks/use-owner-resource':{useSessionResource:()=>({data:{deletion,googleOnly}})},
  'next/navigation':{useRouter:()=>({})},
  'next/link':{__esModule:true,default:({children})=>React.createElement('a',null,children)},
  '@/components/language-provider':{useLanguage:()=>({t:(key,values={})=>key.replace(/\{(\w+)\}/g,(_,name)=>values[name]??name)})},
  'lucide-react':{Eye:()=>React.createElement('svg',{className:'eye'}),EyeOff:()=>React.createElement('svg',{className:'eye-off'}),MailCheck:()=>React.createElement('svg',{className:'mail'}),Trash2:()=>React.createElement('svg',{className:'bin'})},
  '@/components/ui/button':{Button:props=>React.createElement('button',props)},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
 });
 return renderToStaticMarkup(React.createElement(AccountAccessPanel,{settings}));
}
test('security settings always exposes permanent deletion and retains all password fields',()=>{
 const html=render(true);
 assert.equal((html.match(/<button/g)||[]).length,2);
 assert.ok(html.includes('Delete account</button>'));
 assert.ok(html.includes('This permanently deletes'));
 assert.ok(html.includes('Change password</button>'));
 assert.ok(!html.includes('Continue'));
 assert.equal((html.match(/type="password"/g)||[]).length,3);
});
test('an account with only Google to sign in with is told how to get the password these forms ask for',()=>{
 for(const mode of [undefined,'delete_account']){const html=render(true,true,mode,true);assert.ok(html.includes('You signed in with Google'),mode);assert.ok(html.includes('Forgot password?'),mode);assert.ok(html.includes('type="password"'),'the password stays required');}
 assert.ok(!render(true,true,undefined,false).includes('You signed in with Google'));
});
test('multiple account actions remain selectable when deletion is enabled',()=>{
 const html=render(true,true);
 assert.ok(html.includes('Delete account</button>'));
 assert.equal((html.match(/<button/g)||[]).length,2);
});
test('deletion requires credentials and explicit confirmation and offers cancellation',()=>{
 const html=render(true,true,'delete_account');
 assert.ok(html.includes('Type DELETE to confirm'));
 assert.ok(html.includes('pattern="DELETE"'));
 assert.ok(html.includes('type="password"'));
 assert.ok(html.includes('Download complete backup'));
 assert.ok(html.includes('Cancel</button>'));
 assert.ok(html.includes('disabled=""'));
 assert.ok(!html.includes('New password'));
 assert.ok(!html.includes('Account deletion is awaiting server setup.'));
});
test('unconfigured deletion stays visible but cannot submit',()=>{
 const html=render(true,false,'delete_account');
 assert.ok(html.includes('Account deletion is awaiting server setup.'));
 assert.ok(html.includes('<fieldset disabled=""'));
 assert.match(html, /<button[^>]*disabled=""[^>]*>Permanently delete account/);
 assert.ok(html.includes('Cancel</button>'));
});

function renderCard(intent,sent=''){
 // useState is called in a fixed order: email, then the new password's own three, busy, error, sent.
 const order=['email','password','repeat','left','busy','error','sent'];let call=0;
 const {AccountAccessCard}=loadTS('components/account-access-card.tsx',{
  react:{...React,useState(initial){const key=order[call++%order.length];return [key==='sent'?sent:initial,()=>{}];}},
  'next/link':{__esModule:true,default:({children})=>React.createElement('a',null,children)},
  '@/components/language-provider':{useLanguage:()=>({t:(key,values={})=>key.replace(/\{(\w+)\}/g,(_,name)=>values[name]??name)})},
  'lucide-react':{Eye:()=>React.createElement('svg',{className:'eye'}),EyeOff:()=>React.createElement('svg',{className:'eye-off'}),MailCheck:()=>React.createElement('svg',{className:'mail'}),Trash2:()=>React.createElement('svg',{className:'bin'})},
  '@/components/ui/button':{Button:props=>React.createElement('button',props)},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
  '@/components/presentation-foundation/error-popup':{ErrorPopup:()=>null},
  '@/components/theme-provider':{ThemeToggle:()=>null},
  '@/components/auth-card':{AuthPage:({title,children})=>React.createElement('main',null,React.createElement('h1',null,title),children),ProviderChoices:({children,footer})=>React.createElement('div',null,children,'[Google][Phone]',footer),SampleInvite:()=>React.createElement('aside',null,'[Sample workspace]')},
  './sign-in-screen.module.css':new Proxy({},{get:(_,key)=>String(key)}),
 });
 return renderToStaticMarkup(React.createElement(AccountAccessCard,{brand:null,intent}));
}
test('Create account is the sign-in card: Google, phone, the email form and a way to sign in, without the sample workspace',()=>{
 const signup=renderCard('signup');
 assert.ok(signup.includes('<h1>Create account</h1>'));
 assert.match(signup,/<\/form>\[Google\]\[Phone\]<p[^>]*>By creating an account/,'the email form comes first, then Google and phone, then the terms');
 assert.ok(!signup.includes('[Sample workspace]'));
 assert.ok(signup.includes('Already have an account? <a>Sign in</a>'));
 assert.ok(!signup.includes('Forgot password'));
 assert.equal((signup.match(/type="password"/g)||[]).length,2);
 assert.ok(signup.includes('type="email"'));
 assert.ok(signup.includes('unique password'));
 assert.ok(signup.includes('By creating an account, you agree'));
 assert.equal((signup.match(/<button/g)||[]).length,2,'the eye that shows both passwords, and the button');
 assert.match(signup,/aria-label="Show password"/);assert.match(signup,/<button[^>]*type="submit"[^>]*>Create account<\/button>/,'the button says what it does');
 // What is wrong is said under its field, never by a switched-off button or a browser bubble.
 const source=fs.readFileSync('components/new-password-fields.tsx','utf8')+fs.readFileSync('components/account-access-card.tsx','utf8');
 assert.match(source,/if \(short\) \{ onLeave\('password'\); passwordField\.current\?\.focus\(\); return false; \}/);
 assert.match(source,/if \(mismatch\) \{ onLeave\('repeat'\); repeatField\.current\?\.focus\(\); return false; \}/);
 assert.match(source,/if \(busy \|\| !next\.check\(\)\) return;/);
 assert.match(source,/<FieldError id="access-password-error"/);assert.match(source,/<FieldError id="access-repeat-error"/);
 assert.doesNotMatch(source,/minLength=|disabled=\{busy \|\|/);
});
test('Forgot password asks for the email alone, without providers, sign-up or the sample workspace',()=>{
 const html=renderCard('recover');
 assert.ok(html.includes('<h1>Forgot password</h1>'));
 assert.ok(!html.includes('Create account')&&!html.includes('[Google]')&&!html.includes('[Sample workspace]'));
 assert.ok(!html.includes('type="password"'));assert.ok(!html.includes('unique password'));
 assert.ok(html.includes('type="email"'));assert.ok(html.includes('<a>Back to sign in</a>'));
 assert.match(html,/<button[^>]*type="submit"[^>]*>Send reset link<\/button>/,'the button says what it does');
 // The email typed on sign-in comes along in the tab's own storage, never in the address, and is taken once.
 const store=new Map();globalThis.sessionStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 const {carryRecoverEmail,takeRecoverEmail,recoverPath}=loadTS('lib/sign-in-path.ts');
 carryRecoverEmail('  ');assert.equal(takeRecoverEmail(),'');carryRecoverEmail(' person@example.test ');assert.equal(takeRecoverEmail(),'person@example.test');assert.equal(takeRecoverEmail(),'');
 delete globalThis.sessionStorage;assert.equal(takeRecoverEmail(),'','no storage: the form starts empty');carryRecoverEmail('person@example.test');
 assert.ok(!recoverPath.includes('email'));
 assert.match(fs.readFileSync('components/sign-in-screen.tsx','utf8'),/<Link href=\{recoverPath\} onClick=\{event => carryRecoverEmail\(/);
 assert.match(fs.readFileSync('components/account-access-card.tsx','utf8'),/subtitle=\{signup \? undefined : 'Enter your email and we will send you a link to reset your password\.'\}/);
 assert.equal((html.match(/<button/g)||[]).length,1);
});
test('an emailed link lands in the sign-in card: a press uses it, a reset link then asks for the new password',()=>{
 const card=(tokenHash,step='verify')=>{
  const {EmailLinkCard}=loadTS('components/email-link-card.tsx',{
   react:{...React,useState(initial){return [initial==='verify'?step:initial,()=>{}];}},
   'next/link':{__esModule:true,default:({children,href})=>React.createElement('a',{href},children)},
   'next/navigation':{useRouter:()=>({})},
   '@/components/language-provider':{useLanguage:()=>({t:key=>key})},
   'lucide-react':{Eye:()=>null,EyeOff:()=>null},
   '@/components/ui/button':{Button:({asChild,children,...props})=>asChild?children:React.createElement('button',props,children)},
   '@/components/ui/input':{Input:props=>React.createElement('input',props)},
   '@/components/presentation-foundation/error-popup':{ErrorPopup:()=>null},
   '@/components/theme-provider':{ThemeToggle:()=>null},
   '@/components/auth-card':{AuthPage:({title,subtitle,children})=>React.createElement('main',null,React.createElement('h1',null,title),subtitle&&React.createElement('p',null,subtitle),children)},
   './sign-in-screen.module.css':new Proxy({},{get:(_,key)=>String(key)}),
  });
  return renderToStaticMarkup(React.createElement(EmailLinkCard,{brand:null,tokenHash,tokenType:'recovery'}));
 };
 const verify=card('a'.repeat(40));
 assert.ok(verify.includes('<h1>Account access</h1>'));assert.ok(verify.includes('Links expire and can only be used once.'));
 assert.match(verify,/<button[^>]*type="submit"[^>]*>Verify email link<\/button>/);assert.ok(!verify.includes('type="password"'),'no password is asked before the link is used');
 const reset=card('a'.repeat(40),'reset');
 assert.ok(reset.includes('<h1>Change password</h1>'));assert.equal((reset.match(/type="password"/g)||[]).length,2);
 assert.ok(reset.includes('aria-label="Show password"'));assert.ok(reset.includes('Use a unique password with at least 8 characters.'));
 assert.match(reset,/<button[^>]*type="submit"[^>]*>Change password<\/button>/);
 const missing=card('');
 assert.ok(missing.includes('This link is invalid or expired. Request a new email.'));assert.ok(missing.includes('href="/auth/access?mode=recover"'));assert.ok(!missing.includes('<form'),'nothing to press without a link');
 for(const html of [verify,reset,missing])assert.ok(html.includes('href="/sign-in"'),'a way back to sign in');
 const source=fs.readFileSync('components/email-link-card.tsx','utf8');
 assert.match(source,/if \(step === 'reset'\) \{ next\.clear\(\); router\.replace\(signInPath\); \}/,'a changed password goes to sign in with it');
 assert.match(fs.readFileSync('app/auth/confirm/page.tsx','utf8'),/<EmailLinkCard brand=\{<Brand\/>\} tokenHash=\{query\.get\('token_hash'\)\?\?''\}/);
 const english=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));
 for(const [,key] of source.matchAll(/(?:t\(|title=|subtitle=\{reset \? undefined : )'([^']+)'/g))assert.ok(english[key],`translated: ${key}`);
});
test('the sign-in links open the matching account page',()=>{
 const source=fs.readFileSync('components/sign-in-screen.tsx','utf8');
 assert.match(source,/<Link href=\{recoverPath\}[^>]*>.*\{t\('Forgot password\?'\)\}/);
 assert.match(source,/<Link href=\{signUpPath\}>\{t\('Create an account'\)/);
 const {recoverPath,signUpPath}=loadTS('lib/sign-in-path.ts');
 assert.equal(recoverPath,'/auth/access?mode=recover');assert.equal(signUpPath,'/auth/access?mode=signup');
 const page=fs.readFileSync('app/auth/access/page.tsx','utf8');
 assert.match(page,/intent=\{query\.get\('mode'\)==='signup'\?'signup':'recover'\}/);
});

test('after sign-up the form gives way to a Check your email screen with the address, a spam note and a way back',()=>{
 const html=renderCard('signup','new@example.com');
 assert.ok(html.includes('<h1>Check your email</h1>'));
 assert.ok(html.includes('We sent a confirmation link to new@example.com. Press it to finish creating your account.'));
 assert.ok(html.includes('check your spam or junk folder'));
 assert.ok(html.includes('Use a different email</button>'));
 assert.ok(html.includes('Back to sign in'));
 assert.ok(!html.includes('<form'));
 assert.ok(!html.includes('type="password"'));
});
test('recovery reveals nothing about whether the account exists',()=>{
 const html=renderCard('recover','someone@example.com');
 assert.ok(html.includes('If an account exists for someone@example.com, we sent a link to reset your password.'));
 assert.ok(!html.includes('<form'));
});
test('results are shown as popups, never as inline text, and the cards are translated',()=>{
 for(const file of ['components/account-access-panel.tsx','components/account-access-card.tsx']){
  const source=fs.readFileSync(file,'utf8');
  assert.ok(source.includes('showNotice(result.message)'),file);
  for(const language of ['en','ru','uz']){
   const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));
   for(const [,,key] of source.matchAll(/\bt\((["'])((?:(?!\1).)+)\1[,)]/g))assert.ok(labels[key],`${language}: ${key}`);
  }
 }
 for(const language of ['en','ru','uz']){
  const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));
  for(const key of ['We sent a confirmation link to {email}. Press it to finish creating your account.','If an account exists for {email}, we sent a link to reset your password.'])assert.ok(labels[key].includes('{email}'),`${language}: ${key}`);
  for(const key of ['or continue with','Already have an account?','Search countries','No matching countries.','Country code'])assert.ok(labels[key],`${language}: ${key}`);
 }
});

test('settings for a phone-only account offers adding an email and password, and deleting the account without one',()=>{
 const render=mode=>{
  const {AccountAccessPanel}=loadTS('components/account-access-panel.tsx',{
   react:{...React,useEffect(){},useState(initial){return [initial==='change_password'?mode:initial===null?null:initial,()=>{}];}},
   '@/hooks/use-owner-resource':{useSessionResource:()=>({data:{phoneOnly:true,deletion:true}})},
   'next/navigation':{useRouter:()=>({})},
   'next/link':{__esModule:true,default:({children})=>React.createElement('a',null,children)},
   '@/components/language-provider':{useLanguage:()=>({t:key=>key})},
   '@/components/ui/button':{Button:props=>React.createElement('button',props)},
   '@/components/ui/input':{Input:props=>React.createElement('input',props)},
   'lucide-react':{MailCheck:()=>null,Trash2:()=>null},
  });
  return renderToStaticMarkup(React.createElement(AccountAccessPanel,{settings:true}));
 };
 const html=render('change_password');
 assert.ok(html.includes('<h2>Add an email and password</h2>'));
 assert.ok(html.includes('Your account was created with a phone number. Add an email and password to sign in with them too.'));
 assert.ok(html.includes('type="email"'));assert.equal((html.match(/type="password"/g)||[]).length,2);
 assert.ok(html.includes('Permanently delete account'));assert.ok(!html.includes('Current password'));assert.ok(!html.includes('Change password'));
 // Deleting asks only for DELETE: the account never had a password.
 const deleting=render('delete_account');
 assert.ok(deleting.includes('Type DELETE to confirm'));assert.ok(!deleting.includes('Current password'));assert.equal((deleting.match(/type="password"/g)||[]).length,0);
});

test('the account pages pair the card with the real app in its sample workspace',()=>{
 const card=fs.readFileSync('components/auth-card.tsx','utf8'),showcase=fs.readFileSync('components/auth-showcase.tsx','utf8');
 const english=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));
 assert.match(card,/<div className=\{styles\.formSide\}>[\s\S]*<\/div>\n    <AuthShowcase\/>/,'one frame for sign-in, create account and forgot password');
 assert.match(showcase,/<AppPreview tour=\{showcaseTour\} size=\{showcaseSize\}\/>/,'the panel shows the app itself, not a drawing of it');
 // Nothing beside it is drawn by hand: the app's own charts are in the window, laid out wide enough that the
 // dashboard sets its net worth chart first, and the features that set the app apart follow.
 assert.match(showcase,/AppPreview[\s\S]*className=\{styles\.features\}/);assert.doesNotMatch(showcase,/<svg|<path/);
 assert.match(showcase,/showcaseTour = \['\/',/,'the dashboard opens the tour');
 const {width}=Function(`return ${showcase.match(/showcaseSize = (\{[^}]*\})/)[1]}`)();assert.ok(width>=1280,'wide enough for the chart beside the tiles');
 assert.doesNotMatch(showcase,/toLocaleString|toFixed|Intl\./);
 for(const key of [...showcase.matchAll(/label: '([^']+)'/g)].map(match=>match[1]).filter(key=>!key.includes('·')))assert.ok(english[key],`translated: ${key}`);
 for(const key of [...showcase.matchAll(/t\('([^']+)'\)/g)].map(match=>match[1]))assert.ok(english[key],`translated: ${key}`);
 const css=fs.readFileSync('components/sign-in-screen.module.css','utf8');
 assert.match(css,/@media\(max-width:959px\)\{[\s\S]*?\.showcase\{order:2;[^}]*background:none/,'narrow windows show the app below the card, on the page');assert.match(css,/@media\(max-width:599px\)\{[\s\S]*?\.showcase\{display:none\}/,'phones keep only the card');
});
