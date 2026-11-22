import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {createRenderer,hostModule,language,text,byType,byText,event,stubs,walk} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';

const h=React.createElement;
const save=loadTS('lib/record-save.ts');
const names=loadTS('lib/record-names.ts');
const suggestions=loadTS('lib/form-suggestions.ts');
const {expenses}=loadTS('lib/finance.ts');
const entry=(extra={})=>({id:'new',name:'',kind:'Other income',currency:'USD',amount:0,quantity:1,cost:0,rate:0,date:'2026-11-20',frequency:'Once',notes:'',...extra});
const wallet={id:'wallet',name:'Wallet',kind:'Cash',currency:'USD',amount:500,frequency:'Once',date:'2026-01-01',notes:''};
const planning=(data={},state={})=>({loading:false,error:'',...state,data:{records:[wallet],categories:[],...data}});
const host=names=>Object.fromEntries(names.map(name=>[name,hostModule()]));
/** A submit event on a form whose fields can be asked for and focused. */
function submitEvent(){
 const asked=[],focused=[];
 return {asked,focused,event:event({nativeEvent:{},currentTarget:{querySelector:selector=>{asked.push(selector);return {focus:()=>focused.push(selector)};}}})};
}

// ── The rules, apart from any form ─────────────────────────────────────────────────────────────────────────────────

test('Save and add another keeps an income’s source, plan or business with its name, and nothing of a plain income', () => {
 const receipt=save.anotherEntry(entry({id:'a',name:'EPAM',kind:'Salary',amount:1000,account_id:'wallet',earning_source_id:'epam',payment_type:'regular',earning_due_on:'2026-11-18',notes:'late'}));
 assert.notEqual(receipt.id,'a');
 assert.deepEqual([receipt.name,receipt.kind,receipt.earning_source_id,receipt.payment_type,receipt.earning_due_on,receipt.account_id,receipt.currency,receipt.date],['EPAM','Salary','epam','regular','2026-11-18','wallet','USD','2026-11-20']);
 assert.deepEqual([receipt.amount,receipt.notes,receipt.frequency],[0,'','Once']);
 const salary=save.anotherEntry(entry({name:'Day job',kind:'Salary',income_source_id:'plan',income_due_on:'2026-11-05'}));
 assert.deepEqual([salary.name,salary.income_source_id,salary.income_due_on],['Day job','plan','2026-11-05']);
 const business=save.anotherEntry(entry({name:'Shop',kind:'Business income',business_id:'shop'}));
 assert.deepEqual([business.name,business.business_id],['Shop','shop']);
 const plain=save.anotherEntry(entry({name:'Refund',custom_category_id:'gifts',amount:40}));
 assert.deepEqual([plain.name,plain.kind,plain.custom_category_id,plain.earning_source_id],['','Other income','gifts',undefined]);
 const expense=save.anotherEntry(entry({name:'Lunch',kind:'Other expense',business_id:'shop'}));
 assert.deepEqual([expense.name,expense.business_id],['',null],'an expense starts blank, as before');
});

test('each thing a form still needs is named for the field it belongs under', () => {
 assert.deepEqual(save.entryFieldProblems(entry()),{amount:'Enter an amount greater than zero.',account:'Choose a cash account.'});
 assert.deepEqual(save.entryFieldProblems(entry({amount:12,account_id:'wallet'})),{},'an amount and an account are enough: the name is optional');
 assert.deepEqual(save.entryFieldProblems(entry({amount:12,account_id:'wallet'}),{source:true}),{source:'Choose an income source.'});
 assert.deepEqual(save.entryFieldProblems(entry({amount:12,frequency:'Monthly',name:' '}),{name:true}),{name:'Enter a name.'},'a schedule needs a name and no account');
 assert.deepEqual(save.entryFieldProblems(entry({amount:12,frequency:'Monthly',name:'Rent'}),{name:true}),{});
 assert.deepEqual(save.entryFieldProblems(entry({kind:'Cash'})),{},'only income and expenses are checked');
});

