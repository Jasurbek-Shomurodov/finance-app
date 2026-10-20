import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {linkedValue,chooseLinked}=loadTS('lib/linked-asset.ts');

test('an expense links to one business or property through a single choice',()=>{
 assert.equal(linkedValue({business_id:null,property_id:null}),'');
 assert.equal(linkedValue({business_id:'shop',property_id:null}),'business:shop');
 assert.equal(linkedValue({business_id:'shop',property_id:'flat'}),'property:flat','the property is the more specific link');
 assert.deepEqual(chooseLinked('business:shop','rentals'),{business_id:'shop',property_id:null});
 assert.deepEqual(chooseLinked('property:flat','rentals'),{business_id:'rentals',property_id:'flat'},'a property keeps the business its account belongs to');
 assert.deepEqual(chooseLinked('property:flat'),{business_id:null,property_id:'flat'});
 assert.deepEqual(chooseLinked('','rentals'),{business_id:null,property_id:null});
});
