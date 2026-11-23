import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`16800000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,stranger,viewer,member]=[1,2,3,4].map(id);
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/168_close_accounts.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
async function database(sql=setup){
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${stranger}'),('${viewer}'),('${member}');`);
 await db.exec(sql);
 return db;
}
const kit=db=>{
 const rows=(sql,params=[])=>db.query(sql,params).then(result=>result.rows);
 return {
  rows,
  /** Rows the app never writes directly (a goal), put in place as the database owner; the session then continues as `user`. */
  seed:(sql,user=owner)=>db.exec(`RESET ROLE;${sql};SET request.jwt.claim.sub='${user}';SET request.headers='{}';SET ROLE authenticated;`),
  as:(user,workspace=null)=>db.exec(`RESET ROLE;SET request.jwt.claim.sub='${user}';SET request.headers='${JSON.stringify(workspace?{'x-workspace-owner':workspace}:{})}';SET ROLE authenticated;`),
  add:(n,kind,amount,extra={})=>db.query('SELECT public.save_finance_record($1::jsonb)',[{id:id(n),name:kind+' '+n,kind,currency:'USD',amount,date:'2026-01-01',...extra}]),
  record:async n=>(await rows('SELECT * FROM finance_records WHERE id=$1',[id(n)]))[0],
  history:n=>rows('SELECT * FROM investment_history WHERE record_id=$1 ORDER BY occurred_on,created_at,id',[id(n)]),
  remove:n=>db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(n)]),
  restoreAll:async()=>{for(const item of await rows('SELECT id FROM deleted_items ORDER BY deleted_at'))await db.query('SELECT restore_deleted_item($1)',[item.id]);},
  blockers:async n=>(await rows('SELECT public.record_delete_blockers($1) AS b',[id(n)]))[0].b,
  close:(n,day=null)=>db.query('SELECT public.close_finance_record($1,$2)',[id(n),day]),
  reopen:n=>db.query('SELECT public.reopen_finance_record($1)',[id(n)]),
  today:async()=>(await rows("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day"))[0].day,
 };
};
const functions=db=>db.query(`SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid::regprocedure::text)) AS sum FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'`).then(r=>r.rows[0].sum);

test('migration 168 is in setup.sql, moves the schema version, changes no existing row and is safe to re-run',{skip},async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 168');
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 168/);
 const db=await database(setup.slice(0,setup.indexOf(migration)));
 const {rows,as,add}=kit(db);
 try{
  // A workspace from before the migration: accounts with history, an investment account, a snapshot, a deleted record.
  await as(owner);
  await add(10,'Cash',500);await add(11,'Stock',50,{quantity:4});await add(12,'Cash',5);
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(12)]);
  await db.exec(`RESET ROLE;INSERT INTO holding_accounts(id,user_id,name,kind,currency) VALUES('${id(20)}','${owner}','Broker','Stock','USD');INSERT INTO portfolio_snapshots(user_id,occurred_on,assets,debt,rates) VALUES('${owner}','2026-01-02',700,0,'{"USD":1}');`);
  const tables=['finance_records','investment_history','holding_accounts','portfolio_snapshots','deleted_items'];
  const state=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await rows(`SELECT to_jsonb(t)-'closed_on'-'parts'-'snapshot_changes' AS row FROM ${table} t ORDER BY 1`)).map(row=>row.row)])));
  const before=await state();
  await db.exec(migration);
  const once=await functions(db);
  await db.exec(migration);
  assert.equal(await functions(db),once,'a second run leaves every function as it was');
  assert.deepEqual(await state(),before,'no existing row is rewritten');
  assert.equal((await rows('SELECT public.finance_capabilities() AS c'))[0].c.schema_version,168);
  assert.deepEqual(await rows('SELECT count(*)::int AS n FROM finance_records WHERE closed_on IS NOT NULL'),[{n:0}]);
  assert.deepEqual(await rows('SELECT count(*)::int AS n FROM holding_accounts WHERE closed_on IS NOT NULL'),[{n:0}]);
  assert.deepEqual(await rows('SELECT parts FROM portfolio_snapshots'),[{parts:null}]);
  assert.deepEqual(await rows('SELECT snapshot_changes FROM deleted_items'),[{snapshot_changes:[]}]);
  assert.equal((await rows("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('guard_closed_record','guard_closed_holding_account')"))[0].n,2);
  // The record deleted before the migration still restores.
  await as(owner);
  await kit(db).restoreAll();
  assert.equal(Number((await kit(db).record(12)).amount),5);
 }finally{await db.close();}
});

