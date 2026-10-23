import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('deletion archives atomically; owner-only restore keeps details, dependencies and duplicate safety',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 const record='20000000-0000-4000-8000-000000000001',plan='20000000-0000-4000-8000-000000000002',payment='20000000-0000-4000-8000-000000000003';
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,end_date,frequency,notes) VALUES('${record}','${owner}','Salary','Salary','USD',1234,'2026-01-01','2026-09-30','Monthly','original');`);
  const original=(await db.query('SELECT * FROM finance_records WHERE id=$1',[record])).rows[0];
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[record]);
  assert.equal((await db.query('SELECT * FROM finance_records WHERE id=$1',[record])).rows.length,0);
  const archived=(await db.query('SELECT * FROM deleted_items')).rows[0];assert.equal(archived.data.notes,'original');
  await db.exec(`SET request.jwt.claim.sub='${other}'`);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
  await db.query('SELECT restore_deleted_item($1)',[archived.id]);
  assert.equal((await db.query('SELECT * FROM finance_records')).rows.length,0);
  await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,1);
  await assert.rejects(db.query("UPDATE deleted_items SET data='{}'"),/permission denied/);
  await db.query('SELECT restore_deleted_item($1)',[archived.id]);await db.query('SELECT restore_deleted_item($1)',[archived.id]);
  assert.deepEqual((await db.query('SELECT * FROM finance_records WHERE id=$1',[record])).rows[0],original);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
  // A spending plan deleted before plans became Budget categories (migration 131) comes back as a category with its budget.
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO deleted_items(id,user_id,source,data) VALUES($1,$2,'expense_plans',$3)",[payment,owner,{id:plan,user_id:owner,name:'Food',category:'Groceries',currency:'USD',amount:500,start_date:'2026-01-01',end_date:null,created_at:'2026-01-01T00:00:00Z',archived:false,archive_pauses:[]}]);
  await db.exec('SET ROLE authenticated');
  await db.query('SELECT restore_deleted_item($1)',[payment]);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM expense_plans')).rows[0].n,0);
  const food=(await db.query("SELECT id FROM transaction_categories WHERE name='Food' AND direction='expense'")).rows[0].id;
  assert.deepEqual((await db.query("SELECT to_char(month,'YYYY-MM') AS month,amount::float AS amount,currency FROM budget_amounts WHERE category_key=$1",[food])).rows,[{month:'2026-01',amount:500,currency:'USD'}]);
 }finally{await db.close();}
});

const bootstrap=owners=>`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES${owners.map(id=>`('${id}')`).join(',')};`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration154=fs.readFileSync('migrations/154_deleted_transaction_tags.sql','utf8');

test('migration 154 is in setup.sql, safe to re-run, and bumps the schema version the app requires',{skip:!process.env.PGLITE_MODULE},async()=>{
 assert.ok(setup.includes(migration154),'setup.sql includes migration 154');
 assert.ok(Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+);/)[1])>=154);
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(bootstrap(['10000000-0000-4000-8000-000000000001']));
  await db.exec(setup.slice(0,setup.indexOf(migration154)));
  await db.exec(migration154);await db.exec(migration154);
  assert.equal((await db.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,154);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='archive_transaction_tags'")).rows[0].n,1,'one trigger after two runs');
  assert.equal((await db.query("SELECT (length(d)-length(replace(d,'transaction_tag_links','')))/length('transaction_tag_links') AS n FROM pg_get_functiondef('public.restore_deleted_item(uuid)'::regprocedure) d")).rows[0].n,1,'restore relinks tags once');
 }finally{await db.close();}
});

test('a deleted transaction keeps its tags in Recently deleted, and Restore links them again for the owner only',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 const record='20000000-0000-4000-8000-000000000011',otherRecord='20000000-0000-4000-8000-000000000012';
 const as=id=>db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id}'`);
 const links=id=>db.query('SELECT t.name FROM transaction_tag_links l JOIN transaction_tags t ON t.id=l.tag_id WHERE l.record_id=$1 ORDER BY t.name',[id]).then(r=>r.rows.map(row=>row.name));
 try{
  await db.exec(bootstrap([owner,other]));
  await db.exec(setup);
  // The other owner has a tag of their own; it must never end up on the first owner's transaction.
  await as(other);
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes) VALUES('${otherRecord}','${other}','Taxi','Living expense','USD',12,'2026-10-01','Once','');`);
  const foreign='30000000-0000-4000-8000-000000000003';
  await db.query("INSERT INTO transaction_tags(id,name) VALUES($1,'Foreign')",[foreign]);
  await db.query('SELECT tag_transactions($1,$2,$3)',[[otherRecord],[foreign],[]]);
  await as(owner);
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,notes) VALUES('${record}','${owner}','Lunch','Living expense','USD',15,'2026-10-02','Once','');`);
  const work='30000000-0000-4000-8000-000000000001',travel='30000000-0000-4000-8000-000000000002';
  await db.query("INSERT INTO transaction_tags(id,name) VALUES($1,'Work'),($2,'Travel')",[work,travel]);
  await db.query('SELECT tag_transactions($1,$2,$3)',[[record],[work,travel],[]]);
  assert.deepEqual(await links(record),['Travel','Work']);
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[record]);
  const archived=(await db.query('SELECT * FROM deleted_items')).rows[0];
  assert.deepEqual([...archived.tags].sort(),[travel,work].sort(),'the snapshot keeps the tag ids');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM transaction_tag_links WHERE record_id=$1',[record])).rows[0].n,0,'the links went with the transaction');
  // The other owner cannot restore it, and sees nothing.
  await as(other);
  await db.query('SELECT restore_deleted_item($1)',[archived.id]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_records WHERE id=$1',[record])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM deleted_items')).rows[0].n,0);
  // A tag deleted meanwhile is left out; the rest come back with the transaction.
  await as(owner);
  await db.query('DELETE FROM transaction_tags WHERE id=$1',[travel]);
  await db.query('SELECT restore_deleted_item($1)',[archived.id]);
  assert.deepEqual(await links(record),['Work']);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM deleted_items')).rows[0].n,0);
  // Restoring twice is harmless, and a tag already on the transaction stays once.
  await db.query('SELECT restore_deleted_item($1)',[archived.id]);
  assert.deepEqual(await links(record),['Work']);
  // A snapshot naming another owner's tag (it cannot be written through the app) never links it.
  await db.exec('RESET ROLE');
  await db.query("UPDATE finance_records SET id=$1 WHERE id=$1",[record]);
  await as(owner);
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[record]);
  const again=(await db.query('SELECT * FROM deleted_items')).rows[0];
  await db.exec('RESET ROLE');
  await db.query('UPDATE deleted_items SET tags=$1 WHERE id=$2',[JSON.stringify([work,foreign]),again.id]);
  await as(owner);
  await db.query('SELECT restore_deleted_item($1)',[again.id]);
  assert.deepEqual(await links(record),['Work'],'only the owner\'s tag is linked');
  await as(other);
  assert.deepEqual(await links(otherRecord),['Foreign'],'the other owner\'s transaction is untouched');
 }finally{await db.close();}
});
