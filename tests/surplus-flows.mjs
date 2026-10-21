import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {surplusFlows,surplusLines}=loadTS('lib/surplus-flows.ts');
const parts={estimatedIncome:0,otherIncome:13916,plannedIncome:13916,monthlyExpenses:2453,mortgagePayments:1600,loanPayments:0,forecast:9863};

test('the surplus Sankey runs income into one total and out to spending, payments and what is left',()=>{
 const flows=surplusFlows(parts,key=>key);
 assert.deepEqual(flows.nodes.map(node=>[node.name,node.kind]),[['Other recurring income','income'],['Income','total'],['Expenses','expense'],['Estimated mortgage payments','debt'],['Left after expenses','savings']]);
 assert.deepEqual(flows.links.map(link=>[link.source,link.target,link.value]),[[0,1,13916],[1,2,2453],[1,3,1600],[1,4,9863]]);
 // What comes in equals what goes out.
 const sum=side=>flows.links.filter(link=>side(link)).reduce((total,link)=>total+link.value,0);
 assert.equal(sum(link=>link.target===1),sum(link=>link.source===1));
});

test('spending above income shows a shortfall coming in, and no surplus going out',()=>{
 const {incoming,outgoing}=surplusLines({...parts,otherIncome:1000,plannedIncome:1000,monthlyExpenses:1500,mortgagePayments:0,forecast:-500});
 assert.deepEqual(incoming.map(line=>[line.key,line.amount]),[['Other recurring income',1000],['Shortfall',500]]);
 assert.deepEqual(outgoing.map(line=>[line.key,line.amount]),[['Expenses',1500]]);
 assert.deepEqual(surplusFlows({estimatedIncome:0,otherIncome:0,plannedIncome:0,monthlyExpenses:0,mortgagePayments:0,loanPayments:0,forecast:0},key=>key).links,[]);
});

test('with a goal plan, the surplus splits into planned goal funding and what stays unassigned',()=>{
 assert.deepEqual(surplusLines(parts,4000).outgoing.map(line=>[line.key,line.amount]),[['Expenses',2453],['Estimated mortgage payments',1600],['Planned goal funding',4000],['Unassigned monthly surplus',5863]]);
 assert.deepEqual(surplusLines(parts,20000).outgoing.slice(-1).map(line=>[line.key,line.amount]),[['Planned goal funding',9863]],'a plan above the surplus uses all of it');
});

test('the surplus dialog draws the Sankey and writes out the sum; the figure opens it only when its parts are known',async()=>{
 const React=(await import('react')).default;
 const {renderToStaticMarkup}=await import('react-dom/server');
 const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
 const host=name=>{const Host=({children,...props})=>React.createElement('div',{'data-host':name,...(props.flows?{'data-links':props.flows.links.length}:{})},children);Host.displayName=name;return Host;};
 const {SurplusBreakdownDialog}=loadTS('components/surplus-breakdown.tsx',{'@/components/language-provider':language,'@/components/cash-flow-sankey':{FlowSankey:host('FlowSankey')},'@/components/ui/dialog':{Dialog:host('Dialog'),DialogContent:host('DialogContent'),DialogTitle:host('DialogTitle')}});
 const html=renderToStaticMarkup(React.createElement(SurplusBreakdownDialog,{parts,currency:'USD',goalFunding:4000,onClose(){}}));
 assert.match(html,/Monthly surplus <span class="panel-figure">\$9,863<\/span>/);
 assert.match(html,/data-host="FlowSankey" data-links="5"/);
 assert.match(html,/<dt>Other recurring income<\/dt><dd class="positive">\$13,916<\/dd>.*<dt>Expenses<\/dt><dd>−\$2,453<\/dd>.*<dt>Estimated mortgage payments<\/dt><dd>−\$1,600<\/dd>.*<dt>Left after expenses<\/dt><dd class="positive">\$9,863<\/dd>.*<dt>Planned goal funding<\/dt><dd>−\$4,000<\/dd>.*<dt>Unassigned monthly surplus<\/dt><dd>\$5,863<\/dd>/);
 const {SurplusButton}=loadTS('components/surplus-button.tsx',{'@/components/language-provider':language,'@/components/cash-flow-drill-lazy':{SurplusBreakdownDialog:host('Dialog')}});
 assert.equal(renderToStaticMarkup(React.createElement(SurplusButton,{parts:null,currency:'USD'},'$1')),'<span>$1</span>');
 assert.equal(renderToStaticMarkup(React.createElement(SurplusButton,{parts,currency:'USD',className:'surplus-link'},'$9,863')),'<button type="button" class="surplus-button surplus-link" title="How is this calculated?">$9,863</button>');
});
