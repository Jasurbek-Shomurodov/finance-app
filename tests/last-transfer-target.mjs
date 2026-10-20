import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {lastTransferTarget}=loadTS('lib/asset-movements.ts');

const account=(id,kind='Cash')=>({id,name:id,kind,currency:'USD',amount:100,frequency:'Once',date:'2026-01-01',notes:'',quantity:1,cost:0,rate:0});
const records=[account('checking'),account('savings'),account('cd','Deposit'),account('btc','Crypto')];
const move=(source_id,target_id,occurred_on,kind='transfer')=>({kind,source_id,target_id,occurred_on});

test('Transfer money opens on the account a source last sent money to',()=>{
 const movements=[move('checking','cd','2026-08-01'),move('checking','savings','2026-10-01'),move('savings','checking','2026-10-15'),move('checking','btc','2026-10-18','buy')];
 assert.equal(lastTransferTarget(movements,'checking',records),'savings','the newest transfer, not a purchase');
 assert.equal(lastTransferTarget(movements,'savings',records),'checking');
 assert.equal(lastTransferTarget(movements,'cd',records),undefined,'nothing sent yet');
 assert.equal(lastTransferTarget(movements,undefined,records),undefined);
 assert.equal(lastTransferTarget([move('checking','gone','2026-10-01')],'checking',records),undefined,'an account that no longer exists is not offered');
});

test('the dashboard asks Recurring to pay one due date through its address, and only a well-formed one counts',()=>{
 const {payLink,payRequest}=loadTS('lib/recurring.ts');
 assert.equal(payLink('demo-gym','2026-10-20'),'/upcoming#pay=demo-gym:2026-10-20');
 assert.deepEqual(payRequest('#pay=demo-gym:2026-10-20'),{recordId:'demo-gym',date:'2026-10-20'});
 assert.deepEqual(payRequest(new URL('https://x.test'+payLink('a b','2026-01-31')).hash),{recordId:'a b',date:'2026-01-31'});
 for(const hash of ['','#forecast','#pay=gym','#pay=gym:20-10-2026','#pay=:2026-10-20'])assert.equal(payRequest(hash),null,hash);
});

test('a transfer read with its date under either name, or none, still finds the newest pair',()=>{
 const sample=[{kind:'transfer',source_id:'checking',target_id:'cd',date:'2026-09-01'},{kind:'transfer',source_id:'checking',target_id:'savings',date:'2026-10-01'},{kind:'transfer',source_id:'checking',target_id:'cd'}];
 assert.equal(lastTransferTarget(sample,'checking',records),'savings','the sample workspace keeps `date`; an undated one sorts last');
 assert.equal(lastTransferTarget([{kind:'transfer',source_id:'checking',target_id:'cd'},{kind:'transfer',source_id:'checking',target_id:'savings'}],'checking',records),'cd','undated ones keep their order');
});
