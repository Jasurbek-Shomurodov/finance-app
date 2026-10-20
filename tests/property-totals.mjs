import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';

const { paymentProperty, propertyTotals } = loadTS('lib/property-totals.ts');
const { demoWorkspace } = loadTS('lib/demo-finance.ts');

const entry = (id, kind, amount, extra = {}) => ({ id, name: id, kind, amount, currency: 'USD', quantity: 1, cost: 0, rate: 0, date: '2026-05-10', frequency: 'Once', notes: '', ...extra });

test('a property counts its rent and its costs this year, linked by ids only', () => {
 const records = [
  entry('flat', 'Property', 200000), entry('house', 'Property', 300000, { currency: 'UZS' }),
  entry('rent-plan', 'Rent income', 1200, { frequency: 'Monthly', income_source_id: 'flat', date: '2026-01-01' }),
  entry('rent-may', 'Rent income', 1200, { occurrence_record_id: 'rent-plan' }),
  entry('rent-direct', 'Rent income', 300, { income_source_id: 'flat', date: '2026-02-01' }),
  entry('boiler', 'Other expense', 450.6, { property_id: 'flat' }),
  entry('tax-bill', 'Other expense', 900, { frequency: 'Yearly', property_id: 'flat', date: '2026-01-01' }),
  entry('tax-paid', 'Other expense', 900, { occurrence_record_id: 'tax-bill', date: '2026-03-01' }),
  entry('last-year', 'Other expense', 5000, { property_id: 'flat', date: '2025-12-31' }),
  entry('same-name', 'Other expense', 70, { name: 'flat' }),
  entry('sum-repair', 'Living expense', 1250000, { property_id: 'house', currency: 'UZS' }),
  entry('gone', 'Other expense', 10, { property_id: 'sold-flat' }),
 ];
 const byId = new Map(records.map(record => [record.id, record]));
 assert.equal(paymentProperty(byId.get('rent-may'), byId), 'flat');
 assert.equal(paymentProperty(byId.get('tax-paid'), byId), 'flat');
 assert.equal(paymentProperty(byId.get('same-name'), byId), null);
 const totals = propertyTotals(records, '2026-01-01', '2026-10-19', 'USD', { USD: 1, UZS: 12500 });
 assert.deepEqual(totals.get('flat'), { income: 1500, costs: 1350.6, missing: 0 }, 'the precise amounts stay; display rounds them');
 assert.deepEqual(totals.get('house'), { income: 0, costs: 100, missing: 0 });
 assert.equal(totals.has('sold-flat'), false);
 const noRate = propertyTotals(records, '2026-01-01', '2026-10-19', 'USD', null);
 assert.deepEqual(noRate.get('house'), { income: 0, costs: 0, missing: 1 }, 'a sum without a rate is missing, never counted as dollars');
});

test('the sample workspace\'s rentals pay for their condo and studio', () => {
 const today = '2026-10-19';
 const { records } = demoWorkspace(today);
 const totals = propertyTotals(records, '2026-01-01', today, 'USD', { USD: 1 });
 assert.ok(totals.get('demo-condo').income > 0 && totals.get('demo-condo').costs > 0);
 assert.ok(totals.get('demo-studio').costs > 0);
});

test('a transaction names the property it was paid for or received from, by id, also through its schedule',()=>{
 const {propertyNameOf}=loadTS('lib/property-totals.ts');
 const row=(id,kind,extra={})=>({id,name:id,kind,amount:1,currency:'USD',frequency:'Once',date:'2026-10-01',notes:'',quantity:1,cost:0,rate:0,...extra});
 const condo=row('condo','Property',{name:'Lakeside condo'}),records=[condo,row('bill','Other expense',{frequency:'Monthly',property_id:'condo'}),row('car','Vehicle')];
 assert.equal(propertyNameOf(row('fix','Other expense',{property_id:'condo'}),records),'Lakeside condo');
 assert.equal(propertyNameOf(row('rent','Rent income',{income_source_id:'condo'}),records),'Lakeside condo');
 assert.equal(propertyNameOf(row('paid','Other expense',{occurrence_record_id:'bill'}),records),'Lakeside condo','through the bill it pays');
 assert.equal(propertyNameOf(row('x','Other expense',{property_id:'car'}),records),undefined,'only a property is named');
 assert.equal(propertyNameOf(row('lunch','Living expense'),records),undefined);
});
