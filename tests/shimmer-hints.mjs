import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// What a drawer tap's shimmer knows before the destination's records arrive (lib/shimmer-hints.ts).
const {shimmerHints}=await loadTS('lib/shimmer-hints.ts');
const workspace={loading:false,records:[],goals:[],shared:false,businesses:0};

test('while records load only what is known before them is told: ⋯ on Accounts', () => {
 assert.deepEqual(shimmerHints({...workspace,loading:true}),{accountsMenu:false});
 assert.deepEqual(shimmerHints({...workspace,loading:true,shared:true}),{accountsMenu:true});
});

test('Loans draws its side column only while a debt is owed', () => {
 assert.equal(shimmerHints(workspace).debts,false);
 assert.equal(shimmerHints({...workspace,records:[{kind:'Loan',amount:0}]}).debts,false,'a paid-off loan owes nothing');
 assert.equal(shimmerHints({...workspace,records:[{kind:'Loan',amount:5000}]}).debts,true);
 assert.equal(shimmerHints({...workspace,records:[{kind:'Cash',amount:5000}]}).debts,false);
});

test('Goals is its empty state when no active goal exists; archived goals do not count', () => {
 assert.equal(shimmerHints(workspace).goals,false);
 assert.equal(shimmerHints({...workspace,goals:[{archived:true}]}).goals,false);
 assert.equal(shimmerHints({...workspace,goals:[{archived:false},{archived:true}]}).goals,true);
});

test('Accounts opens with ⋯ for a shared workspace or any business, never otherwise', () => {
 assert.equal(shimmerHints(workspace).accountsMenu,false);
 assert.equal(shimmerHints({...workspace,shared:true}).accountsMenu,true);
 assert.equal(shimmerHints({...workspace,businesses:2}).accountsMenu,true);
});

test('Investments draws as many account cards, allocation rows and asset cards as Holdings will, capped at a screen', () => {
 const record=(kind,extra={})=>({kind,amount:100,...extra});
 assert.deepEqual(shimmerHints(workspace).investments,{accounts:0,kinds:0,assets:0},'an empty workspace: no accounts line, no cards');
 const records=[record('Cash',{is_investment:true}),record('Cash'),record('Stock',{holding_account_id:'broker'}),record('Crypto'),record('Property'),record('Loan')];
 assert.deepEqual(shimmerHints({...workspace,records,holdingAccounts:[{id:'broker',kind:'Stock'}]}).investments,{accounts:2,kinds:4,assets:2},'a share held in an account is that account\'s card; an everyday cash account is not an investment');
 const many=Array.from({length:9},(_,index)=>record(['Stock','Crypto','Property','Valuables','Business','Metal','Deposit'][index%7]));
 const hint=shimmerHints({...workspace,records:many}).investments;
 assert.ok(hint.accounts<=3&&hint.kinds<=6&&hint.assets<=6);
 assert.equal(shimmerHints({...workspace,loading:true}).investments,undefined,'unknown while records load');
});