test('an account with only its own balance history is deleted and restored whole; anything that still points at it is named',{skip},async()=>{
 const db=await database();
 const {rows,as,seed,add,record,history,remove,restoreAll,blockers}=kit(db);
 try{
  await as(owner);
  const today=await kit(db).today();
  await add(10,'Cash',1000);await add(11,'Cash',200);await add(12,'Stock',100,{quantity:10,cost:900});await add(13,'Property',90000);
  // A transaction moves the cash account and leaves a balance snapshot behind.
  await add(30,'Living expense',40,{date:today,account_id:id(10)});
  assert.deepEqual(await blockers(10),['transactions']);
  const refused=await remove(10).catch(error=>error);
  assert.match(refused.message,/still has linked items\. Delete or move them first, or close it instead/);
  assert.equal(refused.detail,'transactions','the refusal names what is linked');
  assert.equal((await rows('SELECT count(*)::int AS n FROM deleted_items'))[0].n,0,'a refused delete archives nothing');
  // Once the transaction is gone for good, the snapshots it left no longer hold the account.
  await remove(30);
  await db.query('SELECT public.permanently_delete_item(id) FROM deleted_items');
  assert.deepEqual(await blockers(10),[]);
  const cashBefore=await record(10),cashHistory=await history(10);
  assert.ok(cashHistory.some(event=>event.event_type==='valuation'),'the account kept automatic balance snapshots');
  await remove(10);
  assert.equal(await record(10),undefined);assert.deepEqual(await history(10),[]);
  await restoreAll();
  assert.deepEqual(await record(10),cashBefore);assert.deepEqual(await history(10),cashHistory,'its history returns exactly');
  // A holding that was repriced and bought more of from its own Tracker.
  await db.query('SELECT public.save_finance_record($1::jsonb,$2)',[{id:id(12),name:'Stock 12',kind:'Stock',currency:'USD',amount:120,quantity:10,cost:900,date:'2026-01-01'},(await record(12)).revision]);
  // A property valued again and added to from its own Tracker, with no account behind the money.
  await add(14,'Property',50000);
  await db.query('SELECT public.record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(40),id(14),'valuation',today,0,52000,'']);
  await db.query('SELECT public.record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(43),id(14),'contribution',today,300,null,'']);
  for(const n of [12,14]){
   const kept=await record(n),events=await history(n);
   assert.ok(events.length>=2,'history beyond the opening balance');
   assert.deepEqual(await blockers(n),[]);
   await remove(n);
   assert.equal(await record(n),undefined);assert.deepEqual(await history(n),[]);
   await restoreAll();
   assert.deepEqual(await record(n),kept);assert.deepEqual(await history(n),events);
  }
  // Transfers, goals and payments from another account are named; the owner's answer is the stranger's empty one.
  await db.query('SELECT public.record_asset_movement($1)',[{id:id(41),kind:'transfer',source_id:id(10),target_id:id(11),sent:100,received:100,source_value:100,target_value:100,fee:0,date:today,notes:''}]);
  await seed(`INSERT INTO savings_goals(id,user_id,name,account_id,target,allocated,currency) VALUES('${id(50)}','${owner}','Trip','${id(11)}',500,50,'USD')`);
  assert.deepEqual(await blockers(10),['transfers']);
  assert.deepEqual(await blockers(11),['transfers','goals']);
  assert.equal((await remove(11).catch(error=>error)).detail,'transfers,goals');
  await db.query('SELECT public.record_investment_with_account($1,$2,$3,$4,$5,$6,$7,$8)',[id(42),id(13),'contribution',today,100,null,'Roof',id(10)]);
  assert.deepEqual(await blockers(13),['payments']);
  await as(stranger);
  assert.deepEqual(await blockers(10),[],'row security hides another owner\'s links');
  await remove(13);
  await as(owner);
  assert.ok(await record(13),'another owner deletes nothing');
  // Transactions and schedules keep their own rule.
  await add(31,'Salary',100,{frequency:'Monthly'});
  await remove(31);
  assert.equal(await record(31),undefined);
 }finally{await db.close();}
});

test('close keeps the record, needs a zero balance and holds it there until it is reopened',{skip},async()=>{
 const db=await database();
 const {rows,as,seed,add,record,history,remove,restoreAll,close,reopen}=kit(db);
 try{
  await as(owner);
  const today=await kit(db).today();
  await add(10,'Cash',300);await add(11,'Cash',0);await add(12,'Stock',100,{quantity:0});await add(13,'Stock',100,{quantity:2});
  await assert.rejects(close(10),/Bring the balance to zero before closing/);
  await assert.rejects(close(13),/Bring the balance to zero before closing/);
  await assert.rejects(close(11,'2999-01-01'),/Check the closing date/);
  await assert.rejects(close(99),/Record not found/);
  await assert.rejects(db.query('UPDATE finance_records SET closed_on=$2 WHERE id=$1',[id(31),today]).then(()=>add(31,'Salary',5)).then(()=>db.query('UPDATE finance_records SET closed_on=$2 WHERE id=$1',[id(31),today])),/Only accounts and holdings can be closed/);
  // The balance leaves through the existing transfer, dated the closing day; then the account closes.
  await db.query('SELECT public.record_asset_movement($1)',[{id:id(40),kind:'transfer',source_id:id(10),target_id:id(11),sent:300,received:300,source_value:300,target_value:300,fee:0,date:today,notes:''}]);
  const before=await history(10);
  await close(10,today);await close(10,today);
  assert.equal((await rows('SELECT closed_on::text AS day FROM finance_records WHERE id=$1',[id(10)]))[0].day,today);
  assert.deepEqual(await history(10),before,'closing writes no history');
  await close(12);
  assert.equal((await rows('SELECT closed_on::text AS day FROM finance_records WHERE id=$1',[id(12)]))[0].day,today);
  // Closed: no transaction, transfer or direct edit may move its balance.
  await assert.rejects(add(30,'Living expense',10,{date:today,account_id:id(10)}),/This account is closed\. Reopen it before changing its balance/);
  await assert.rejects(db.query('SELECT public.record_asset_movement($1)',[{id:id(41),kind:'transfer',source_id:id(11),target_id:id(10),sent:5,received:5,source_value:5,target_value:5,fee:0,date:today,notes:''}]),/This account is closed/);
  await assert.rejects(db.query('UPDATE finance_records SET amount=5 WHERE id=$1',[id(10)]),/This account is closed/);
  assert.equal(Number((await record(11)).amount),300,'the refused transfer moved nothing');
  // A day with later activity cannot be the closing day; a goal saved in the account keeps it open.
  await assert.rejects(close(11,'2020-01-01'),/Check the closing date|activity after that day/);
  await add(14,'Cash',0);
  await seed(`INSERT INTO savings_goals(id,user_id,name,account_id,target,allocated,currency) VALUES('${id(50)}','${owner}','Trip','${id(14)}',500,0,'USD')`);
  await assert.rejects(close(14),/Move or archive the goals saved in this account before closing it/);
  await seed(`UPDATE savings_goals SET archived=true WHERE id='${id(50)}'`);
  await close(14);
  // A property that is still expected to pay rent closes once its income schedule is stopped; its estimate ends with it.
  await add(15,'Property',0,{estimated_monthly_income:500});
  await assert.rejects(close(15),/Stop or archive its recurring income before closing it/);
  await seed(`UPDATE finance_records SET archived=true WHERE income_source_id='${id(15)}'`);
  await close(15);
  assert.equal(Number((await record(15)).estimated_monthly_income),0);
  // Another owner and a view-only member cannot close or reopen; a member can.
  await as(stranger);
  await assert.rejects(close(12),/Record not found/);
  await reopen(10);
  await db.exec(`RESET ROLE;INSERT INTO household_members(owner_id,member_id,role) VALUES('${owner}','${viewer}','viewer'),('${owner}','${member}','member');`);
  await as(viewer,owner);
  await assert.rejects(reopen(10),/view-only/);
  await as(owner);
  assert.equal((await rows('SELECT closed_on::text AS day FROM finance_records WHERE id=$1',[id(10)]))[0].day,today,'still closed');
  await as(member,owner);
  await reopen(10);
  await as(owner);
  assert.equal((await record(10)).closed_on,null);
  // Reopened, it takes money again.
  await db.query('SELECT public.record_asset_movement($1)',[{id:id(43),kind:'transfer',source_id:id(11),target_id:id(10),sent:25,received:25,source_value:25,target_value:25,fee:0,date:today,notes:''}]);
  assert.equal(Number((await record(10)).amount),25);
  // A closed record that is deleted comes back closed.
  await remove(12);
  assert.equal(await record(12),undefined);
  await restoreAll();
  assert.equal((await rows('SELECT closed_on::text AS day FROM finance_records WHERE id=$1',[id(12)]))[0].day,today);
 }finally{await db.close();}
});

test('an investment account closes with its holdings, reopens with them, and is deleted only when empty',{skip},async()=>{
 const db=await database();
 const {rows,as,seed,add,record,remove,restoreAll}=kit(db);
 const account=(n,kind='Stock')=>db.query('INSERT INTO holding_accounts(id,user_id,name,kind,currency) VALUES($1,$2,$3,$4,$5)',[id(n),owner,'Account '+n,kind,'USD']);
 const closeAccount=(n,moveTo,closeHoldings)=>db.query('SELECT public.close_holding_account($1,$2,$3,$4)',[id(n),null,moveTo,closeHoldings]);
 const closed=async(table,n)=>(await rows(`SELECT closed_on::text AS day FROM ${table} WHERE id=$1`,[id(n)]))[0]?.day??null;
 try{
  await as(owner);
  const today=await kit(db).today();
  await account(20);await account(21);await account(22,'Crypto');
  await add(10,'Stock',100,{quantity:3,holding_account_id:id(20)});await add(11,'Stock',50,{quantity:0,holding_account_id:id(20)});
  // Holdings with value cannot close with the account; they can move.
  await assert.rejects(closeAccount(20,null,true),/Bring the balance to zero before closing/);
  assert.equal(await closed('holding_accounts',20),null);assert.equal(await closed('finance_records',11),null,'a refused close changes nothing');
  await assert.rejects(db.query('UPDATE holding_accounts SET closed_on=$2 WHERE id=$1',[id(20),today]),/Close or move the holdings in this account first/);
  await assert.rejects(closeAccount(20,id(22),false),/Choose one of your matching stock or crypto accounts/);
  await closeAccount(20,id(21),false);
  assert.equal(await closed('holding_accounts',20),today);
  assert.equal((await record(10)).holding_account_id,id(21));assert.equal((await record(11)).holding_account_id,id(21));
  // Nothing new goes into a closed account.
  await assert.rejects(db.query('UPDATE finance_records SET holding_account_id=$2 WHERE id=$1',[id(10),id(20)]),/This investment account is closed\. Reopen it first/);
  // Closing with its holdings, once they are sold out.
  await db.query('UPDATE finance_records SET quantity=0 WHERE id=$1',[id(10)]);
  await closeAccount(21,null,true);
  assert.equal(await closed('holding_accounts',21),today);assert.equal(await closed('finance_records',10),today);assert.equal(await closed('finance_records',11),today);
  await assert.rejects(db.query('SELECT public.reopen_finance_record($1)',[id(10)]),/This investment account is closed\. Reopen it first/);
  // A closed account that still names holdings is not deleted; a view-only member deletes nothing.
  await assert.rejects(db.query('SELECT public.delete_holding_account($1)',[id(21)]),/This account still has holdings\. Move or delete them first, or close the account instead/);
  await db.exec(`RESET ROLE;INSERT INTO household_members(owner_id,member_id,role) VALUES('${owner}','${viewer}','viewer'),('${owner}','${member}','member');`);
  await as(viewer,owner);
  await assert.rejects(db.query('SELECT public.delete_holding_account($1)',[id(20)]),/view-only/);
  await assert.rejects(db.query('SELECT public.reopen_holding_account($1)',[id(21)]),/view-only/);
  await assert.rejects(db.query('DELETE FROM holding_accounts WHERE id=$1',[id(20)]),/view-only/);
  await as(stranger);
  await assert.rejects(db.query('SELECT public.delete_holding_account($1)',[id(20)]),/Account or holding not found/);
  await db.query('SELECT public.reopen_holding_account($1)',[id(21)]);
  await as(owner);
  assert.equal(await closed('holding_accounts',21),today,'another owner reopens nothing');
  // Reopen brings back the holdings that closed with it.
  await db.query('SELECT public.reopen_holding_account($1)',[id(21)]);
  assert.equal(await closed('holding_accounts',21),null);assert.equal(await closed('finance_records',10),null);assert.equal(await closed('finance_records',11),null);
  // An investment goal keeps its account.
  await seed(`INSERT INTO savings_goals(id,user_id,name,target,allocated,currency,kind,holding_account_id,asset_kind,asset_symbol,investment_targets) VALUES('${id(50)}','${owner}','Invest',4,0,'USD','investment','${id(22)}','Crypto','BTC','[{"holding_account_id":"${id(22)}","asset_kind":"Crypto","asset_symbol":"BTC","target":4,"monthly_contribution":null}]')`);
  await assert.rejects(db.query('SELECT public.delete_holding_account($1)',[id(22)]),/Update the investment goals before removing or changing this account/);
  await assert.rejects(closeAccount(22,null,true),/Update the investment goals before removing or changing this account/);
  // The empty account is deleted by a member; a deleted holding of an account that is gone comes back outside it.
  await as(member,owner);
  await db.query('SELECT public.delete_holding_account($1)',[id(20)]);
  await as(owner);
  assert.deepEqual(await rows('SELECT id FROM holding_accounts WHERE id=$1',[id(20)]),[]);
  await remove(11);await remove(10);
  await db.query('SELECT public.delete_holding_account($1)',[id(21)]);
  await restoreAll();
  assert.equal((await record(10)).holding_account_id,null);assert.equal((await record(11)).holding_account_id,null);
 }finally{await db.close();}
});

test('a deleted holding leaves the daily snapshots as if it never existed, and Restore puts every day back',{skip},async()=>{
 const db=await database();
 const {rows,as,add,remove,restoreAll}=kit(db);
 const snapshots=()=>rows("SELECT occurred_on::text AS day,assets::float8 AS assets,debt::float8 AS debt,parts FROM portfolio_snapshots WHERE user_id=$1 ORDER BY occurred_on",[owner]);
 try{
  await as(owner);
  const today=await kit(db).today();
  // A 50,000 holding (in soʻm at 10 to the dollar on the older days), a loan, and cash that stays.
  await add(10,'Stock',5000,{quantity:10,opened_on:'2026-01-01'});
  await add(11,'Property',200000,{currency:'UZS'});
  await add(12,'Loan',8000,{opened_on:'2026-01-01'});
  await add(13,'Cash',1000,{opened_on:'2026-01-01'});
  await db.exec('RESET ROLE');
  // Days from before this migration keep no parts; later days keep each record's part, at that day's market value.
  await db.exec(`INSERT INTO portfolio_snapshots(user_id,occurred_on,assets,debt,rates,parts) VALUES
   ('${owner}','2025-12-31',400,0,'{"USD":1,"UZS":10}',NULL),
   ('${owner}','2026-01-05',71000,8000,'{"USD":1,"UZS":10}',NULL),
   ('${owner}','2026-01-06',71000,8000,'{"USD":1,"UZS":10}',NULL),
   ('${owner}','2026-01-07',76000,8000,'{"USD":1,"UZS":8}','{"${id(10)}":50000,"${id(11)}":25000,"${id(12)}":8000,"${id(13)}":1000}'),
   ('${owner}','2026-01-08',81500,8000,'{"USD":1,"UZS":8}','{"${id(10)}":55500,"${id(11)}":25000,"${id(12)}":8000,"${id(13)}":1000}');
   INSERT INTO portfolio_snapshots(user_id,occurred_on,assets,debt,rates) VALUES('${stranger}','2026-01-06',71000,8000,'{"USD":1}');`);
  await as(owner);
  const before=await snapshots();
  await remove(10);
  // No cliff: every day counts the property and the cash alone, the day before the holding existed is untouched.
  assert.deepEqual((await snapshots()).map(row=>[row.day,row.assets,row.debt]),[['2025-12-31',400,0],['2026-01-05',21000,8000],['2026-01-06',21000,8000],['2026-01-07',26000,8000],['2026-01-08',26000,8000]]);
  assert.ok((await snapshots()).slice(3).every(row=>!(id(10) in row.parts)&&id(11) in row.parts),'its part leaves; the others stay');
  assert.equal((await rows('SELECT jsonb_array_length(snapshot_changes) AS n FROM deleted_items'))[0].n,4);
  // The loan leaves the debt side; a currency the day has no rate for is left alone.
  await remove(12);
  assert.deepEqual((await snapshots()).map(row=>row.debt),[0,0,0,0,0]);
  await db.exec('RESET ROLE');
  assert.deepEqual(await rows('SELECT assets::float8 AS assets,debt::float8 AS debt FROM portfolio_snapshots WHERE user_id=$1',[stranger]),[{assets:71000,debt:8000}],'another owner\'s days are never touched');
  await as(owner);
  await restoreAll();
  assert.deepEqual(await snapshots(),before,'Restore brings every day back identically');
  // Days captured while it sat in Recently deleted carry the value it left with.
  await remove(10);
  await db.exec(`RESET ROLE;INSERT INTO portfolio_snapshots(user_id,occurred_on,assets,debt,rates,parts) VALUES('${owner}','${today}',26000,8000,'{"USD":1,"UZS":8}','{"${id(11)}":25000,"${id(12)}":8000,"${id(13)}":1000}') ON CONFLICT(user_id,occurred_on) DO UPDATE SET assets=26000,debt=8000,parts=excluded.parts;`);
  await as(owner);
  await restoreAll();
  const after=await snapshots(),last=after.at(-1);
  assert.deepEqual(after.slice(0,5),before);
  assert.equal(last.assets,81500);assert.equal(last.parts[id(10)],55500);
  // The capture keeps parts, hides them from the browser, and refuses a malformed list.
  const saved=(await rows(`SELECT public.capture_portfolio_snapshot(900,0,'{"USD":1}'::jsonb,$1::jsonb) AS snapshot`,[{[id(13)]:900}]))[0].snapshot;
  assert.equal(saved.assets,900);assert.equal('parts' in saved,false);
  assert.deepEqual((await rows('SELECT parts FROM portfolio_snapshots WHERE user_id=$1 AND occurred_on=$2',[owner,today]))[0].parts,{[id(13)]:900});
  await assert.rejects(db.query(`SELECT public.capture_portfolio_snapshot(900,0,'{"USD":1}'::jsonb,'{"x":1}'::jsonb)`),/Invalid snapshot/);
  await db.query(`SELECT public.capture_portfolio_snapshot(901,0,'{"USD":1}'::jsonb)`);
  assert.deepEqual(await rows('SELECT assets::float8 AS assets,parts FROM portfolio_snapshots WHERE user_id=$1 AND occurred_on=$2',[owner,today]),[{assets:901,parts:null}]);
  await db.exec('RESET ROLE');
  await db.query('SELECT public.capture_owner_portfolio_snapshot($1,$2,$3)',[owner,'2026-01-09',{assets:5,debt:0,rates:{USD:1},parts:{[id(13)]:5}}]);
  assert.deepEqual(await rows("SELECT parts FROM portfolio_snapshots WHERE user_id=$1 AND occurred_on='2026-01-09'",[owner]),[{parts:{[id(13)]:5}}]);
 }finally{await db.close();}
});