test('past names are offered across the kinds asked for, with the latest record of each', () => {
 const rows=[
  entry({id:'1',name:'Coffee',kind:'Living expense',amount:4,date:'2026-11-01'}),
  entry({id:'2',name:'coffee ',kind:'Other expense',custom_category_id:'cafe',amount:6,date:'2026-11-10'}),
  entry({id:'3',name:'Coffee beans',kind:'Charity',amount:20,date:'2026-10-01'}),
  entry({id:'4',name:'Living expense',kind:'Living expense',amount:9,date:'2026-11-12'}),
  entry({id:'5',name:'Coffee',kind:'Salary',amount:1,date:'2026-11-15'}),
  entry({id:'6',name:'Coffee',kind:'Living expense',amount:300,record_count:3}),
 ];
 const own=names.matchingNames(rows,entry({kind:'Living expense',name:'cof'}));
 assert.deepEqual(own.map(match=>[match.name,match.count,match.last?.id]),[['Coffee',4,'1']],'by default only the record’s own kind; a summary row counts but has no last amount');
 const all=names.matchingNames(rows,entry({kind:'Other expense',name:'coffee'}),undefined,expenses);
 assert.deepEqual(all.map(match=>[match.name,match.count,match.exact,match.last?.id]),[['Coffee',5,true,'2'],['Coffee beans',1,false,'3']]);
 assert.deepEqual(names.matchingNames(rows,entry({kind:'Living expense',name:'living'}),undefined,expenses),[],'a category standing in for a name is not a name');
 assert.deepEqual(names.matchingNames(rows,entry({kind:'Living expense',name:' '}),undefined,expenses),[]);
 assert.deepEqual(names.matchingNames(rows,entry({id:'3',kind:'Charity',name:'beans'})),[],'the record being edited is not its own match');
});

test('choosing a past name fills its category and, into an empty amount in the same currency, its last amount', () => {
 const categories=[{id:'cafe',name:'Cafés',direction:'expense'}];
 const draft=entry({kind:'Other expense'});
 const pick=(match,from=draft,kinds=expenses)=>suggestions.nameSuggestion(from,match,categories,'expense',kinds);
 const builtin={name:'Fuel',count:2,exact:false,last:entry({kind:'Living expense',amount:55.5})};
 assert.deepEqual((({name,kind,custom_category_id,amount})=>[name,kind,custom_category_id,amount])(pick(builtin)),['Fuel','Living expense',null,55.5]);
 const added={name:'Latte',count:1,exact:true,last:entry({kind:'Other expense',custom_category_id:'cafe',amount:6})};
 assert.deepEqual((({kind,custom_category_id,amount})=>[kind,custom_category_id,amount])(pick(added,{...draft,kind:'Charity'})),['Other expense','cafe',6]);
 assert.equal(pick(builtin,{...draft,amount:10}).amount,10,'an amount already typed stays');
 assert.equal(pick({...builtin,last:entry({kind:'Living expense',amount:700000,currency:'UZS'})}).amount,0,'never another currency’s figure under this one');
 assert.equal(pick({...builtin,last:entry({kind:'Living expense',amount:0})}).amount,0);
 assert.equal(pick(builtin,draft,['Other expense']).kind,'Other expense','a deleted built-in category is not brought back');
 assert.equal(pick({...added,last:entry({kind:'Other expense',custom_category_id:'gone',amount:6})},{...draft,kind:'Charity'}).kind,'Charity','nor a deleted added one');
 assert.deepEqual(pick({name:'Old',count:3,exact:false}),{...draft,name:'Old'},'a summary of several records gives only its name');
});

// ── Submitting: focus, the shortcut, and when problems show ─────────────────────────────────────────────────────────

test('the first field with a problem is focused, in the form’s own order', () => {
 const {focusFirstProblem}=loadTS('components/record-dialog/entry-submit.ts');
 const s=submitEvent();
 focusFirstProblem(s.event.currentTarget,{account:'Choose a cash account.',amount:'Enter an amount greater than zero.'});
 assert.equal(s.asked.length,1,'one query: the document’s first match is the first field');
 assert.match(s.asked[0],/\.cash-account-field button:not\(\[disabled\]\)/);assert.match(s.asked[0],/\.amount-value-field input:not\(\[disabled\]\)/);
 assert.equal(s.focused.length,1);
 const none=submitEvent();focusFirstProblem(none.event.currentTarget,{});
 assert.equal(none.asked.length,0);
 assert.doesNotThrow(()=>focusFirstProblem({querySelector:()=>null},{name:'Enter a name.',source:'Choose an income source.'}),'a field that is not on screen is skipped');
});

