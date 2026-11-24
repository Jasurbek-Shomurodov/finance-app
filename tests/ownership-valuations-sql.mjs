import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const id=n=>`f6000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const m166=fs.readFileSync('migrations/166_ownership_and_counted_assets.sql','utf8');
const m167=fs.readFileSync('migrations/167_business_share_of_transactions.sql','utf8');
const roles=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`;
async function database(sql=setup){const db=new PGlite();await db.exec(roles);await db.exec(sql);return db;}
const as=(db,n)=>db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(n)}';`);
const admin=db=>db.exec('RESET ROLE;');
const one=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0];
const today=async db=>(await one(db,"SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).day;
const shift=async(db,days)=>(await one(db,`SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date+${days})::text AS day`)).day;
const record=async(db,n)=>one(db,'SELECT amount::float8 AS amount,quantity::float8 AS quantity,ownership_percentage::float8 AS share,unit_label,business_share::float8 AS business_share,amount_basis FROM finance_records WHERE id=$1',[id(n)]);
const history=async(db,n)=>(await db.query('SELECT event_type,occurred_on::text AS day,balance::float8 AS balance,ownership_percentage::float8 AS share,quantity::float8 AS quantity,unit_value::float8 AS unit_value FROM investment_history WHERE record_id=$1 ORDER BY occurred_on,created_at,id',[id(n)])).rows;
const valuation=(db,n,target,day,extra={})=>db.query('SELECT record_investment_event(p_id=>$1,p_record_id=>$2,p_type=>$3,p_date=>$4,p_amount=>0,p_balance=>$5,p_notes=>$6,p_quantity=>$7,p_unit_value=>$8,p_ownership=>$9)',[id(n),id(target),'valuation',day,extra.balance??null,'',extra.quantity??null,extra.unit_value??null,extra.ownership??null]);

test('migrations 166 and 167 are in setup.sql, move the schema version and are safe to re-run',async()=>{
 assert.ok(setup.includes(m166),'setup.sql includes migration 166');
 assert.ok(setup.includes(m167),'setup.sql includes migration 167');
 assert.ok(setup.indexOf(m166)<setup.indexOf(m167));
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 169/);
 const db=await database(setup.slice(0,setup.indexOf(m166)));
 try{
  // A record from before the migration: a property that somehow kept a share, and a business at 40%.
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,ownership_percentage,date) VALUES('${id(10)}','${id(1)}','Flat','Property','USD',90000,3,60,'2026-01-01'),('${id(11)}','${id(1)}','Café','Business','USD',50000,1,40,'2026-01-01');INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,business_id) VALUES('${id(12)}','${id(1)}','Sale','Business income','USD',700,'2026-02-01','${id(11)}');`);
  const plain=async()=>(await db.query('SELECT event_type,occurred_on::text AS day,balance::float8 AS balance,ownership_percentage::float8 AS share FROM investment_history WHERE record_id=$1 ORDER BY occurred_on,created_at,id',[id(10)])).rows;
  const before=await plain();
  await db.exec(m166);await db.exec(m167);await db.exec(m166);await db.exec(m167);
  assert.deepEqual((await one(db,'SELECT public.finance_capabilities() AS c')).c.schema_version,167);
  // The property always counted in full, so its stored share is reset; nothing else about it moves.
  assert.deepEqual(await record(db,10),{amount:90000,quantity:3,share:100,unit_label:null,business_share:null,amount_basis:'mine'});
  assert.deepEqual(await plain(),before,'no history row is written or rewritten');
  assert.deepEqual((await history(db,10)).map(row=>[row.quantity,row.unit_value]),[[null,null]]);
  assert.equal((await record(db,11)).share,40);
  // Existing business transactions stay as entered: mine, with no share.
  assert.deepEqual([(await record(db,12)).amount_basis,(await record(db,12)).business_share],['mine',null]);
  assert.equal((await db.query("SELECT 1 FROM pg_proc WHERE proname='record_investment_event'")).rows.length,2,'the seven-argument form and the one with a count and a share');
 }finally{await db.close();}
});

test('ownership counts for every valued kind, and a share is above 0 and at most 100',async()=>{
 const db=await database();
 try{
  await as(db,1);
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,ownership_percentage,date) VALUES('${id(20)}','Land','Property','USD',80000,50,'2026-01-01'),('${id(21)}','AAPL','Stock','USD',100,50,'2026-01-01');`);
  assert.equal((await history(db,20))[0].share,50,'a part-owned property is valued at its share');
  assert.equal((await history(db,21))[0].share,100,'a holding is never part-owned');
  await assert.rejects(db.exec(`UPDATE finance_records SET ownership_percentage=0 WHERE id='${id(20)}'`),/ownership_percentage_check/);
  await assert.rejects(db.exec(`UPDATE finance_records SET ownership_percentage=100.5 WHERE id='${id(20)}'`),/ownership_percentage_check/);
  // Changing the share is a dated update of its own, and an older one never replaces the current share.
  const day=await today(db),earlier=await shift(db,-30);
  await valuation(db,30,20,day,{balance:80000,ownership:60});
  assert.equal((await record(db,20)).share,60);
  await valuation(db,31,20,earlier,{balance:70000,ownership:25});
  assert.deepEqual([(await record(db,20)).share,(await record(db,20)).amount],[60,80000],'a backdated update is history only');
  assert.deepEqual((await history(db,20)).map(row=>[row.day,row.balance,row.share]),[[earlier,70000,25],[day,80000,50],[day,80000,60]].sort((a,b)=>a[0].localeCompare(b[0])));
  await assert.rejects(valuation(db,32,21,day,{balance:100,ownership:50}),/Check the tracker fields/,'a holding takes no share');
  await assert.rejects(valuation(db,33,20,day,{balance:1,ownership:0}),/Check the tracker fields/);
 }finally{await db.close();}
});

