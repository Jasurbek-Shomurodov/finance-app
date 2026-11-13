import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const migration=fs.readFileSync('migrations/162_price_alerts.sql','utf8');
const {workspacePreferenceSchema,maxPriceAlerts}=loadTS('lib/workspace-preferences.ts');
const id=n=>`e1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('migration 162 is in setup.sql and lets the price_alerts preference through the key check',()=>{
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration));
 assert.match(migration,/'removed_categories','price_alerts'\)\);/);
 assert.match(migration,/'schema_version',162/);
 // Every key the app can save is a key the database accepts.
 const allowed=migration.match(/CHECK\(key IN \(([^)]*)\)/)[1].split(',').map(key=>key.replaceAll("'",''));
 const saved=workspacePreferenceSchema.options.map(option=>option.shape.key.value);
 assert.deepEqual(saved.filter(key=>!allowed.includes(key)),[]);
});

test('a price alert is a holding, a direction and a positive price; the list is bounded',()=>{
 const alert={id:id(1),record_id:id(2),direction:'above',price:70000,reached_on:null};
 const parse=items=>workspacePreferenceSchema.safeParse({key:'price_alerts',data:{items}}).success;
 assert.ok(parse([alert]));assert.ok(parse([{...alert,reached_on:'2026-11-14'}]));assert.ok(parse([]));
 assert.ok(!parse([{...alert,price:0}]));assert.ok(!parse([{...alert,direction:'sideways'}]));assert.ok(!parse([{...alert,record_id:'btc'}]));assert.ok(!parse([{...alert,reached_on:'14.11.2026'}]));
 assert.ok(!parse(Array.from({length:maxPriceAlerts+1},(_,index)=>({...alert,id:id(index+10)}))));
});