test('⌘Enter and Ctrl+Enter press Save and add another when the form offers it', () => {
 const {submitAnother}=loadTS('components/record-dialog/entry-submit.ts');
 const inside={},another={name:'another'};
 const form=(button=another)=>{const sent=[];return {sent,contains:node=>node===inside,querySelector:selector=>{assert.equal(selector,'button[name="another"]:not([disabled])');return button;},requestSubmit:submitter=>sent.push(submitter)};};
 const press=(target,keys)=>{const pressed=event({key:'Enter',currentTarget:target,target:inside,...keys});submitAnother(pressed);return pressed;};
 const mac=form();assert.equal(press(mac,{metaKey:true}).defaultPrevented,true);assert.deepEqual(mac.sent,[another]);
 const pc=form();press(pc,{ctrlKey:true});assert.deepEqual(pc.sent,[another]);
 const plain=form();assert.equal(press(plain,{}).defaultPrevented,false);assert.deepEqual(plain.sent,[],'Enter alone is the form’s own Save');
 const other=form();press(other,{metaKey:true,key:'s'});assert.deepEqual(other.sent,[]);
 const editing=form(null);assert.equal(press(editing,{metaKey:true}).defaultPrevented,false);assert.deepEqual(editing.sent,[],'a form without the button does nothing');
 const popover=form();press(popover,{metaKey:true,target:{}});assert.deepEqual(popover.sent,[],'a key pressed in a picker’s popover is not the form’s');
});

test('a form with problems is not saved: they show from the first try and follow the form as it is corrected', () => {
 const r=createRenderer(),saved=[],seen={};
 const {useEntrySubmit}=r.load('components/record-dialog/entry-submit.ts');
 let problems={amount:'Enter an amount greater than zero.'};
 function Form(){const submit=useEntrySubmit(e=>saved.push(e));seen.shown=submit.shown(problems);seen.submit=submit.submit;seen.shortcut=submit.shortcut;return null;}
 r.render(h(Form));
 assert.deepEqual(seen.shown,{},'nothing is marked wrong before a save is tried');
 const first=submitEvent();seen.submit(first.event,problems);r.update();
 assert.equal(first.event.defaultPrevented,true);assert.equal(saved.length,0);assert.equal(first.focused.length,1);
 assert.deepEqual(seen.shown,problems);
 problems={};r.update();
 assert.deepEqual(seen.shown,{});
 const second=submitEvent();seen.submit(second.event,problems);
 assert.deepEqual(saved,[second.event]);assert.equal(second.event.defaultPrevented,false);
 assert.equal(typeof seen.shortcut,'function');
});

// ── The shared field pieces ─────────────────────────────────────────────────────────────────────────────────────────

