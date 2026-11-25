import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`16400000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,stranger]=[1,2].map(id);
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/164_edit_linked_transactions.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
async function database(){
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${stranger}');`);
 await db.exec(setup);
 return db;
}
// One workspace: a dollar wallet, a sum wallet, a mortgage and a business, with helpers every test shares.
async function workspace(){
 const db=await database();
 const as=user=>db.exec(`RESET ROLE;SET request.jwt.claim.sub='${user}';SET request.headers='{}';SET ROLE authenticated;`);
 await as(owner);
 const rows=async(sql,params=[])=>(await db.query(sql,params)).rows;
 const today=(await rows("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day"))[0].day;
 const record=(n,name,kind,currency,amount)=>db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(n),owner,name,kind,currency,amount,today]);
 await record(10,'Wallet','Cash','USD',5000);await record(11,'Sum wallet','Cash','UZS',50000000);await record(12,'Savings','Cash','USD',9000);
 await record(13,'Home','Mortgage','USD',100000);await record(14,'Farm','Business','USD',20000);
 const value=async n=>Number((await rows('SELECT amount FROM finance_records WHERE id=$1',[id(n)]))[0].amount);
 const pay=(n,principal,interest,account=10,notes='')=>db.query("SELECT planning_action('mortgage',$1)",[{id:id(n),account_id:id(account),target_id:id(13),amount:principal,received:0,fee:interest,date:today,notes}]);
 const category=async n=>{const [row]=await rows('SELECT kind,custom_category_id FROM finance_records WHERE id=$1',[id(n)]);return [row.kind,row.custom_category_id];};
 const recategorize=(ids,kind,custom=null)=>db.query('SELECT recategorize_transactions($1,$2,$3) AS changed',[ids.map(id),kind,custom]).then(r=>r.rows[0].changed);
 await db.query("SELECT planning_action('category',$1)",[{id:id(40),name:'Housing',direction:'expense'}]);
 await db.query("SELECT planning_action('category',$1)",[{id:id(41),name:'Side income',direction:'income'}]);
 return {db,as,rows,today,value,pay,category,recategorize};
}

test('migration 164 is in setup.sql and changes nothing when applied again',{skip},async()=>{
 assert.ok(setup.includes(migration.trimEnd()));
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 171/);
 const db=await database();
 try{
  const functions=()=>db.query(`SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid::regprocedure::text)) AS sum FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'`).then(r=>r.rows[0].sum);
  const before=await functions();
  await db.exec(migration);
  // Applied again it rewrites only the capability version, which the next migration moves on.
  for(const later of ['165_trigger_grants_and_reference_indexes.sql','166_ownership_and_counted_assets.sql','167_business_share_of_transactions.sql','168_close_accounts.sql','169_held_price_series.sql','170_lend_across_currencies.sql','171_income_source_day.sql'])await db.exec(fs.readFileSync('migrations/'+later,'utf8'));
  assert.equal(await functions(),before);
  const grants=(await db.query(`SELECT p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS run FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('edit_mortgage_payment','inherit_mortgage_payment_category') ORDER BY 1`)).rows;
  assert.deepEqual(grants.map(row=>[row.proname,row.run]),[['edit_mortgage_payment',true],['inherit_mortgage_payment_category',false]]);
 }finally{await db.close();}
});

