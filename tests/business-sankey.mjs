import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRenderer, event, hostModule, stubs } from './helpers/component-tree.mjs';
import { loadTS } from './helpers/load-ts.mjs';
import { chartPart, recharts } from './helpers/recharts-stub.mjs';

const h = React.createElement;
const { formatMoney, formatSignedMoney } = loadTS('lib/format.ts');
const usd = amount => formatMoney(amount, 'USD', 'en-US');
const node = (name, kind, owner, drill = null) => ({ name, kind, owner, drill });
// The bakery's sales flow into the bakery, which pays for supplies and passes its profit to household income; the
// salary joins it there, and the household pays rent and keeps the rest.
const data = {
 nodes: [
  node('Sales', 'income', 'bakery', { direction: 'income', category: 'Sales', business: 'bakery' }), node('Bakery', 'business', 'bakery', { business: 'bakery' }),
  node('Supplies', 'expense', 'bakery', { direction: 'expense', category: 'Supplies', business: 'bakery' }), node('Salary', 'income', null, { direction: 'income', category: 'Salary', business: null }),
  node('Total income', 'total', null), node('Rent', 'expense', null, { direction: 'expense', category: 'Rent', business: null }), node('Kept', 'savings', null, { savings: 1100 }),
 ],
 links: [{ source: 0, target: 1, value: 900 }, { source: 1, target: 2, value: 300 }, { source: 1, target: 4, value: 600 }, { source: 3, target: 4, value: 2000 }, { source: 4, target: 5, value: 1500 }, { source: 4, target: 6, value: 1100 }],
};
const pnl = { household: null, businesses: [{ id: 'bakery', net: 600 }], totalIncome: 2600, net: 1100 };
const names = { business: owner => owner ? 'Bakery shop' : 'Household' };

function chart(props = {}) {
 const r = createRenderer(), drills = [];
 const { BusinessSankeyChart } = r.load('components/reports/business-sankey.tsx', {
  ...stubs().modules, recharts, 'lucide-react': hostModule(),
  '@/components/business-reports': { attributeColor: (attribute, key) => `color:${attribute}:${key}` },
  '@/components/presentation-foundation/empty-state': { EmptyState: ({ description }) => h('p', { className: 'empty' }, description) },
 });
 r.mount(h(BusinessSankeyChart, { data, pnl, names, currency: 'USD', onDrill: drill => drills.push(drill), ...props }));
 const sankey = () => chartPart(r, 'Sankey').props;
 return { r, drills, sankey, drawNode: (index, box = { x: 100, y: 40, width: 10, height: 20 }) => sankey().node({ ...box, index, payload: { name: data.nodes[index].name, value: 900 } }) };
}
const svgText = element => [].concat(element.props.children).filter(Boolean).filter(child => child.type === 'text');

test('nothing recorded in the period reads as an empty state, not an empty chart', () => {
 const { r } = chart({ data: { nodes: [], links: [] } });
 assert.equal(r.html(), '<p class="empty">Nothing recorded in this period.</p>');
});

test('the legend names each earner in its colour and what was kept in green', () => {
 const { r } = chart();
 const legend = r.all(element => element.type === 'li').map(item => [item.children.join(''), item.props.style['--flow']]);
 assert.deepEqual(legend, [['Household', 'color:business:household'], ['Bakery shop', 'color:business:bakery'], ['Kept', 'var(--positive)']], 'the household first, then each business');
 const container = chartPart(r, 'ResponsiveContainer').props;
 assert.equal(container.height, 300, 'a short chart keeps its minimum height');
 assert.ok(container.minWidth > 0);
});

