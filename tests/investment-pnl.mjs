import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {portfolioPnl,pnlPeriodStart}=loadTS('lib/investment-pnl.ts');
const record=(id,kind,amount,extra={})=>({id,name:id,kind,currency:'USD',amount,quantity:1,cost:0,...extra});
const event=(id,record_id,event_type,occurred_on,amount,balance=null)=>({id,record_id,event_type,occurred_on,created_at:occurred_on,amount,balance,ownership_percentage:100,principal:0,interest:0,notes:''});
const market={rates:{EUR:.5},quotes:{},errors:{},fx:null,stocksConfigured:false};
const today='2026-11-13';
const round=figures=>Object.fromEntries(Object.entries(figures).filter(([,value])=>typeof value==='number').map(([key,value])=>[key,Math.round(value*100)/100]));

test('a holding earns its price change plus income less costs, measured against the money put in',()=>{
 const records=[record('shares','Stock',150,{quantity:10,cost:100}),record('wallet','Cash',5000)];
 const events=[event('buy','shares','contribution','2026-01-10',1200,1200),event('sell','shares','withdrawal','2026-06-01',300,1000),event('div','shares','income','2026-07-01',40),event('fee','shares','expense','2026-07-02',10),event('pay','wallet','valuation','2026-07-02',0,5000)];
 const movements=[{id:'m',kind:'sell',source_id:'shares',target_id:'wallet',source_value:300,target_value:300,occurred_on:'2026-06-01',realized_gain:60}];
 const result=portfolioPnl({records,events,movements,market,currency:'USD',today},null);
 assert.equal(result.rows.length,1,'cash is not an investment');
 // 1,500 held + 300 taken out − 1,200 paid = 600 of price change; 40 of dividends less 10 of fees.
 assert.deepEqual(round(result.rows[0]),{invested:1200,withdrawn:300,value:1500,price:600,realized:60,income:40,costs:10,total:630,returnPercent:52.5});
 assert.deepEqual(round(result.totals),round(result.rows[0]));
 assert.deepEqual(result.points,[{date:'2026-01-10',total:0},{date:'2026-06-01',total:100},{date:'2026-07-01',total:140},{date:'2026-07-02',total:130},{date:today,total:630}]);
 assert.deepEqual(result.missing,[]);
});

test('a value recorded without a purchase is money invested, and capitalized interest is income rather than price',()=>{
 const records=[record('flat','Property',120000),record('deposit','Deposit',1100)];
 const events=[event('base','flat','baseline','2025-03-01',0,100000),event('repair','flat','contribution','2026-02-01',5000,105000),event('open','deposit','contribution','2026-01-05',1000,1000),event('interest','deposit','income','2026-06-30',100,1100)];
 const movements=[{id:'i',kind:'interest',source_id:'deposit',target_id:'deposit',source_value:0,target_value:100,occurred_on:'2026-06-30',realized_gain:null}];
 const result=portfolioPnl({records,events,movements,market,currency:'USD',today},null);
 const flat=result.rows.find(row=>row.id==='flat'),deposit=result.rows.find(row=>row.id==='deposit');
 assert.deepEqual([flat.invested,flat.price,flat.total],[105000,15000,15000]);
 assert.deepEqual([deposit.invested,deposit.price,deposit.income,deposit.total],[1000,0,100,100]);
 assert.equal(result.totals.total,15100);
});

test('a period starts from what the holding was worth that day',()=>{
 const records=[record('flat','Property',120000)];
 const events=[event('base','flat','baseline','2025-03-01',0,100000),event('year-end','flat','valuation','2025-12-20',0,110000),event('rent','flat','income','2025-12-21',900),event('rent2','flat','income','2026-03-01',700)];
 assert.equal(pnlPeriodStart('year',today),'2026-01-01');
 assert.equal(pnlPeriodStart('months',today),'2025-11-13');
 assert.equal(pnlPeriodStart('all',today),null);
 const year=portfolioPnl({records,events,market,currency:'USD',today},'2026-01-01').rows[0];
 assert.deepEqual([year.invested,year.price,year.income,year.total],[110000,10000,700,10700]);
 assert.equal(portfolioPnl({records,events,market,currency:'USD',today},null).rows[0].total,21600);
 assert.equal(portfolioPnl({records,events:[...events,event('later','flat','income','2027-01-01',5000)],market,currency:'USD',today},null).rows[0].total,21600,'future entries wait');
});

test('other currencies convert at today’s rate, and a holding without one is named instead of added',()=>{
 const records=[record('fund','Retirement account',300,{currency:'EUR'}),record('gold','Valuables',10,{currency:'XXX'})];
 const events=[event('in','fund','contribution','2026-01-01',200,200),event('g','gold','contribution','2026-01-01',5,5)];
 const result=portfolioPnl({records,events,market,currency:'USD',today},null);
 assert.deepEqual(result.missing,['gold']);
 assert.deepEqual(round(result.totals),{invested:400,withdrawn:0,value:600,price:200,realized:0,income:0,costs:0,total:200,returnPercent:50});
 assert.equal(portfolioPnl({records:[],events:[],market,currency:'USD',today},null).totals.returnPercent,null);
});