test('a linked transaction changes category, business and nothing that moved a balance',{skip},async()=>{
 const {db,rows,today,pay,category,recategorize,value}=await workspace();
 try{
  await pay(20,400,1200);
  // A mortgage payment takes a built-in expense category or a custom one, and back.
  assert.deepEqual(await recategorize([20],'Living expense'),[id(20)]);
  assert.deepEqual(await category(20),['Living expense',null]);
  assert.deepEqual(await recategorize([20],'Other expense',id(40)),[id(20)]);
  assert.deepEqual(await category(20),['Other expense',id(40)]);
  // Its name is the mortgage's, not a category name, so it stays.
  assert.equal((await rows('SELECT name FROM finance_records WHERE id=$1',[id(20)]))[0].name,'Home');
  // An expense never becomes income, and the money fields stay guarded.
  assert.deepEqual(await recategorize([20],'Other income'),[]);
  for(const change of ['amount=1','date=date-1',"currency='UZS'",'payment_principal=1',"frequency='Monthly'",'account_id=NULL,notes=\'x\''])
   await assert.rejects(db.query(`UPDATE finance_records SET ${change} WHERE id=$1`,[id(20)]),/Payment records cannot be edited or deleted/,change);
  await assert.rejects(db.query("UPDATE finance_records SET kind='Other income' WHERE id=$1",[id(20)]),/Payment records cannot be edited or deleted/);
  await assert.rejects(db.query('DELETE FROM finance_records WHERE id=$1',[id(20)]),/Payment records cannot be edited or deleted/);
  // Its business changes like any transaction's.
  assert.equal((await rows('SELECT set_transaction_business($1,$2) AS n',[[id(20)],id(14)]))[0].n,1);
  assert.equal((await rows('SELECT business_id FROM finance_records WHERE id=$1',[id(20)]))[0].business_id,id(14));
  assert.equal(await value(13),99600);assert.equal(await value(10),3400);

  // A transfer fee (account operation) and a tracker expense and income.
  await db.query("SELECT planning_action('transfer',$1)",[{id:id(21),account_id:id(10),target_id:id(12),amount:100,received:100,fee:5,date:today,notes:''}]);
  const fee=(await rows('SELECT id FROM finance_records WHERE operation_id=$1',[id(21)]))[0].id;
  assert.deepEqual((await db.query('SELECT recategorize_transactions($1,$2,$3) AS c',[[fee],'Charity',null])).rows[0].c,[fee]);
  await assert.rejects(db.query('UPDATE finance_records SET amount=1 WHERE id=$1',[fee]),/Account operation fees cannot be edited or deleted/);
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(22),id(14),'expense',today,50,null,'Feed']);
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(23),id(14),'income',today,300,null,'Wool']);
  assert.deepEqual(await recategorize([22],'Other expense',id(40)),[id(22)]);
  assert.deepEqual(await recategorize([22],'Living expense'),[id(22)]);
  // A linked income keeps its built-in kind; a custom category of its direction is fine.
  assert.deepEqual(await category(23),['Other income',null]);
  assert.deepEqual(await recategorize([23],'Salary'),[]);
  assert.deepEqual(await recategorize([23],'Other income',id(41)),[id(23)]);
  await assert.rejects(db.query('UPDATE finance_records SET amount=1 WHERE id=$1',[id(22)]),/Tracked cash movements cannot be edited or deleted/);
  await assert.rejects(db.query('UPDATE finance_records SET business_id=NULL WHERE id=$1',[id(23)]),/Tracked cash movements cannot be edited or deleted|business/i);
  // Deleting a recategorized payment still undoes it, and restore puts it back in its category.
  await db.query('SELECT delete_linked_transaction($1)',[id(20)]);
  assert.equal(await value(13),100000);
  await db.query('SELECT restore_deleted_item((SELECT id FROM deleted_items WHERE data->>\'id\'=$1))',[id(20)]);
  assert.deepEqual(await category(20),['Other expense',id(40)]);assert.equal(await value(13),99600);
 }finally{await db.close();}
});