test('a counted asset is quantity × value per unit, revalued and backdated with both numbers',async()=>{
 const db=await database();
 try{
  await as(db,1);
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,quantity,unit_label,ownership_percentage,date) VALUES('${id(40)}','Sheep','Business','USD',80,1000,'sheep',50,'2026-01-01');`);
  const day=await today(db),lastYear=await shift(db,-365);
  assert.deepEqual((await history(db,40)).map(row=>[row.event_type,row.balance,row.share,row.quantity,row.unit_value]),[['baseline',80000,50,1000,80]]);
  // This year's count and price.
  await valuation(db,41,40,day,{quantity:1300,unit_value:85});
  assert.deepEqual(await record(db,40),{amount:85,quantity:1300,share:50,unit_label:'sheep',business_share:null,amount_basis:'mine'});
  // An older year, entered afterwards: it is kept in history and leaves today's numbers alone.
  await valuation(db,42,40,lastYear,{quantity:900,unit_value:70});
  assert.deepEqual([(await record(db,40)).amount,(await record(db,40)).quantity],[85,1300]);
  assert.deepEqual((await history(db,40)).map(row=>[row.day,row.balance,row.quantity,row.unit_value]),[[lastYear,63000,900,70],[day,80000,1000,80],[day,110500,1300,85]]);
  // Retrying the same update is harmless; the same id with other numbers is refused.
  await valuation(db,41,40,day,{quantity:1300,unit_value:85});
  await assert.rejects(valuation(db,41,40,day,{quantity:1300,unit_value:86}),/already saved with different details/);
  // Precision: the total is the exact product, and a total that disagrees with its two numbers is refused.
  await valuation(db,43,40,day,{quantity:1300.5,unit_value:85.25,balance:110867.625});
  assert.equal((await history(db,40)).at(-1).balance,110867.625);
  await assert.rejects(valuation(db,44,40,day,{quantity:10,unit_value:5,balance:51}),/Check the tracker fields/);
  await assert.rejects(valuation(db,45,40,day,{quantity:10}),/Check the tracker fields/,'both numbers or neither');
  // A whole-asset value keeps the count and works out the value per unit.
  await valuation(db,46,40,day,{balance:130050});
  assert.deepEqual([(await record(db,40)).amount,(await record(db,40)).quantity],[100,1300.5]);
  // Deleting the newest update brings back the two numbers before it.
  await db.query('SELECT delete_tracker_update($1,$2)',[id(46),id(40)]);
  assert.deepEqual([(await record(db,40)).amount,(await record(db,40)).quantity],[85.25,1300.5]);
  // Editing the record itself writes both numbers too.
  await db.exec(`UPDATE finance_records SET quantity=1400 WHERE id='${id(40)}'`);
  assert.deepEqual([(await history(db,40)).at(-1).quantity,(await history(db,40)).at(-1).unit_value,(await history(db,40)).at(-1).balance],[1400,85.25,119350]);
  // An asset that is not counted takes no quantity, and only valued kinds have a unit name.
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,date) VALUES('${id(47)}','Car','Vehicle','USD',9000,'2026-01-01');`);
  await assert.rejects(valuation(db,48,47,day,{quantity:2,unit_value:10}),/Check the tracker fields/);
  await assert.rejects(db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,unit_label,date) VALUES('${id(49)}','Wallet','Cash','USD',1,'coins','2026-01-01')`),/unit_label_check/);
  await assert.rejects(db.exec(`UPDATE finance_records SET unit_label='${'x'.repeat(41)}' WHERE id='${id(40)}'`),/unit_label_check/);
  // The summary every total reads carries the count and the unit name.
  const summary=(await one(db,"SELECT public.finance_records_page(1,'assets',NULL,true) AS page")).page.summary.find(row=>row.id===id(40));
  assert.deepEqual([Number(summary.amount),Number(summary.quantity),summary.unit_label,Number(summary.ownership_percentage)],[85.25,1400,'sheep',50]);
  const car=(await one(db,"SELECT public.finance_records_page(1,'assets',NULL,true) AS page")).page.summary.find(row=>row.id===id(47));
  assert.deepEqual([Number(car.amount),Number(car.quantity),car.unit_label],[9000,1,null]);
 }finally{await db.close();}
});

test('a business transaction keeps the share it was linked at, and only whole or mine is accepted',async()=>{
 const db=await database();
 try{
  await as(db,1);
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,ownership_percentage,date) VALUES('${id(60)}','Game club','Business','USD',40000,60,'2026-01-01'),('${id(61)}','Sheep','Business','USD',80000,50,'2026-01-01');`);
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,date,business_id,amount_basis) VALUES('${id(62)}','Tickets','Business income','USD',1000,'2026-03-01','${id(60)}','whole'),('${id(63)}','Payout','Business income','USD',300,'2026-03-02','${id(60)}','mine');`);
  assert.deepEqual([(await record(db,62)).business_share,(await record(db,62)).amount_basis],[60,'whole']);
  assert.deepEqual([(await record(db,63)).business_share,(await record(db,63)).amount_basis],[60,'mine']);
  // The ownership changes later: what was already recorded keeps its share.
  await db.exec(`UPDATE finance_records SET ownership_percentage=75 WHERE id='${id(60)}'`);
  await db.exec(`UPDATE finance_records SET notes='edited' WHERE id='${id(62)}'`);
  assert.equal((await record(db,62)).business_share,60);
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,date,business_id,amount_basis) VALUES('${id(64)}','Tickets','Business income','USD',1000,'2026-04-01','${id(60)}','whole');`);
  assert.equal((await record(db,64)).business_share,75,'a new transaction takes the new share');
  // Moving a transaction to another business takes that business's share; unlinking clears it.
  await db.exec(`UPDATE finance_records SET business_id='${id(61)}' WHERE id='${id(62)}'`);
  assert.equal((await record(db,62)).business_share,50);
  await db.exec(`UPDATE finance_records SET kind='Other income',business_id=NULL WHERE id='${id(62)}'`);
  assert.deepEqual([(await record(db,62)).business_share,(await record(db,62)).amount_basis],[null,'mine']);
  await assert.rejects(db.exec(`UPDATE finance_records SET amount_basis='half' WHERE id='${id(63)}'`),/amount_basis_check/);
  // The record form saves the basis and the unit name, never the share.
  await db.query('SELECT save_finance_record($1,NULL)',[JSON.stringify({id:id(65),name:'Feed',kind:'Other expense',currency:'USD',amount:200,date:'2026-04-02',business_id:id(61),amount_basis:'whole'})]);
  assert.deepEqual([(await record(db,65)).business_share,(await record(db,65)).amount_basis],[50,'whole']);
  await assert.rejects(db.query('SELECT save_finance_record($1,NULL)',[JSON.stringify({id:id(66),name:'Feed',kind:'Other expense',currency:'USD',amount:200,date:'2026-04-02',business_id:id(61),business_share:10})]),/Check the record fields/);
  await db.query('SELECT save_finance_record($1,NULL)',[JSON.stringify({id:id(67),name:'Herd',kind:'Valuables',currency:'USD',amount:5,quantity:12,unit_label:'goats',date:'2026-04-02'})]);
  assert.deepEqual([(await history(db,67))[0].balance,(await history(db,67))[0].quantity],[60,12]);
 }finally{await db.close();}
});