// The view: tiles, two charts and every holding's line, rendered without a browser.
import React from 'react';
import { byType, createRenderer, stubs, text } from './helpers/component-tree.mjs';
const h=React.createElement;
const history={records:[record('shares','Stock',150,{quantity:10,cost:100}),record('flat','Property',900)],events:[event('buy','shares','contribution','2026-01-10',1200,1200),event('div','shares','income','2026-07-01',40),event('base','flat','contribution','2026-02-01',1000,1000)]};

test('the Profit & loss view shows the period totals, both charts and one line per holding, and changes with the period',()=>{
 const r=createRenderer(),s=stubs();
 const chart=name=>Object.assign(props=>h('figure',{'data-chart':name,'data-count':(props.points??props.rows).length}),{displayName:name});
 const charts={PnlTrendChart:chart('trend'),PnlHoldingBars:chart('bars')};
 const {InvestmentPnl}=r.load('components/investment-pnl/investment-pnl.tsx',{...s.modules,'@/components/charts-lazy':charts,'lucide-react':{TrendingUp:()=>null},'@/components/presentation-foundation/category-icon':{CategoryIcon:({kind})=>h('i',{'data-kind':kind})}});
 const props={history,error:false,onRetry(){},currency:'USD',market,today};
 r.mount(h(InvestmentPnl,props));
 const rows=()=>r.all(node=>node.type==='tr').map(row=>text(row));
 assert.equal(rows().length,4,'a heading, two holdings and the total');
 assert.match(rows()[1],/shares.*\$1,200.*\$1,500.*\+\$300.*\$40.*\+\$340.*\+28\.3%/);
 assert.match(rows()[2],/flat.*−\$100.*−10%/);
 assert.match(rows()[3],/Total.*\$2,200.*\+\$240/);
 assert.equal(r.find(byType(charts.PnlTrendChart)).props.points.at(-1).total,240);
 assert.equal(r.find(byType(charts.PnlHoldingBars)).props.rows.length,2);
 assert.ok(!rows().some(row=>/\d{4}-\d{2}-\d{2}/.test(row)),'no stored dates');
 r.fire(r.find(node=>node.type==='button'&&text(node)==='All history'),'onClick');
 assert.equal(r.find(node=>node.type==='button'&&text(node)==='All history').props['aria-pressed'],true);
 r.mount(h(InvestmentPnl,{...props,history:null}));
 assert.equal(r.all(node=>node.type==='tr').length,0,'a placeholder while history loads');
 r.mount(h(InvestmentPnl,{...props,history:null,error:true}));
 assert.match(text(r.tree),/Could not load portfolio history\./);
 r.mount(h(InvestmentPnl,{...props,history:{records:[],events:[]}}));
 assert.match(text(r.tree),/Add your first asset/);
 r.mount(h(InvestmentPnl,{...props,history:{records:[record('gold','Valuables',10,{currency:'XXX'})],events:[]}}));
 assert.match(text(r.tree),/exchange rates are missing/);
});

test('the charts draw the running total around zero and one bar per holding, largest moves only',()=>{
 const pass=name=>Object.assign(({children})=>h('div',{'data-part':name},children),{displayName:name});
 const Cell=Object.assign(({fill})=>h('span',{'data-fill':fill}),{displayName:'Cell'});
 const recharts={...Object.fromEntries(['ResponsiveContainer','AreaChart','BarChart','CartesianGrid','XAxis','YAxis','Tooltip','ReferenceLine','Area','Bar'].map(name=>[name,pass(name)])),Cell};
 const r=createRenderer(),s=stubs();
 const {PnlTrendChart,PnlHoldingBars,pnlBarLimit}=r.load('components/investment-pnl/pnl-charts.tsx',{...s.modules,recharts});
 r.mount(h(PnlTrendChart,{points:[{date:'2026-01-10',total:0},{date:today,total:-50}],currency:'USD'}));
 const area=r.find(byType(recharts.Area));
 assert.equal(area.props.stroke,'var(--negative)');
 const axis=r.find(byType(recharts.XAxis)),tip=r.find(byType(recharts.Tooltip));
 assert.equal(axis.props.tickFormatter(Date.parse('2026-03-05T00:00:00Z')),'Mar');
 assert.equal(tip.props.labelFormatter(Date.parse('2026-03-05T00:00:00Z')),'5 March 2026');
 assert.deepEqual(tip.props.formatter(-50),['−$50','Gain/loss']);
 const rows=Array.from({length:10},(_,index)=>({id:'r'+index,name:'r'+index,kind:'Stock',total:(index-3)*100}));
 r.mount(h(PnlHoldingBars,{rows,currency:'USD'}));
 const cells=r.all(byType(Cell));
 assert.equal(cells.length,pnlBarLimit);
 assert.deepEqual([cells[0].props.fill,cells.at(-1).props.fill],['var(--positive)','var(--negative)']);
 assert.deepEqual(r.find(byType(recharts.Tooltip)).props.formatter(600),['+$600','Gain/loss']);
});
