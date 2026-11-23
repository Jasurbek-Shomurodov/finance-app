import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const {assetRecordKinds,lendingRecordKinds}=loadTS('lib/finance.ts');
const language={useLanguage:()=>({locale:'en-US',t:text=>text})};

function forms(overrides={}){
 const calls={editing:[],kinds:[],errors:[],assets:[]};
 const {recordForms}=loadTS('components/workspace/state/record-forms.ts');
 const api=recordForms({editable:()=>true,setError:e=>calls.errors.push(e),setRecordKinds:k=>calls.kinds.push(k),setEditing:e=>calls.editing.push(e),setDeleting:()=>{},setEditingIncomeSource:()=>{},currency:'EUR',section:'Assets & investments',cashFlowSection:false,preferredCurrencies:['EUR'],sources:[],storedRecord:r=>r,startAsset:preset=>calls.assets.push(preset),categories:[],removedKinds:[],...overrides});
 return {api,calls};
}

test('Add holding is the Add asset flow, started on the stock or coin inside its account; cash and deposits keep the account form',()=>{
 const accounts=[{id:'broker',kind:'Stock',currency:'EUR'},{id:'exchange',kind:'Crypto',currency:'JPY'}];
 const {api,calls}=forms({section:'Accounts',holdingAccounts:accounts});
 api.addAccountRecord('Stock','broker');api.addAccountRecord('Crypto','exchange');api.addAccountRecord('Stock');
 // The account's currency is used only while it is one of the preferred ones.
 assert.deepEqual(calls.assets,[{kind:'Stock',holdingAccountId:'broker',currency:'EUR'},{kind:'Crypto',holdingAccountId:'exchange',currency:undefined},{kind:'Stock',holdingAccountId:undefined,currency:undefined}]);
 assert.equal(calls.editing.length,0,'no record form opens for a holding');
 api.addAccountRecord('Deposit');
 assert.equal(calls.editing.at(-1).kind,'Deposit');assert.deepEqual(calls.kinds.at(-1),['Cash','Deposit']);
 const locked=forms({editable:()=>false});
 locked.api.addAccountRecord('Stock');locked.api.addRecord();
 assert.deepEqual([locked.calls.assets.length,locked.calls.editing.length],[0,0],'a read-only workspace opens nothing');
 assert.ok(assetRecordKinds.includes('Stock'));
});

test('a record added from Investments opens the Add asset flow, from Loans & debts a mortgage, elsewhere cash',()=>{
 const assets=forms();assets.api.addRecord();
 assert.deepEqual([assets.calls.assets,assets.calls.editing],[[undefined],[]]);
 const loans=forms({section:'Loans & debts'});loans.api.addRecord();
 assert.equal(loans.calls.editing.at(-1).kind,'Mortgage');assert.deepEqual(loans.calls.kinds.at(-1),lendingRecordKinds);
 const other=forms({section:'Accounts'});other.api.addRecord();
 assert.equal(other.calls.editing.at(-1).kind,'Cash');
});

test('recent categories show as chips only when there are two to choose from',()=>{
 const {RecentCategories}=loadTS('components/record-dialog/recent-categories.tsx',{'@/components/language-provider':language,'@/components/presentation-foundation/category-icon':{CategoryIcon:({kind})=>React.createElement('i',null,kind)}});
 const render=props=>renderToStaticMarkup(React.createElement(RecentCategories,{label:key=>key.toUpperCase(),onChoose:()=>{},...props}));
 assert.equal(render({keys:['Living expense'],value:'Living expense'}),'','one recent category is just the list');
 const html=render({keys:['Living expense','cafe'],value:'cafe'});
 assert.match(html,/role="group" aria-label="Category"/);
 assert.match(html,/aria-pressed="false"><i>Living expense<\/i>LIVING EXPENSE<\/button><button type="button" aria-pressed="true"><i>cafe<\/i>CAFE/);
 assert.match(render({keys:['a','b'],value:'a',disabled:true}),/disabled=""/);
});

test('the amount is the large figure when prominent, and a locked currency joins its label',()=>{
 const {AmountCurrencyFields}=loadTS('components/presentation-foundation/amount-currency-fields.tsx',{'@/components/language-provider':language,'@/components/presentation-foundation/formatted-number-input':{FormattedNumberInput:()=>React.createElement('input')},'@/components/presentation-foundation/currency-select':{CurrencySelect:({value})=>React.createElement('select',null,value)}});
 const render=props=>renderToStaticMarkup(React.createElement(AmountCurrencyFields,{amount:0,currency:'UZS',currencies:['UZS'],onAmountChange:()=>{},onCurrencyChange:()=>{},...props}));
 assert.match(render({prominent:true}),/^<div class="form-grid amount-currency-row is-prominent">/);
 assert.match(render({}),/^<div class="form-grid amount-currency-row">/);
 assert.match(render({currencyLocked:true}),/Amount · UZS<input\/><\/label><\/div>$/,'a locked currency has no picker');
});
