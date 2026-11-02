import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadTS} from './helpers/load-ts.mjs';

// Each lazily loaded part must name the export its module really has, or it renders nothing when it is first opened.
test('the shell and dialog parts load on demand, each from its own module and export',async()=>{
 const loaders=[],modules={
  '@/components/landing-page':'LandingPage','@/components/sign-in-screen':'SignInScreen','@/components/onboarding-screen':'OnboardingScreen','@/components/telegram-panel':'TelegramPanel',
  '@/components/record-dialog':'RecordDialog','@/components/transaction-details-dialog':'TransactionDetailsDialog','@/components/mortgage-payment-dialog':'MortgagePaymentDialog',
  '@/components/transaction-tools-panel':'SplitTransactionDialog','@/components/business-setup-flow':'BusinessSetupFlow','@/components/household-panel':'JoinHouseholdDialog',
  '@/components/income-sources-panel':'IncomeSourceEditor','@/components/stop-schedule-dialog':'StopScheduleDialog',
  '@/components/transactions/rule-dialog':'RuleDialog','@/components/delete-category-dialog':'DeleteCategoryDialog','@/components/edit-category-dialog':'EditCategoryDialog',
 };
 const overrides={'next/dynamic':{default:(load,options)=>{loaders.push({load,options});return {load};},__esModule:true}};
 for(const [path,name] of Object.entries(modules))overrides[path]={[name]:{component:name}};
 const lazy=loadTS('components/workspace/workspace-lazy.tsx',overrides);
 assert.deepEqual(Object.keys(lazy).sort(),Object.values(modules).sort());
 for(const name of Object.values(modules))assert.deepEqual(await lazy[name].load(),{component:name},name);
 // The public pages keep their server rendering; everything else renders only in the browser.
 const serverRendered=loaders.filter(({options})=>options?.ssr!==false).length;
 assert.equal(serverRendered,2);
});

// Every screen's own lazy file: each part resolves to a module that really exports it, and loads that export.
for(const file of ['components/planning/accounts/accounts-lazy.tsx','components/planning/goals-lazy.tsx','components/budget/budget-lazy.tsx','components/transactions/lazy.tsx'])
 test(`${file} names each part's real module and export`,async()=>{
  const source=fs.readFileSync(file,'utf8'),parts=[...source.matchAll(/import\('([^']+)'\)\.then\(module => module\.(\w+)\)/g)].map(match=>({from:match[1],name:match[2]}));
  assert.ok(parts.length>1);
  const overrides={'next/dynamic':{default:load=>({load}),__esModule:true}};
  for(const {from,name} of parts){
   const target=from.startsWith('@/')?from.slice(2):path.join(path.dirname(file),from);
   assert.match(fs.readFileSync(target+'.tsx','utf8'),new RegExp(`export (async )?(function|const) ${name}\\b`),name);
   overrides[from]={...overrides[from],[name]:{component:name}};
  }
  const lazy=loadTS(file,overrides);
  for(const {name} of parts)if(lazy[name])assert.deepEqual(await lazy[name].load(),{component:name},name);
 });