test('a field’s error is an alert under it that the field points at', () => {
 const r=createRenderer(),lang={'@/components/language-provider':language('en')};
 const {FieldError}=r.load('components/presentation-foundation/field-error.tsx',lang);
 r.render(h(FieldError,{id:'e'}));assert.equal(r.html(),'');
 r.render(h(FieldError,{id:'e',message:'Enter a name.'}));
 assert.equal(r.html(),'<small id="e" role="alert" class="field-error">Enter a name.</small>');

 const amount=createRenderer();
 const {AmountCurrencyFields}=amount.load('components/presentation-foundation/amount-currency-fields.tsx',{...lang,...host(['@/components/presentation-foundation/formatted-number-input','@/components/presentation-foundation/currency-select'])});
 const fields={amount:0,currency:'USD',currencies:['USD'],onAmountChange(){},onCurrencyChange(){}};
 amount.render(h(AmountCurrencyFields,fields));
 assert.equal(amount.find(byType('FormattedNumberInput')).props.invalid,false);assert.equal(amount.all(byType('small')).length,0);
 amount.render(h(AmountCurrencyFields,{...fields,error:'Enter an amount greater than zero.'}));
 const input=amount.find(byType('FormattedNumberInput')),alert=amount.find(byType('small'));
 assert.equal(input.props.invalid,true);assert.equal(input.props.describedBy,alert.props.id);assert.equal(text(alert),'Enter an amount greater than zero.');

 const number=createRenderer();
 const {FormattedNumberInput}=number.load('components/presentation-foundation/formatted-number-input.tsx',{...lang,'@/components/ui/input':hostModule()});
 number.render(h(FormattedNumberInput,{value:0,onValueChange(){},invalid:true,describedBy:'why'}));
 assert.deepEqual([number.find(byType('Input')).props['aria-invalid'],number.find(byType('Input')).props['aria-describedby']],[true,'why']);
 number.render(h(FormattedNumberInput,{value:0,onValueChange(){}}));
 assert.equal(number.find(byType('Input')).props['aria-invalid'],undefined);

 const picker=createRenderer();
 const {GroupedPicker}=picker.load('components/presentation-foundation/grouped-picker.tsx',{...lang,...host(['@/components/ui/popover','@/components/ui/button','@/components/ui/input','lucide-react'])});
 const choice={label:'Cash account',placeholder:'Choose a cash account',searchLabel:'Search',allLabel:'All',emptyText:'None',groups:[],groupLabel:key=>key,items:[],value:'',onChange(){}};
 picker.render(h(GroupedPicker,choice));
 assert.equal(picker.find(byType('Button')).props['aria-invalid'],undefined);
 picker.render(h(GroupedPicker,{...choice,error:'Choose a cash account.'}));
 const trigger=picker.find(byType('Button')),reason=picker.find(node=>node.type==='small'&&node.props.role==='alert');
 assert.equal(trigger.props['aria-invalid'],true);assert.equal(trigger.props['aria-describedby'],reason.props.id);assert.equal(text(reason),'Choose a cash account.');

 const account=createRenderer();
 const {CashAccountField}=account.load('components/cash-account-field.tsx',{...lang,...host(['@/components/presentation-foundation/grouped-picker','@/components/presentation-foundation/exchange-rate-preview']),'@/hooks/use-dated-exchange-rate':{useDatedExchangeRate:()=>({rate:null})}});
 account.render(h(CashAccountField,{entry:entry(),records:[wallet],loading:false,error:'',busy:false,problem:'Choose a cash account.',onChange(){}}));
 assert.equal(account.find(byType('GroupedPicker')).props.error,'Choose a cash account.');

 const source=createRenderer();
 const {IncomeSourcePicker}=source.load('components/income-source-picker.tsx',{...lang,...host(['@/components/presentation-foundation/grouped-picker','@/components/presentation-foundation/category-badge'])});
 source.render(h(IncomeSourcePicker,{options:[],value:'',error:'Choose an income source.',onChange(){}}));
 assert.equal(source.find(byType('GroupedPicker')).props.error,'Choose an income source.');
});

test('a Save that is switched off says why above the buttons, except while saving', () => {
 const r=createRenderer();
 const {FormFooter}=r.load('components/presentation-foundation/form-footer.tsx',{'@/components/language-provider':language('en'),'@/components/ui/button':hostModule()});
 r.render(h(FormFooter,{onCancel(){},blocked:'Loading records…'}));
 const reason=r.find(byType('p'));
 assert.deepEqual([reason.props.className,reason.props.role,text(reason)],['form-blocked-reason','status','Loading records…']);
 r.render(h(FormFooter,{onCancel(){},blocked:'Loading records…',busy:true}));assert.equal(r.all(byType('p')).length,0);
 r.render(h(FormFooter,{onCancel(){}}));assert.equal(r.all(byType('p')).length,0);
});

test('the name field marks its error, and a chosen suggestion goes to the form that can fill more than the name', () => {
 const r=createRenderer(),typed=[],picked=[];
 const {RecordNameInput}=r.load('components/record-name-input.tsx',{'@/components/language-provider':language('en'),'@/components/ui/input':hostModule()});
 const rows=[entry({id:'1',name:'Fuel',kind:'Living expense',amount:55}),entry({id:'2',name:'Fuel filter',kind:'Other expense',amount:8})];
 const draft=entry({kind:'Other expense',name:'fu'});
 const props={entry:draft,rows,placeholder:'',onChange:name=>typed.push(name)};
 r.render(h(RecordNameInput,{...props,error:'Enter a name.'}));
 const input=()=>r.find(byType('Input')),offers=()=>r.all(byType('button'));
 assert.equal(input().props['aria-invalid'],true);
 assert.deepEqual(input().props['aria-describedby'].split(' ').map(id=>id.split('-').at(-1)),['matches','error'],'described by its suggestions and its error');
 assert.equal(text(r.find(byType('small'))),'Enter a name.');
 assert.deepEqual(offers().map(button=>text(button.children[0])),['Fuel filter'],'only its own kind unless the form widens it');
 r.fire(offers()[0],'onClick');
 assert.deepEqual(typed,['Fuel filter'],'without onPick a suggestion is just its name');

 r.mount(h(RecordNameInput,{...props,kinds:expenses,onPick:match=>picked.push(match)}));
 assert.equal(input().props['aria-invalid'],undefined);assert.match(input().props['aria-describedby'],/matches$/);
 assert.deepEqual(offers().map(button=>text(button.children[0])),['Fuel','Fuel filter']);
 r.fire(offers()[0],'onClick');
 assert.deepEqual(picked.map(match=>[match.name,match.last.kind,match.last.amount]),[['Fuel','Living expense',55]]);assert.equal(typed.length,1);
 // The form applied the suggestion, moving the category: the list stays put away.
 r.render(h(RecordNameInput,{...props,entry:{...draft,name:'Fuel',kind:'Living expense'},kinds:expenses,onPick(){}}));
 assert.equal(offers().length,0);assert.equal(input().props['aria-describedby'],undefined);
 r.fire(input(),'onChange',{target:{value:'Fue'}});
 assert.deepEqual(typed.at(-1),'Fue');
});

