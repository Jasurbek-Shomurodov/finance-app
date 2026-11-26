import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`17200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,stranger]=[1,2].map(id);
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/172_reconciliation_states.sql','utf8');
const auth=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${stranger}');`;
const as=(d,user)=>d.exec(`RESET ROLE;SET request.jwt.claim.sub='${user}';SET request.headers='{}';SET ROLE authenticated;`);
async function db(sql){const d=new PGlite();await d.exec(auth);await d.exec(sql);await as(d,owner);return d;}
const cash=(d,n,amount)=>d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Wallet','Cash','USD',$3,'2020-01-01','2020-01-01')",[id(n),owner,amount]);
const spend=(d,n,amount,day,name='Lunch')=>d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,account_id) VALUES($1,$2,$3,'Other expense','USD',$4,$5,$6)",[id(n),owner,name,amount,day,id(10)]);
const review=async(d,from=null,to=null)=>(await d.query('SELECT statement_review($1,$2,$3) AS s',[id(10),from,to])).rows[0].s;
const status=async d=>(await d.query('SELECT reconciliation_status() AS s')).rows[0].s.find(s=>s.account_id===id(10));
const save=(d,data)=>d.query('SELECT save_account_reconciliation($1) AS s',[data]);
const amount=(d,n)=>d.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)]).then(r=>Number(r.rows[0].amount));

// January 2020: the wallet held 1,000 and paid 10 and 20. The bank's statement for January closes at 970.
async function january(d){
 await cash(d,10,1000);await spend(d,11,10,'2020-01-05');await spend(d,12,20,'2020-01-20','Taxi');
 const state=await review(d,'2020-01-01','2020-01-31');
 await save(d,{id:id(20),account_id:id(10),start_date:'2020-01-01',end_date:'2020-01-31',opening_balance:1000,closing_balance:970,cleared:state.entries.map(e=>e.key),fingerprint:state.fingerprint,status:'reconciled',revision:null});
 return state;
}

test('migration 172 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 172');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,172);}finally{await d.close();}
});

test('a reconciled statement stays matched through later payments and balance edits',async()=>{
 const d=await db(setup);
 try{
  const state=await january(d);
  assert.equal(state.entries.length,2);
  assert.deepEqual(await status(d),{account_id:id(10),name:'Wallet',end_date:'2020-01-31',valid:true});
  // A February payment and a direct edit of the balance leave January's statement alone (066 reopened it).
  await spend(d,13,5,'2020-02-03','Coffee');
  await d.query('UPDATE finance_records SET amount=amount+1 WHERE id=$1',[id(10)]);
  assert.equal((await status(d)).valid,true);
  // A payment backdated into January but never ticked is pending, not a broken statement.
  await spend(d,14,7,'2020-01-25','Forgotten');
  assert.equal((await status(d)).valid,true);
  // Moving a reconciled payment inside the period is still the same statement.
  await d.query("UPDATE finance_records SET date='2020-01-21' WHERE id=$1",[id(12)]);
  assert.equal((await status(d)).valid,true);
 }finally{await d.close();}
});

test('editing, deleting or moving a reconciled entry out of the period reopens the statement and names the entry',async()=>{
 const d=await db(setup);
 try{
  await january(d);
  await d.query('UPDATE finance_records SET amount=25 WHERE id=$1',[id(12)]);
  assert.equal((await status(d)).valid,false);
  let changes=(await review(d)).changes[id(20)];
  assert.equal(changes.length,1);
  assert.deepEqual([changes[0].key,changes[0].name,Number(changes[0].was_amount),Number(changes[0].now_amount),changes[0].now_date],['record:'+id(12),'Taxi',-20,-25,'2020-01-20']);
  // Putting it back makes the statement match again.
  await d.query('UPDATE finance_records SET amount=20 WHERE id=$1',[id(12)]);
  assert.equal((await status(d)).valid,true);
  assert.deepEqual((await review(d)).changes,{});
  // Dated after the closing day, the entry no longer belongs to January's statement.
  await d.query("UPDATE finance_records SET date='2020-02-02' WHERE id=$1",[id(12)]);
  changes=(await review(d)).changes[id(20)];
  assert.deepEqual([changes[0].was_date,changes[0].now_date],['2020-01-20','2020-02-02']);
  // Deleted, it is gone: no current amount or date.
  await d.query("UPDATE finance_records SET date='2020-01-20' WHERE id=$1",[id(12)]);
  await d.query('DELETE FROM finance_records WHERE id=$1',[id(11)]);
  changes=(await review(d)).changes[id(20)];
  assert.deepEqual([changes[0].name,changes[0].now_amount,changes[0].now_date],['Lunch',null,null]);
  assert.equal((await status(d)).valid,false);
 }finally{await d.close();}
});

