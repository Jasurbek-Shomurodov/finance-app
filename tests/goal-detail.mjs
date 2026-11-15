import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, stubs } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';
import { chartPart, recharts } from './helpers/recharts-stub.mjs';
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

test('the goal chart puts the first month, today and the last day on its axis, and the target as a level', () => {
 const r = createRenderer();
 const { GoalProjectionChart } = r.load('components/planning/goal-projection-chart.tsx', { recharts, ...stubs().modules });
 const { formatMoney } = loadTS('lib/format.ts');
 const time = day => Date.parse(day + 'T00:00:00Z');
 const points = [{ date: '2026-01-15', saved: 1000 }, { date: '2026-11-14', saved: 4200, projected: 4200 }, { date: '2027-12-02', projected: 9800 }];
 r.mount(React.createElement(GoalProjectionChart, { points, target: 10000, today: '2026-11-14', currency: 'USD', labels: { saved: 'Saved', projected: 'Projected' } }));
 assert.deepEqual(chartPart(r, 'ComposedChart').props.data.map(point => point.time), points.map(point => time(point.date)));
 const axis = chartPart(r, 'XAxis').props;
 assert.deepEqual(axis.ticks, [time('2026-01-15'), time('2026-11-14'), time('2027-12-02')]);
 // The edge labels hug the chart's sides; today sits in the middle.
 const tick = value => axis.tick({ x: 0, y: 0, payload: { value } }).props;
 assert.deepEqual([tick(axis.ticks[0]).children, tick(axis.ticks[0]).textAnchor], ['January 2026', 'start']);
 assert.deepEqual([tick(axis.ticks[1]).children, tick(axis.ticks[1]).textAnchor], ['Today', 'middle']);
 assert.deepEqual([tick(axis.ticks[2]).children, tick(axis.ticks[2]).textAnchor], ['2 December 2027', 'end']);
 assert.equal(chartPart(r, 'ReferenceLine').props.y, 10000);
 assert.ok(chartPart(r, 'YAxis').props.domain[1] >= 10000, 'the target fits on the axis');
 const tooltip = chartPart(r, 'Tooltip').props;
 assert.equal(tooltip.labelFormatter(time('2026-11-14')), '14 November 2026');
 assert.deepEqual(tooltip.formatter(4200, 'saved'), [formatMoney(4200, 'USD', 'en-US'), 'Saved']);
 assert.deepEqual(tooltip.formatter(9800, 'projected'), [formatMoney(9800, 'USD', 'en-US'), 'Projected']);
 // A goal with one point has a single tick, centred.
 r.mount(React.createElement(GoalProjectionChart, { points: [{ date: '2026-11-14', saved: 50 }], target: 100, today: '2026-11-14', currency: 'USD', labels: { saved: 'Saved', projected: 'Projected' } }));
 const single = chartPart(r, 'XAxis').props;
 assert.deepEqual(single.ticks, [time('2026-11-14')]);
 assert.equal(single.tick({ x: 0, y: 0, payload: { value: single.ticks[0] } }).props.textAnchor, 'middle');
});