// ── The income form ─────────────────────────────────────────────────────────────────────────────────────────────────

function incomeForm(start,props={}){
 const r=createRenderer(),saves=[],state={};
 const {IncomeRecordForm}=r.load('components/income-record-form.tsx',{
  ...host(['schedule-fields','month-day-field','error-popup','scheduled-payment-field','inline-error','record-icon','amount-currency-fields','date-picker'].map(name=>'@/components/presentation-foundation/'+name)),
  ...host(['@/components/income-source-picker','@/components/record-name-input','@/components/cash-account-field','@/components/ui/button','@/components/ui/native-select','@/components/ui/textarea','lucide-react']),
  'next/link':{__esModule:true,default:'Link'},'@/components/language-provider':language('en'),
 });
 function Host(){
  const [editing,setEditing]=r.react.useState(start);
  state.editing=editing;
  return h(IncomeRecordForm,{currencies:['USD'],rows:[],busy:false,demo:false,error:'',planning:planning(),save:()=>saves.push(state.editing),editing,setEditing,...props});
 }
 r.render(h(Host));
 const form=()=>r.find(byType('form'));
 const submit=()=>{const s=submitEvent();r.fire(form(),'onSubmit',s.event);return s;};
 const button=label=>r.all(byText('Button',label))[0];
 return {r,state,saves,form,submit,button,amount:()=>r.find(byType('AmountCurrencyFields')),account:()=>r.find(byType('CashAccountField')),name:()=>r.find(byType('RecordNameInput'))};
}

test('an income needs only an amount and an account: its name is optional and falls back to its category', () => {
 const f=incomeForm(entry());
 assert.equal(f.form().props.noValidate,true,'the form says what is wrong itself, under each field');
 assert.deepEqual([f.name().props.optional,f.name().props.label],[true,'Name (optional)']);
 assert.equal(f.button('Save income').props.disabled,false);
 assert.deepEqual([f.amount().props.error,f.account().props.problem],[undefined,undefined]);
 const tried=f.submit();
 assert.equal(tried.event.defaultPrevented,true);assert.equal(f.saves.length,0);assert.equal(tried.focused.length,1);
 assert.deepEqual([f.amount().props.error,f.account().props.problem,f.name().props.error],['Enter an amount greater than zero.','Choose a cash account.',undefined]);
 f.r.fire(f.amount(),'onAmountChange',250);
 assert.equal(f.amount().props.error,undefined,'a corrected field loses its error at once');
 f.r.fire(f.account(),'onChange','wallet');
 assert.equal(f.account().props.problem,undefined);
 f.submit();
 assert.deepEqual(f.saves.map(saved=>[saved.amount,saved.account_id,saved.name]),[[250,'wallet','']]);
 assert.equal(save.expenseName(f.saves[0],undefined,f.saves[0].kind),'Other income','saved under its category');
 // A stand-in name reads as no name yet when the income is opened again.
 const reopened=incomeForm(entry({id:'saved',name:'Tutoring',custom_category_id:'tutoring',amount:5,account_id:'wallet'}),{planning:planning({categories:[{id:'tutoring',name:'Tutoring',direction:'income'}]})});
 assert.equal(reopened.name().props.entry.name,'');
});