test('a business node carries its net on a second line; a source labels to its left and a target to its right', () => {
 const { drawNode } = chart();
 const business = drawNode(1);
 const [label, net] = svgText(business);
 assert.equal(label.props.children, `Bakery · ${usd(900)}`);
 assert.equal(label.props.dy, '-0.25em');
 assert.equal(net.props.children, `Net ${formatSignedMoney(600, 'USD', 'en-US')}`);
 assert.equal(net.props['data-tone'], undefined);
 assert.equal(label.props.textAnchor, 'start');
 assert.equal(label.props.x, 118, 'a node with a flow into it labels on its right');
 const source = svgText(drawNode(0))[0].props;
 assert.deepEqual([source.textAnchor, source.x, source.dy], ['end', 92, '0.35em']);
 assert.equal(drawNode(6).props.children[0].props.fill, 'var(--positive)');
 assert.equal(drawNode(0).props.children[0].props.fill, 'color:business:bakery');
 const tiny = drawNode(5, { x: 0, y: 0, width: 10, height: 0.5 });
 assert.equal(tiny.props.children[0].props.height, 2, 'a sliver stays visible');
});

test('a loss reads in red and a node without a drill is not a button', () => {
 const losing = chart({ pnl: { ...pnl, businesses: [{ id: 'bakery', net: -250 }] } });
 assert.equal(svgText(losing.drawNode(1))[1].props['data-tone'], 'negative');
 const total = losing.drawNode(4).props;
 assert.deepEqual([total.role, total.tabIndex, total.onClick, total['aria-label']], [undefined, undefined, undefined, undefined]);
 const loss = chart({ data: { nodes: [node('Sales', 'income', 'bakery'), node('Loss', 'loss', 'bakery')], links: [{ source: 0, target: 1, value: 10 }] } });
 assert.equal(loss.drawNode(1).props.children[0].props.fill, 'var(--negative)');
});

test('pressing or tapping a node narrows the transactions to it', () => {
 const { drills, drawNode } = chart();
 const rent = drawNode(5).props;
 assert.deepEqual([rent.role, rent.tabIndex, rent['aria-label']], ['button', 0, `Rent · ${usd(900)}`]);
 rent.onClick();
 const enter = event({ key: 'Enter' }), space = event({ key: ' ' }), tab = event({ key: 'Tab' });
 rent.onKeyDown(enter); rent.onKeyDown(space); rent.onKeyDown(tab);
 assert.ok(enter.defaultPrevented && space.defaultPrevented && !tab.defaultPrevented);
 assert.deepEqual(drills, [data.nodes[5].drill, data.nodes[5].drill, data.nodes[5].drill]);
});

test('a flow is coloured by which way the money moves and opens its target, or its source when the target has no drill', () => {
 const { sankey, drills } = chart();
 const draw = index => sankey().link({ sourceX: 10, targetX: 90, sourceY: 5, targetY: 25, sourceControlX: 40, targetControlX: 60, linkWidth: 0.2, index }).props;
 const supplies = draw(1);
 assert.equal(supplies.d, 'M10,5 C40,5 60,25 90,25');
 assert.equal(supplies.strokeWidth, 1, 'a thin flow stays visible');
 assert.deepEqual([0, 1, 2, 3, 4, 5].map(index => draw(index)['data-tone']), ['income', 'expense', 'income', 'income', 'expense', 'savings']);
 supplies.onClick();
 // Bakery → Total income: the total has no drill, so the flow opens the bakery.
 draw(2).onClick();
 assert.deepEqual(drills, [data.nodes[2].drill, data.nodes[1].drill]);
 assert.equal(draw(1)['data-clickable'], true);
});

test('the tooltip names a flow from where to where, whichever way recharts wraps it', () => {
 const { r } = chart();
 const { formatter } = chartPart(r, 'Tooltip').props;
 const flow = { source: { name: 'Bakery' }, target: { name: 'Supplies' } };
 assert.deepEqual(formatter(300, 'x', { payload: flow }), [usd(300), 'Bakery → Supplies']);
 assert.deepEqual(formatter(300, 'x', { payload: { payload: flow } }), [usd(300), 'Bakery → Supplies']);
 assert.deepEqual(formatter(900, 'Sales', { payload: { name: 'Sales' } }), [usd(900), 'Sales'], 'a node names itself');
 assert.deepEqual(formatter(900, 'Sales', undefined), [usd(900), 'Sales']);
});