test('the next review starts the day after the last reconciled statement and opens at its closing balance',async()=>{
 const d=await db(setup);
 try{
  await january(d);
  await spend(d,13,5,'2020-02-03','Coffee');await spend(d,14,7,'2020-01-25','Forgotten');
  const next=await review(d,null,'2020-02-29');
  assert.deepEqual([next.from,next.to],['2020-02-01','2020-02-29']);
  assert.deepEqual(next.previous,{id:id(20),end_date:'2020-01-31',closing_balance:970});
  // The forgotten January payment was never in a statement, so it is not carried; February's coffee is offered.
  assert.deepEqual(next.entries.map(e=>e.name),['Coffee']);
  // The app balance worked back from today's: 1000 - 10 - 20 - 7 - 5 = 958 now, 963 before February.
  assert.equal(await amount(d,10),958);
  assert.deepEqual([Number(next.balance_before),Number(next.balance_at_end)],[963,958]);
  // With no reconciled statement before the closing day, the review opens on the first of its month.
  for(const to of ['2020-01-15','2020-01-31']){
   const first=await review(d,null,to);
   assert.deepEqual([first.from,first.previous],['2020-01-01',null],to);
  }
 }finally{await d.close();}
});

test('a transfer counts on both accounts, and a draft clears without reconciling',async()=>{
 const d=await db(setup);
 try{
  await cash(d,10,1000);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Savings','Cash','USD',0,'2020-01-01','2020-01-01')",[id(30),owner]);
  await d.query('SELECT record_asset_movement($1)',[{id:id(31),kind:'transfer',source_id:id(10),target_id:id(30),sent:100,received:99,source_value:100,target_value:99,fee:1,date:'2020-01-10',notes:''}]);
  const state=await review(d,'2020-01-01','2020-01-31');
  assert.deepEqual(state.entries.map(e=>[e.key,Number(e.amount)]),[['movement:'+id(31)+':out',-100]]);
  const target=(await d.query('SELECT statement_review($1,$2,$3) AS s',[id(30),'2020-01-01','2020-01-31'])).rows[0].s;
  assert.deepEqual(target.entries.map(e=>[e.key,Number(e.amount)]),[['movement:'+id(31)+':in',99]]);
  // A draft ticks the transfer as cleared; only a reconciled statement counts for the status.
  await save(d,{id:id(20),account_id:id(10),start_date:'2020-01-01',end_date:'2020-01-31',opening_balance:1000,closing_balance:950,cleared:state.entries.map(e=>e.key),fingerprint:state.fingerprint,status:'draft',revision:null});
  assert.deepEqual(await status(d),{account_id:id(10),name:'Wallet',end_date:null,valid:false});
  assert.equal((await review(d,null,'2020-01-31')).previous,null);
 }finally{await d.close();}
});

test('another owner reads nothing and cannot review the account',async()=>{
 const d=await db(setup);
 try{
  await january(d);
  await as(d,stranger);
  await assert.rejects(review(d),/your cash accounts/);
  assert.equal((await d.query('SELECT count(*)::integer AS n FROM account_reconciliation_changes($1)',[id(10)])).rows[0].n,0);
  assert.equal((await d.query('SELECT reconciliation_status() AS s')).rows[0].s.length,0);
  // The owner's edit, seen by the owner again, is reported; the stranger still sees nothing.
  await as(d,owner);await d.query('UPDATE finance_records SET amount=11 WHERE id=$1',[id(11)]);
  await as(d,stranger);
  assert.equal((await d.query('SELECT count(*)::integer AS n FROM account_reconciliation_changes($1)',[id(10)])).rows[0].n,0);
 }finally{await d.close();}
});
