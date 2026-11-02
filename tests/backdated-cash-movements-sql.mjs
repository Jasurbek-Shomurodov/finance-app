import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('a loan can be dated before the cash account\'s latest balance, and the account stays right (migration 159)',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner=id(1);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES('${id(2)}','${owner}','Cash','Cash','USD',5000,'2020-01-01','2020-01-01'),('${id(3)}','${owner}','Club','Business','USD',40000,'2020-01-01',NULL);`);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const yesterday=(await db.query("SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date-1)::text AS day")).rows[0].day;
  const history=async()=>(await db.query('SELECT event_type,occurred_on::text AS day,amount::float8,balance::float8 FROM investment_history WHERE record_id=$1 ORDER BY occurred_on,created_at',[id(2)])).rows;
  const cash=async()=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(2)])).rows[0].amount);
  const lend=(n,day,amount)=>db.query('SELECT lend_from_account($1,$2)',[{id:id(n),name:'Borrower',kind:'Money lent',currency:'USD',amount,date:'2030-01-01',lent_date:day,frequency:'Once'},id(2)]);
  // A payment to the business dates a snapshot today, which refused every earlier loan.
  await db.query('SELECT record_investment_with_account($1,$2,$3,$4,$5,$6,$7,$8)',[id(10),id(3),'contribution',yesterday,1000,null,'',id(2)]);
  assert.equal(await cash(),4000);
  await lend(20,yesterday,1500);
  assert.equal(await cash(),2500);
  assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(20)])).rows[0].amount),1500);
  // The movement keeps its date and no balance; the newest snapshot is the real balance.
  const rows=await history();
  assert.deepEqual(rows.find(r=>r.event_type==='withdrawal'),{event_type:'withdrawal',day:yesterday,amount:1500,balance:null});
  assert.equal(rows.filter(r=>r.balance!==null).at(-1).balance,2500);
  assert.equal(rows.filter(r=>r.balance!==null).at(-1).day,today);
  // A retry moves nothing, and a date on or after the latest balance still snapshots on its own day.
  await lend(20,yesterday,1500);assert.equal(await cash(),2500);
  const before=(await history()).length;
  await lend(21,today,500);
  assert.equal(await cash(),2000);
  const after=await history();
  assert.equal(after.length,before+1);
  assert.deepEqual(after.at(-1),{event_type:'withdrawal',day:today,amount:500,balance:2000});
  // Funds are still checked against what the account holds now.
  await assert.rejects(lend(22,yesterday,2001),/Not enough money/);
  assert.equal(await cash(),2000);
  const version=(await db.query('SELECT finance_capabilities() AS value')).rows[0].value.schema_version;
  assert.ok(version>=159);
 }finally{await db.close();}
});
