import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`e1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration=fs.readFileSync('migrations/161_asset_payment_links.sql','utf8');
test('migration 161 is in setup.sql and the app requires it',()=>{
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration));
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 161/);
 assert.match(migration,/'schema_version',161/);
});
test('rent and costs name their property however they were recorded, and old rows are linked (migration 161)',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner=id(1),cash=id(2),flat=id(3),shop=id(4),schedule=id(5),unlinked=id(6);
 const today="(now() AT TIME ZONE 'Asia/Tashkent')::date";
 const links=async ids=>Object.fromEntries((await db.query('SELECT id,income_source_id,property_id FROM finance_records WHERE id=ANY($1)',[ids])).rows.map(row=>[row.id,[row.income_source_id,row.property_id]]));
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES('${cash}','${owner}','Cash','Cash','USD',5000,'2020-01-01','2020-01-01');
   INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES('${flat}','${owner}','Flat','Property','USD',90000,'2026-01-01'),('${shop}','${owner}','Shop','Business','USD',9000,'2026-01-01');
   INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,income_source_id) VALUES('${schedule}','${owner}','Flat','Rent income','USD',800,'2026-01-05','Monthly','${flat}'),('${unlinked}','${owner}','Garage','Rent income','USD',80,'2026-01-05','Monthly',NULL);`);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const day=(await db.query(`SELECT ${today}::text AS day`)).rows[0].day;
  const track=(n,record,type,account=cash)=>db.query('SELECT record_investment_with_account($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),record,type,day,100,null,'',account]);
  const pay=(n,target,due)=>db.query("SELECT planning_action_with_actual_amount('occurrence',$1)",[{id:id(n),target_id:target,account_id:cash,date:due,amount:800}]);
  await track(10,flat,'income');await track(11,flat,'expense');await track(12,shop,'income');
  await db.query('SELECT record_investment_with_fx($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id(13),flat,'income',day,100,null,'',cash,1,day,'USD','USD',0,0]);
  await pay(20,schedule,'2026-02-05');await pay(21,unlinked,'2026-02-05');
  await db.query('SELECT record_occurrence_extra($1)',[{id:id(22),target_id:schedule,account_id:cash,date:'2026-02-05',paid_on:'2026-02-06',amount:50}]);
  const expected={[id(10)]:[flat,null],[id(11)]:[null,flat],[id(12)]:[null,null],[id(13)]:[flat,null],[id(20)]:[flat,null],[id(21)]:[null,null],[id(22)]:[flat,null]};
  assert.deepEqual(await links(Object.keys(expected)),expected,'new rows are linked, and only the rows of a property');
  // Rows saved before 161, with a look-alike that names neither a schedule nor an event.
  await db.exec(`RESET ROLE;ALTER TABLE finance_records DISABLE TRIGGER USER;UPDATE finance_records SET income_source_id=NULL,property_id=NULL WHERE kind IN ('Rent income','Other expense') AND frequency='Once';ALTER TABLE finance_records ENABLE TRIGGER USER;
   INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(30)}','${owner}','Flat','Rent income','USD',800,'2026-02-05','Once'),('${id(31)}','${owner}','Flat','Other expense','USD',100,'2026-02-05','Once');`);
  const snapshot=()=>db.query("SELECT id,name,amount::text,revision,date::text FROM finance_records ORDER BY id").then(result=>result.rows);
  const before=await snapshot(),audits=async()=>(await db.query('SELECT count(*)::int AS n FROM record_edit_history')).rows[0].n,audited=await audits();
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual(await links([...Object.keys(expected),id(30),id(31)]),{...expected,[id(30)]:[null,null],[id(31)]:[null,null]});
  assert.deepEqual(await snapshot(),before,'a link is all that changes');
  assert.equal(await audits(),audited);
  assert.equal((await db.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,161);
  const triggers=(await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='public.finance_records'::regclass AND NOT tgisinternal AND tgenabled='D'")).rows[0].n;
  assert.equal(triggers,0,'every trigger is back on');
  // A linked rent payment can still go to Recently deleted and come back.
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[id(22)]);
  const {rows:[bin]}=await db.query("SELECT id FROM deleted_items WHERE data->>'id'=$1",[id(22)]);
  await db.query('SELECT restore_deleted_item($1)',[bin.id]);
  assert.deepEqual(await links([id(22)]),{[id(22)]:[flat,null]});
 }finally{await db.close();}
});
