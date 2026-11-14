import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { goalSummary, goalStatus } = loadTS('lib/goal-projection.ts');
const { demoGoals, demoRecords } = loadTS('lib/demo-finance.ts');

test('a goal page heads with progress, what is left, and a whole monthly amount that finishes on time', () => {
 const goal = { target: 10000, target_date: '2027-12-02', monthly_contribution: 400, funding_monthly: null };
 assert.deepEqual(goalSummary(goal, 4200, '2026-10-02'), { percent: 42, left: 5800, monthsLeft: 14, needed: 415, monthly: 400 });
 assert.equal(goalSummary(goal, 12000, '2026-10-02').left, 0);
 assert.equal(goalSummary(goal, 12000, '2026-10-02').percent, 100);
 assert.equal(goalSummary(goal, 12000, '2026-10-02').needed, 0);
 assert.equal(goalSummary({ ...goal, target_date: '2026-10-20' }, 4200, '2026-10-02').needed, 5800, 'the last month needs the whole remainder');
 assert.equal(goalSummary({ ...goal, target_date: '2025-01-01' }, 4200, '2026-10-02').monthsLeft, 0);
 assert.deepEqual(goalSummary({ ...goal, target_date: null }, null, '2026-10-02'), { percent: null, left: null, monthsLeft: null, needed: null, monthly: 400 });
 assert.equal(goalSummary({ ...goal, funding_monthly: 250 }, 0, '2026-10-02').monthly, 250, 'the funding plan wins over the old monthly field');
});

test('sample savings goals reserve money in the sample savings account and stay within it', () => {
 const today = '2026-10-02', goals = demoGoals(today).filter(goal => goal.kind === 'savings');
 const savings = demoRecords(today).find(record => record.id === 'demo-savings');
 assert.ok(goals.length && goals.every(goal => goal.account_id === savings.id && goal.allocated < goal.target && goal.target_date > today));
 assert.ok(goals.reduce((sum, goal) => sum + goal.allocated, 0) <= savings.amount);
});

test('goal status pills: completed, on track when the planned monthly amount covers what is needed, at risk otherwise', () => {
 const goal = { target: 10000, target_date: '2027-12-02', monthly_contribution: 415, funding_monthly: null };
 const status = (overrides, current = 4200, today = '2026-10-02') => goalStatus(goalSummary({ ...goal, ...overrides }, current, today));
 assert.equal(status({}), 'on_track', '415 a month covers 5,800 over 14 months');
 assert.equal(status({ monthly_contribution: 414 }), 'at_risk', 'one short of the whole monthly amount needed');
 assert.equal(status({ monthly_contribution: 100, funding_monthly: 500 }), 'on_track', 'the funding plan amount wins over the planner contribution');
 assert.equal(status({}, 10000), 'completed');
 assert.equal(status({ target_date: null }, 10000), 'completed', 'a reached goal is complete even without a date');
 assert.equal(status({ target_date: null }), null, 'no date, no pace to judge');
 assert.equal(status({}, null), null, 'unknown current value');
 assert.equal(status({ target_date: '2025-01-01', monthly_contribution: 1e9 }), 'at_risk', 'the target date passed before the goal was reached');
});

test('the selected goal projects to the day it reaches the target, past its date when late, never for nothing going in', () => {
 const { goalPath } = loadTS('lib/goal-projection.ts');
 const goal = { target: 50000, target_date: '2028-01-14', annual_return: 0 };
 const onTime = goalPath(goal, 22000, 2000, '2026-11-14');
 assert.equal(onTime.reachesOn, '2028-01-14', '14 contributions of 2,000 cover 28,000');
 assert.equal(onTime.points[0].date, '2026-11-14');
 assert.equal(onTime.points.at(-1).projected, 50000);
 const late = goalPath(goal, 22000, 1000, '2026-11-14');
 assert.equal(late.reachesOn, '2029-03-14', 'the line runs past the target date to the day it is reached');
 assert.equal(late.points.at(-1).date, '2029-03-14');
 const early = goalPath({ ...goal, target_date: '2029-11-14' }, 22000, 4000, '2026-11-14');
 assert.equal(early.reachesOn, '2027-06-14');
 assert.equal(early.points.at(-1).date, '2029-11-14', 'an early arrival still draws to the target date');
 assert.equal(goalPath(goal, 22000, 0, '2026-11-14').reachesOn, null);
 assert.equal(goalPath({ ...goal, target_date: null }, 22000, 0, '2026-11-14').points.length, 1);
 assert.equal(goalPath(goal, 50000, 0, '2026-11-14').reachesOn, '2026-11-14', 'already reached');
 assert.equal(goalPath(goal, null, 2000, '2026-11-14'), null);
});

test('a cash goal’s saved line takes each day’s closing balance from its activity, oldest first', () => {
 const { goalBalanceHistory } = loadTS('lib/goal-funding.ts');
 const events = [
  { id: 'c', goal_id: 'g', occurred_on: '2026-10-01', balance: 3000 },
  { id: 'b', goal_id: 'g', occurred_on: '2026-10-01', balance: 2500 },
  { id: 'x', goal_id: 'other', occurred_on: '2026-09-15', balance: 99 },
  { id: 'a', goal_id: 'g', occurred_on: '2026-09-01', balance: 2000 },
  { id: 'old', goal_id: 'g', occurred_on: '2025-01-01', balance: 10 },
 ];
 assert.deepEqual(goalBalanceHistory(events, 'g', '2025-11-14'), [{ date: '2026-09-01', value: 2000 }, { date: '2026-10-01', value: 3000 }]);
});
