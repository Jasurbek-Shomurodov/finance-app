import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// Each lazily loaded part must name the export its module really has, or it renders nothing when it is first opened.
test('the shell and dialog parts load on demand, each from its own module and export',async()=>{
 const loaders=[],modules={
  '@/components/landing-page':'LandingPage','@/components/sign-in-screen':'SignInScreen','@/components/onboarding-screen':'OnboardingScreen','@/components/telegram-panel':'TelegramPanel',
  '@/components/record-dialog':'RecordDialog','@/components/transaction-details-dialog':'TransactionDetailsDialog','@/components/mortgage-payment-dialog':'MortgagePaymentDialog',
  '@/components/transaction-tools-panel':'SplitTransactionDialog','@/components/business-setup-flow':'BusinessSetupFlow','@/components/household-panel':'JoinHouseholdDialog',
  '@/components/income-sources-panel':'IncomeSourceEditor','@/components/stop-schedule-dialog':'StopScheduleDialog',
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
