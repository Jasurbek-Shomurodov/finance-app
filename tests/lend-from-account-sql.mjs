import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`74000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/121_lend_from_account.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);return d;}
const lentDay=async d=>(await d.query("SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date-3)::text AS day")).rows[0].day;
const amount=async(d,n)=>{const row=(await d.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0];return row?Number(row.amount):null;};
// Abror borrows 600,000 UZS, paid out of the UZS wallet three days ago.
async function lend(d,extra={}){
 const lentOn=await lentDay(d);
 const record={id:id(20),name:'Abror',kind:'Money lent',currency:'UZS',amount:600000,quantity:1,cost:0,rate:0,date:null,lent_date:lentOn,frequency:'Once',notes:'',...extra};
 return d.query('SELECT lend_from_account($1::jsonb,$2) AS saved',[JSON.stringify(record),id(10)]);
}
async function workspace(d,wallet=1000000){
 await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'UZS wallet','Cash','UZS',$3,'2026-01-01','2026-01-01')",[id(10),id(1),wallet]);
 await d.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
}

test('migration 121 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 121');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);}finally{await d.close();}
});

test('money lent from an account leaves it, once, and the loan starts on its lent date',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  const saved=(await lend(d)).rows[0].saved;
  assert.equal(Number(saved[0].amount),600000);
  assert.deepEqual([await amount(d,10),await amount(d,20)],[400000,600000]);
  const history=(await d.query("SELECT event_type,occurred_on::text AS day,amount,balance FROM investment_history WHERE record_id=$1 ORDER BY occurred_on,created_at",[id(20)])).rows.map(row=>[row.event_type,row.day,Number(row.amount),Number(row.balance)]);
  const lentOn=await lentDay(d);
  assert.deepEqual(history.at(-1),['contribution',lentOn,600000,600000]);
  assert.ok(history.every(([,day])=>day===lentOn));
  // A retry after a lost response moves no more cash.
  await lend(d);
  assert.deepEqual([await amount(d,10),await amount(d,20)],[400000,600000]);
  await assert.rejects(lend(d,{amount:700000}),/already saved with different details/);
 }finally{await d.close();}
});

test('a loan larger than the account balance is refused and nothing is saved',async()=>{
 const d=await db(setup);
 try{
  await workspace(d,500000);
  await assert.rejects(lend(d),/Not enough money in the selected cash account/);
  assert.deepEqual([await amount(d,10),await amount(d,20)],[500000,null]);
  await assert.rejects(lend(d,{currency:'USD'}),/Choose a cash account in the record currency/);
  assert.equal(await amount(d,20),null);
 }finally{await d.close();}
});

const across=fs.readFileSync('migrations/170_lend_across_currencies.sql','utf8');
// Umurzoq borrows 1,300,000 UZS, handed over from a USD wallet at 12,000 UZS a dollar.
async function lendAcross(d,{rate=12000,currency='UZS',amount=1300000}={}){
 const lentOn=await lentDay(d);
 const record={id:id(30),name:'Umurzoq',kind:'Money lent',currency,amount,quantity:1,cost:0,rate:0,date:null,lent_date:lentOn,frequency:'Once',notes:''};
 return d.query('SELECT lend_from_account($1::jsonb,$2,$3,$4::date,$5,$6) AS saved',[JSON.stringify(record),id(11),rate,lentOn,'USD',currency]);
}
async function dollars(d,amount=1176){
 await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Cash','Cash','USD',$3,'2026-01-01','2026-01-01')",[id(11),id(1),amount]);
 await d.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
}

test('migration 170 is in setup.sql, moves the schema version and is safe to re-run',async()=>{
 assert.ok(setup.includes(across),'setup.sql includes migration 170');
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 173/);
 const d=await db(setup.slice(0,setup.indexOf(across)));
 try{await d.exec(across);await d.exec(across);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,170);}finally{await d.close();}
});

test('money lent in UZS from a USD account keeps its own amount and takes the converted dollars, once',async()=>{
 const d=await db(setup);
 try{
  await dollars(d);
  const saved=(await lendAcross(d)).rows[0].saved;
  assert.equal(Number(saved[0].amount),1300000);
  assert.equal(saved[0].currency,'UZS');
  assert.equal(await amount(d,30),1300000);
  assert.ok(Math.abs(await amount(d,11)-(1176-1300000/12000))<1e-9);
  const link=(await d.query('SELECT exchange_rate,account_currency,record_currency FROM investment_account_links WHERE id=$1',[id(30)])).rows[0];
  assert.deepEqual([Number(link.exchange_rate),link.account_currency,link.record_currency],[12000,'USD','UZS']);
  // A retry after a lost response moves no more cash; a different rate is refused.
  await lendAcross(d);
  assert.ok(Math.abs(await amount(d,11)-(1176-1300000/12000))<1e-9);
  await assert.rejects(lendAcross(d,{rate:11000}),/already saved with different details/);
 }finally{await d.close();}
});

test('money lent across currencies beyond the balance, or with a mismatched currency, saves nothing',async()=>{
 const d=await db(setup);
 try{
  await dollars(d,100);
  await assert.rejects(lendAcross(d),/Not enough money in the selected cash account/);
  assert.deepEqual([await amount(d,11),await amount(d,30)],[100,null]);
  // The account's currency must be the one the rate was quoted for.
  const lentOn=await lentDay(d),record={id:id(30),name:'Umurzoq',kind:'Money lent',currency:'UZS',amount:600000,quantity:1,cost:0,rate:0,date:null,lent_date:lentOn,frequency:'Once',notes:''};
  await assert.rejects(d.query('SELECT lend_from_account($1::jsonb,$2,$3,$4::date,$5,$6)',[JSON.stringify(record),id(11),12000,lentOn,'EUR','UZS']),/Check the dated exchange rate/);
  await assert.rejects(d.query('SELECT lend_from_account($1::jsonb,$2,$3,$4::date,$5,$6)',[JSON.stringify(record),id(11),12000,lentOn,'USD','EUR']),/Check the record fields/);
  assert.equal(await amount(d,30),null);
 }finally{await d.close();}
});