test('another owner can neither value nor read someone else\'s asset, and never takes their business\'s share',async()=>{
 const db=await database();
 try{
  await as(db,1);
  await db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,quantity,unit_label,ownership_percentage,date) VALUES('${id(80)}','Sheep','Business','USD',80,1000,'sheep',50,'2026-01-01');`);
  const day=await today(db);
  await as(db,2);
  await assert.rejects(valuation(db,81,80,day,{quantity:1,unit_value:1}),/Investment not found/);
  assert.equal((await db.query('SELECT 1 FROM investment_history WHERE record_id=$1',[id(80)])).rows.length,0,'history is hidden by row-level security');
  assert.equal((await db.query('SELECT 1 FROM finance_records WHERE id=$1',[id(80)])).rows.length,0);
  await assert.rejects(db.exec(`INSERT INTO finance_records(id,name,kind,currency,amount,date,business_id,amount_basis) VALUES('${id(82)}','Feed','Other expense','USD',1000,'2026-03-01','${id(80)}','whole')`),/must be your business/);
  await assert.rejects(db.query('SELECT delete_tracker_update($1,$2)',[id(81),id(80)]),/not found/);
  await admin(db);
  assert.deepEqual([(await record(db,80)).amount,(await record(db,80)).quantity],[80,1000],'the asset is untouched');
  // The trigger function is run by its trigger alone.
  assert.equal((await one(db,"SELECT has_function_privilege('authenticated','public.set_business_share()','EXECUTE') AS can")).can,false);
  assert.equal((await one(db,"SELECT has_function_privilege('anon','public.record_investment_event(uuid,uuid,text,date,numeric,numeric,text,numeric,numeric,numeric)','EXECUTE') AS can")).can,false);
 }finally{await db.close();}
});