test('a new one-time income offers Save and add another; a saved one, a schedule and a salary plan do not', () => {
 const f=incomeForm(entry());
 const another=f.button('Save and add another');
 assert.deepEqual([another.props.name,another.props.type,another.props.disabled],['another','submit',false]);
 const buttons=f.r.all(byType('Button')).filter(node=>node.props.type!=='button');
 assert.equal(text(buttons[0]),'Save income','the main button comes first in the form, so Enter saves and closes');
 assert.equal(incomeForm(entry({revision:3})).button('Save and add another'),undefined);
 assert.equal(incomeForm(entry({id:'old'}),{original:entry({id:'old'})}).button('Save and add another'),undefined);
 const schedule=incomeForm(entry({frequency:'Monthly',amount:50}));
 assert.equal(schedule.button('Save and add another'),undefined);
 assert.deepEqual([schedule.name().props.optional,schedule.name().props.label],[undefined,'Name'],'a recurring income is still named');
 schedule.submit();assert.equal(schedule.name().props.error,'Enter a name.');assert.equal(schedule.saves.length,0);
 const plan=incomeForm(entry({kind:'Salary',frequency:'Monthly',amount:900}));
 assert.equal(plan.button('Save and add another'),undefined);assert.ok(plan.button('Save salary plan'));
 // A salary plan must be named, and takes no cash account.
 assert.deepEqual([plan.name().props.optional,plan.name().props.label],[undefined,'Salary plan name']);
 plan.submit();
 assert.equal(plan.name().props.error,'Enter a name.');assert.equal(plan.saves.length,0);
 plan.r.fire(plan.name(),'onChange','Day job');plan.submit();
 assert.equal(plan.saves.at(-1).name,'Day job');
 // ⌘Enter is wired to the form.
 const sent=[],inside={};
 f.r.fire(f.form(),'onKeyDown',event({key:'Enter',metaKey:true,target:inside,currentTarget:{contains:node=>node===inside,querySelector:()=>another,requestSubmit:button=>sent.push(button)}}));
 assert.deepEqual(sent,[another]);
});

test('an income without its source says so under the source, and a Save that waits says what for', () => {
 const fixed={id:'epam',name:'EPAM',kind:'Salary',mode:'variable',currency:'USD',amount:null,frequency:null,start_date:null,end_date:null,archived:false};
 const sources={sources:[fixed],loading:false,error:'',retry(){}};
 // A receipt whose source is gone.
 const gone=incomeForm(entry({kind:'Salary',name:'Old job',amount:10,account_id:'wallet',earning_source_id:'missing'}),{earningSources:sources});
 assert.equal(gone.button('Save income').props.disabled,false);assert.equal(gone.r.find(byType('IncomeSourcePicker')).props.error,undefined);
 gone.submit();
 assert.equal(gone.r.find(byType('IncomeSourcePicker')).props.error,'Choose an income source.');assert.equal(gone.saves.length,0);
 assert.equal(gone.r.find(node=>node.props?.['data-field']==='source').props.className,'field-with-links');
 gone.r.fire(gone.r.find(byType('IncomeSourcePicker')),'onChange','epam');gone.submit();
 assert.deepEqual(gone.saves.map(saved=>[saved.name,saved.earning_source_id]),[['EPAM','epam']]);
 // The older form with a linked-source select marks the select.
 const linked=incomeForm(entry({kind:'Salary',amount:10,account_id:'wallet'}));
 linked.submit();
 const select=linked.r.find(node=>node.type==='NativeSelect'&&node.props.required);
 assert.equal(select.props['aria-invalid'],true);
 assert.equal(text(linked.r.find(node=>node.type==='small'&&node.props.id===select.props['aria-describedby'])),'Choose an income source.');
 // Waiting for a load is the only thing that switches Save off, and it says so.
 const waits=(props,start=entry({kind:'Salary',amount:10}))=>{const f=incomeForm(start,props);return [f.button('Save income').props.disabled,text(f.r.all(byType('p')).filter(node=>node.props.className==='form-blocked-reason'))];};
 assert.deepEqual(waits({planning:planning({},{loading:true})}),[true,'Loading records…']);
 assert.deepEqual(waits({planning:planning({},{error:'Could not load records.'})}),[true,'Could not load records.']);
 assert.deepEqual(waits({planning:planning({},{loading:true})},entry()),[false,''],'an Other income needs no list to be saved');
 const receipt=entry({kind:'Salary',name:'EPAM',amount:10,earning_source_id:'epam'});
 assert.deepEqual(waits({earningSources:{...sources,loading:true}},receipt),[true,'Loading income sources…']);
 assert.deepEqual(waits({earningSources:{...sources,error:'Could not load income sources.'}},receipt),[true,'Could not load income sources.']);
 assert.deepEqual(waits({earningSources:sources},receipt),[false,'']);
 const busy=incomeForm(entry(),{busy:true});
 assert.equal(busy.button('Saving…').props.disabled,true);assert.equal(busy.r.all(byType('p')).filter(node=>node.props.className==='form-blocked-reason').length,0);
});

