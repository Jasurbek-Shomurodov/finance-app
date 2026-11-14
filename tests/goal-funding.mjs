import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {fundingPlan,fundingRoom,unassignedSurplus,planFundingLink,planFundingRequested}=loadTS('lib/goal-funding.ts');
const goal=(id,monthly,extra={})=>({id,name:id,kind:'savings',currency:'USD',funding_monthly:monthly,funding_enabled:true,funding_priority:10,target:1000,allocated:0,...extra});
test('one surplus is allocated by priority once across all goals with explicit shortfalls',()=>{
 const goals=[goal('b',80),goal('a',80)];const plan=fundingPlan(goals,100,'USD','2026-09-18');assert.deepEqual(plan.rows.map(row=>[row.goal.id,row.allocated,row.shortfall]),[['a',80,0],['b',20,60]]);assert.equal(plan.shortfall,60);assert.equal(plan.remaining,0);assert.equal(fundingRoom(goals,goals[0],100,'USD','2026-09-18'),20);
});
test('pauses, completion and refill targets release future funding without changing balances',()=>{
 const plan=fundingPlan([goal('paused',20,{paused_until:'2026-09-30'}),goal('archived',20,{archived:true}),goal('done',20,{completed_on:'2026-09-17'}),goal('refill',20,{funding_mode:'refill',completed_on:'2026-09-17'})],100,'USD','2026-09-18');assert.deepEqual(plan.rows.map(row=>row.goal.id),['refill']);assert.equal(plan.remaining,80);
});
test('unknown commitments or FX never appear as an affordable plan, and units are not treated as cash',()=>{
 assert.equal(fundingPlan([goal('eur',80,{currency:'EUR'})],100,'USD','2026-09-18').complete,false);
 assert.equal(fundingPlan([goal('unit',null,{kind:'investment',monthly_contribution:.1})],100,'USD','2026-09-18').requested,null);
 assert.equal(fundingPlan([goal('eur',80,{currency:'EUR'})],100,'USD','2026-09-18',{USD:1,EUR:.8}).requested,100);
 assert.equal(fundingPlan([goal('a',10)],null,'USD','2026-09-18').rows[0].allocated,null);
});
test('refill funding reserves only the unfilled savings target, retaining exact underlying amounts',()=>{
 const full=goal('full',100,{funding_mode:'refill',allocated:1000,completed_on:'2026-09-17'});assert.equal(fundingPlan([full],200,'USD','2026-09-18').requested,0);
 const partial={...full,allocated:999.75};const result=fundingPlan([partial],200,'USD','2026-09-18');assert.equal(result.requested,.25);assert.equal(result.remaining,199.75);
});
test('the planner offers each goal what the shared plan leaves after the goals funded before it',()=>{
 const first=goal('first',300,{funding_priority:1}),second=goal('second',100,{funding_priority:2}),unplanned=goal('idea',50,{funding_enabled:false});
 const goals=[second,unplanned,first];
 // The shared plan funds first with 300 and second with the remaining 50.
 assert.deepEqual(fundingPlan(goals,350,'USD','2026-09-18').rows.map(row=>[row.goal.id,row.allocated]),[['first',300],['second',50]]);
 assert.equal(fundingRoom(goals,first,350,'USD','2026-09-18'),350);
 assert.equal(fundingRoom(goals,second,350,'USD','2026-09-18'),50);
 // A goal outside the plan can only use what every funded goal leaves.
 assert.equal(fundingRoom(goals,unplanned,350,'USD','2026-09-18'),0);assert.equal(fundingRoom(goals,unplanned,500,'USD','2026-09-18'),100);
 assert.equal(fundingRoom(goals,second,-20,'USD','2026-09-18'),0);assert.equal(fundingRoom(goals,second,null,'USD','2026-09-18'),null);
 // An earlier goal in a currency without a rate leaves the room unknown; a later one does not matter.
 const foreign=goal('foreign',10,{currency:'EUR',funding_priority:1});
 assert.equal(fundingRoom([foreign,second],second,350,'USD','2026-09-18',{}),null);
 assert.equal(fundingRoom([{...foreign,funding_priority:3},second],second,350,'USD','2026-09-18',{}),350);
});

test('the unassigned surplus is what funded goals leave, and unknown rather than a guess',()=>{
 assert.equal(unassignedSurplus([goal('a',80),goal('b',50,{funding_enabled:false})],500,'USD','2026-09-18'),420,'only goals included in monthly funding take a share');
 assert.equal(unassignedSurplus([goal('a',80)],50,'USD','2026-09-18'),0,'a plan larger than the surplus leaves nothing, never a negative');
 assert.equal(unassignedSurplus([goal('a',80)],null,'USD','2026-09-18'),null,'no surplus known yet');
 assert.equal(unassignedSurplus([goal('a',80,{currency:'EUR'})],500,'USD','2026-09-18'),null,'a funded goal no rate converts');
 assert.equal(unassignedSurplus([],500,'USD','2026-09-18'),null,'no goal to fund');
 assert.equal(unassignedSurplus([goal('old',80,{archived:true})],500,'USD','2026-09-18'),null,'archived goals are not asked for funding');
});
test('Plan funding has an address of its own on Goals',()=>{
 assert.equal(planFundingLink,'/goals#plan-funding');
 assert.equal(planFundingRequested(new URL(planFundingLink,'https://app.test').hash),true);
 assert.equal(planFundingRequested(''),false);assert.equal(planFundingRequested('#forecast'),false);
});