test('a new mortgage payment starts in the category of the latest one',{skip},async()=>{
 const {db,rows,today,pay,category,recategorize}=await workspace();
 try{
  await pay(20,400,1200);
  assert.deepEqual(await category(20),['Other expense',null]);
  await recategorize([20],'Other expense',id(40));
  await pay(21,100,50);
  assert.deepEqual(await category(21),['Other expense',id(40)]);
  await recategorize([21],'Living expense');
  // A payment from a sum account, through the dated-rate path, inherits too.
  await db.query('SELECT record_investment_with_fx($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id(22),id(13),'mortgage_payment',today,30,null,'',id(11),0.0001,today,'UZS','USD',10,20]);
  assert.deepEqual(await category(22),['Living expense',null]);
  // Another mortgage has its own history.
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES($1,$2,'Cabin','Mortgage','USD',5000,$3)",[id(15),owner,today]);
  await db.query("SELECT planning_action('mortgage',$1)",[{id:id(23),account_id:id(10),target_id:id(15),amount:10,received:0,fee:1,date:today,notes:''}]);
  assert.deepEqual(await category(23),['Other expense',null]);
  assert.equal((await rows('SELECT count(*)::int AS n FROM finance_records WHERE mortgage_payment_id IS NOT NULL'))[0].n,4);
 }finally{await db.close();}
});

test('editing a mortgage payment moves the balances exactly, keeps what described it and leaves no trace of a delete',{skip},async()=>{
 const {db,as,rows,today,value,pay,category,recategorize}=await workspace();
 try{
  const edit=(n,data)=>db.query('SELECT edit_mortgage_payment($1,$2)',[id(n),{account_id:id(10),date:today,notes:'',...data}]);
  await pay(19,1000,500);
  await pay(20,400,1200,10,'November');
  await recategorize([20],'Other expense',id(40));
  await db.query('SELECT set_transaction_business($1,$2)',[[id(20)],id(14)]);
  await db.query("INSERT INTO transaction_tags(id,user_id,name,color) VALUES($1,$2,'Home','teal')",[id(50),owner]);
  await db.query('SELECT set_transaction_tags($1,$2,$3)',[[id(20)],[id(50)],[]]);
  const history=()=>rows("SELECT record_id,event_type,amount::float8,balance::float8,principal::float8 FROM investment_history WHERE event_type<>'baseline' ORDER BY record_id,created_at,event_type,balance");
  assert.equal(await value(13),98600);assert.equal(await value(10),1900);

  // More principal, less interest, another note.
  await edit(20,{principal:500,interest:1000,notes:'Corrected'});
  assert.equal(await value(13),98500);assert.equal(await value(10),2000);
  const [row]=await rows('SELECT name,kind,custom_category_id,business_id,amount::float8,payment_principal::float8,payment_interest::float8,notes,date::text FROM finance_records WHERE id=$1',[id(20)]);
  assert.deepEqual(row,{name:'Home',kind:'Other expense',custom_category_id:id(40),business_id:id(14),amount:1500,payment_principal:500,payment_interest:1000,notes:'Corrected',date:today});
  assert.deepEqual(await rows('SELECT tag_id FROM transaction_tag_links WHERE record_id=$1',[id(20)]),[{tag_id:id(50)}]);
  assert.deepEqual((await rows('SELECT principal::float8,interest::float8,notes FROM mortgage_payments WHERE id=$1',[id(20)]))[0],{principal:500,interest:1000,notes:'Corrected'});
  assert.deepEqual((await rows('SELECT amount::float8,fee::float8,after_balance::float8 FROM account_activity WHERE id=$1',[id(20)]))[0],{amount:500,fee:1000,after_balance:2000});
  assert.equal((await rows('SELECT count(*)::int AS n FROM deleted_items'))[0].n,0);
  assert.equal((await rows('SELECT count(*)::int AS n FROM deleted_tracker_updates'))[0].n,0);
  // The history reads as if the payment had been recorded this way: no balance updates from the undo.
  assert.deepEqual(await history(),[
   {record_id:id(10),event_type:'valuation',amount:0,balance:3500,principal:0},
   {record_id:id(10),event_type:'valuation',amount:0,balance:2000,principal:0},
   {record_id:id(13),event_type:'mortgage_payment',amount:1500,balance:99000,principal:1000},
   {record_id:id(13),event_type:'valuation',amount:0,balance:99000,principal:0},
   {record_id:id(13),event_type:'mortgage_payment',amount:1500,balance:98500,principal:500},
   {record_id:id(13),event_type:'valuation',amount:0,balance:98500,principal:0},
  ]);

  // Paid from another account in the same currency: the first gets its money back.
  await edit(20,{principal:500,interest:1000,account_id:id(12)});
  assert.equal(await value(10),3500);assert.equal(await value(12),7500);assert.equal(await value(13),98500);
  // Paid from a sum account at the dated rate the server passes.
  await edit(20,{principal:500,interest:1000,account_id:id(11),rate:0.0001,rate_date:today});
  assert.equal(await value(12),9000);assert.equal(await value(11),35000000);assert.equal(await value(13),98500);
  assert.deepEqual(await category(20),['Other expense',id(40)]);
  // And back to dollars.
  await edit(20,{principal:400,interest:1200});
  assert.equal(await value(11),50000000);assert.equal(await value(10),1900);assert.equal(await value(13),98600);

  // What cannot be paid changes nothing at all.
  const snapshot=async()=>JSON.stringify([await rows("SELECT to_jsonb(r)-'revision' AS r FROM finance_records r ORDER BY id"),await rows('SELECT to_jsonb(h) AS h FROM investment_history h ORDER BY id'),await rows('SELECT to_jsonb(a) AS a FROM account_activity a ORDER BY id'),await rows('SELECT to_jsonb(m) AS m FROM mortgage_payments m ORDER BY id'),await rows('SELECT to_jsonb(l) AS l FROM transaction_tag_links l'),await rows('SELECT count(*) FROM deleted_items')]);
  const before=await snapshot();
  await assert.rejects(edit(20,{principal:400,interest:50000}),/./);
  await assert.rejects(edit(20,{principal:999999,interest:0}),/./);
  await assert.rejects(edit(20,{principal:0,interest:0}),/Check the payment fields/);
  await assert.rejects(edit(20,{principal:1,interest:1,account_id:id(13)}),/Choose one of your cash accounts/);
  await assert.rejects(edit(10,{principal:1,interest:1}),/Payment not found/);
  assert.equal(await snapshot(),before);

  // Someone else cannot edit it.
  await as(stranger);
  await assert.rejects(edit(20,{principal:1,interest:1}),/Payment not found/);
  await as(owner);
  assert.equal(await snapshot(),before);
  // An edited payment still deletes and restores as one action.
  await db.query('SELECT delete_linked_transaction($1)',[id(20)]);
  assert.equal(await value(13),99000);assert.equal(await value(10),3500);
  await db.query('SELECT restore_deleted_item((SELECT id FROM deleted_items WHERE data->>\'id\'=$1))',[id(20)]);
  assert.equal(await value(13),98600);assert.equal(await value(10),1900);
 }finally{await db.close();}
});