test('a past income name brings its category and last amount, and notes open only when there are some', () => {
 const categories=[{id:'tutoring',name:'Tutoring',direction:'income'}];
 const f=incomeForm(entry({name:'les'}),{planning:planning({categories})});
 f.r.fire(f.name(),'onPick',{name:'Lesson',count:2,exact:false,last:entry({custom_category_id:'tutoring',amount:30})});
 assert.deepEqual([f.state.editing.name,f.state.editing.custom_category_id,f.state.editing.amount],['Lesson','tutoring',30]);
 assert.equal(f.r.find(byType('details')).props.open,false);
 f.r.fire(f.r.find(byType('Textarea')),'onChange',{target:{value:'paid in cash'}});
 assert.equal(f.state.editing.notes,'paid in cash');
 assert.equal(incomeForm(entry({notes:'x'})).r.find(byType('details')).props.open,true);
});

// ── The expense form ────────────────────────────────────────────────────────────────────────────────────────────────

function expenseForm(start,props={}){
 const r=createRenderer(),saves=[],state={};
 const {ExpenseRecordForm}=r.load('components/record-dialog/expense-form.tsx',{
  ...host(['loading-placeholder','schedule-fields','month-day-field','error-popup','scheduled-payment-field','grouped-picker','category-badge','category-icon','amount-currency-fields','date-picker'].map(name=>'@/components/presentation-foundation/'+name)),
  ...host(['@/components/record-name-input','@/components/investment-tracker-lazy','@/components/mortgage-payment-dialog','@/components/cash-account-field','@/components/ui/tabs','@/components/ui/button','@/components/ui/native-select','@/components/ui/textarea','./recent-categories']),
  './record-form':{withAccountAndOwner:(editing,account_id)=>({...editing,account_id})},
  'next/link':{__esModule:true,default:'Link'},'@/components/language-provider':language('en'),
 });
 function Host(){
  const [editing,setEditing]=r.react.useState(start);
  state.editing=editing;
  return h(ExpenseRecordForm,{currencies:['USD'],rows:[],busy:false,demo:false,error:'',planning:planning(),save:()=>saves.push(state.editing),editing,setEditing,...props});
 }
 r.render(h(Host));
 const form=()=>r.find(byType('form'));
 return {r,state,saves,form,submit:()=>{const s=submitEvent();r.fire(form(),'onSubmit',s.event);return s;},amount:()=>r.find(byType('AmountCurrencyFields')),account:()=>r.find(byType('CashAccountField')),name:()=>r.find(byType('RecordNameInput'))};
}
const spend=(extra={})=>entry({kind:'Other expense',...extra});

test('an expense with nothing entered shows what is missing under the amount and the account, and is not saved', () => {
 const f=expenseForm(spend());
 assert.equal(f.form().props.noValidate,true);
 const tried=f.submit();
 assert.equal(f.saves.length,0);assert.equal(tried.event.defaultPrevented,true);
 assert.match(tried.asked[0],/amount-value-field/);assert.equal(tried.focused.length,1);
 assert.deepEqual([f.amount().props.error,f.account().props.problem,f.name().props.error],['Enter an amount greater than zero.','Choose a cash account.',undefined]);
 f.r.fire(f.amount(),'onAmountChange',12);f.r.fire(f.account(),'onChange','wallet');
 assert.deepEqual([f.amount().props.error,f.account().props.problem],[undefined,undefined]);
 f.submit();
 assert.deepEqual(f.saves.map(saved=>[saved.amount,saved.account_id]),[[12,'wallet']]);
 // A bill set up as a schedule must be named and takes no account.
 const bill=expenseForm(spend({frequency:'Monthly',amount:100}));
 bill.submit();
 assert.equal(bill.name().props.error,'Enter a name.');assert.equal(bill.saves.length,0);
 assert.equal(bill.r.all(byType('CashAccountField')).length,0);
 bill.r.fire(bill.name(),'onChange','Rent');bill.submit();
 assert.equal(bill.saves.at(-1).name,'Rent');
 // ⌘Enter presses Save and add another.
 const sent=[],inside={},another=f.r.find(byText('Button','Save and add another'));
 f.r.fire(f.form(),'onKeyDown',event({key:'Enter',ctrlKey:true,target:inside,currentTarget:{contains:node=>node===inside,querySelector:()=>another,requestSubmit:button=>sent.push(button)}}));
 assert.deepEqual(sent,[another]);
});

test('a past expense name brings its category and last amount, and leaves a bill of another category', () => {
 const rent={id:'rent',name:'Rent',kind:'Rent expense',currency:'USD',amount:700,frequency:'Monthly',date:'2026-01-01',notes:''};
 const f=expenseForm(spend({name:'fu',kind:'Rent expense',occurrence_record_id:'rent'}),{planning:planning({records:[wallet,rent]})});
 assert.deepEqual(f.name().props.kinds,expenses,'names are looked up across every expense category');
 f.r.fire(f.name(),'onPick',{name:'Fuel',count:4,exact:false,last:spend({kind:'Living expense',amount:55})});
 assert.deepEqual([f.state.editing.name,f.state.editing.kind,f.state.editing.amount,f.state.editing.occurrence_record_id],['Fuel','Living expense',55,null]);
 // The same category keeps the bill, and a typed amount.
 const kept=expenseForm(spend({name:'re',kind:'Rent expense',amount:650,occurrence_record_id:'rent'}),{planning:planning({records:[wallet,rent]})});
 kept.r.fire(kept.name(),'onPick',{name:'Rent top-up',count:1,exact:false,last:spend({kind:'Rent expense',amount:20})});
 assert.deepEqual([kept.state.editing.name,kept.state.editing.amount,kept.state.editing.occurrence_record_id],['Rent top-up',650,'rent']);
});

// ── The transfer dialog ─────────────────────────────────────────────────────────────────────────────────────────────

test('a transfer opens in its amount and says beside Save why it cannot be saved yet', () => {
 const r=createRenderer(),ui=stubs();
 const {AssetMovementDialog}=r.load('components/planning/asset-movement-dialog.tsx',{
  ...ui.modules,
  '@/hooks/use-dated-exchange-rate':{useDatedExchangeRate:()=>({rate:1,retry(){}})},
  '@/components/discard-changes':{useDiscardChanges:(dirty,onClose)=>({close:onClose,confirmation:null})},
 });
 const savings={...wallet,id:'savings',name:'Savings'};
 const open=initial=>{r.mount(h(AssetMovementDialog,{initial,records:[wallet,savings],save:async()=>{},onClose(){}}));return r;};
 const footer=()=>r.find(node=>node.type===ui.FormFooter);
 const save=()=>r.find(node=>node.type===ui.Button&&node.props.type!=='button');
 open({kind:'transfer'});
 assert.deepEqual([footer().props.blocked,save().props.disabled],['Choose both accounts.',true]);
 assert.equal([...walk(r.tree)].some(node=>node.type==='span'&&node.props.title),false,'the reason is no longer only a hover title');
 open({kind:'transfer',source_id:'wallet',target_id:'savings'});
 assert.equal(footer().props.blocked,'Enter an amount greater than zero.');
 r.fire(r.find(node=>node.type===ui.FormattedNumberInput&&node.props.max===500),'onValueChange',40);
 assert.deepEqual([footer().props.blocked,save().props.disabled],[undefined,false]);
 // Opening focuses the amount when it is there; otherwise focus is left to the dialog.
 const focus=r.find(node=>node.type===ui.DialogContent).props.onOpenAutoFocus;
 let focused=0;
 const withAmount=event({currentTarget:{querySelector:selector=>{assert.equal(selector,'.tracker-fields input[inputmode="decimal"]:not([disabled])');return {focus(){focused++;}};}}});
 focus(withAmount);assert.deepEqual([withAmount.defaultPrevented,focused],[true,1]);
 const without=event({currentTarget:{querySelector:()=>null}});
 focus(without);assert.equal(without.defaultPrevented,false);
});
