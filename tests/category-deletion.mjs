import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
import {createRenderer,hostModule,language,text,byLabel,byType} from './helpers/component-tree.mjs';
const {chosenCategoryHue}=loadTS('lib/category-colors.ts');
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const request=(body,method='DELETE')=>new Request('https://local/api/categories?id='+id(1),{method,...(method==='GET'?{}:{body:JSON.stringify(body)})});
function api({auth=true,origin=true,failure=null}={}){
 const calls=[];
 return {...loadTS('app/api/categories/route.ts',{'@/lib/supabase':{session:async()=>auth?{user:{id:id(9)},token:'owner-token'}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return failure?Response.json(failure,{status:400}):Response.json({ok:true});}}}),calls};
}
test('category deletion API validates ownership, origin, replacement and failures',async()=>{
 for(const [options,status] of [[{auth:false},401],[{origin:false},403]]){const app=api(options);assert.equal((await app.DELETE(request({id:id(1)}))).status,status);assert.equal(app.calls.length,0);}
 for(const body of [{id:'bad'},{id:id(1),new_name:' '},{id:id(1),new_name:'New',replacement_id:id(2)}]){const app=api();assert.equal((await app.DELETE(request(body))).status,400);assert.equal(app.calls.length,0);}
 const app=api();assert.equal((await app.GET(request(null,'GET'))).status,200);assert.deepEqual(app.calls[0],{path:'/rest/v1/rpc/category_usage',body:{p_category:id(1)},token:'owner-token'});
 assert.equal((await app.DELETE(request({id:id(1),new_name:' Leisure ',user_id:id(99)}))).status,200);assert.deepEqual(app.calls[1].body,{p_category:id(1),p_replacement:null,p_new_name:'Leisure'});
 const failed=api({failure:{code:'P0001',message:'This category is in use. Choose a replacement category.'}});const response=await failed.DELETE(request({id:id(1)}));assert.equal(response.status,409);assert.match((await response.json()).error,/replacement/);
 const anonymous=api({auth:false});assert.equal((await anonymous.GET(request(null,'GET'))).status,401);assert.equal(anonymous.calls.length,0);
});
function find(node,predicate){
 if(!node||typeof node!=='object')return;
 if(predicate(node))return node;
 for(const child of React.Children.toArray(node.props?.children)){const match=find(child,predicate);if(match)return match;}
}
function harness(file,name){
 const values=[],effects=[];let cursor=0;const refs=[];let refCursor=0;
 const loaded=loadTS(file,{
  react:{...React,useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},useEffect(effect){effects.push(effect);},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});}},
  '@/components/language-provider':{useLanguage:()=>({t:(key,params={})=>key.replace(/\{(\w+)\}/g,(_,name)=>params[name]??name),locale:'en-US'})},
  '@/components/discard-changes':{useUnsavedNavigation:()=>null,useDiscardChanges:(dirty,onClose)=>({close:onClose,request:action=>action(),confirmation:null})},
  // The dialogs load on demand; here they are found by name and their props called.
  '@/components/workspace/workspace-lazy':{DeleteCategoryDialog:function DeleteCategoryDialog(){return null;},EditCategoryDialog:function EditCategoryDialog(){return null;}},
 });
 return {render:props=>{cursor=0;refCursor=0;return loaded[name](props);},effects};
}
test('delete dialog requires a loaded preview and explicit same-type replacement; failures retain the dialog',async()=>{
 const h=harness('components/delete-category-dialog.tsx','DeleteCategoryDialog');let closed=0,deleted=0;
 const category={id:id(1),name:'Leisure',direction:'expense'},target={id:id(2),name:'Travel',direction:'expense'};
 const props={category,categories:[category,target,{id:id(3),name:'Salary bonus',direction:'income'}],onClose:()=>closed++,onDeleted:()=>deleted++};
 const original=globalThis.fetch,calls=[];
 let usageDown=true;
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return options?.method==='DELETE'?Response.json({error:'Unavailable'},{status:503}):usageDown?new Response('<html>Bad gateway</html>',{status:404}):Response.json({records:2,deleted:1,watchlists:0});};
 try{
  let tree=h.render(props);let submit=find(tree,node=>node.props?.variant==='destructive');assert.equal(submit.props.disabled,true);
  assert.equal(find(tree,node=>node.props?.role==='status').props.children,'Checking linked records…');
  // The usage preview is the shared session loader's read: a reply without JSON shows the dialog's own fallback, and Retry reads again.
  h.effects.at(-1)();await new Promise(resolve=>setImmediate(resolve));tree=h.render(props);
  const failed=find(tree,node=>node.type?.name==='InlineError');assert.equal(failed.props.message,'Could not load category usage. Please try again.');assert.equal(find(tree,node=>node.props?.variant==='destructive').props.disabled,true);
  usageDown=false;failed.props.onRetry();tree=h.render(props);assert.equal(find(tree,node=>node.props?.role==='status').props.children,'Checking linked records…');
  const cleanup=h.effects.at(-1)();await new Promise(resolve=>setImmediate(resolve));tree=h.render(props);
  const select=find(tree,node=>node.type?.name==='NativeSelect');assert.ok(select);assert.equal(find(tree,node=>node.props?.value===id(3)),undefined);
  assert.equal(find(tree,node=>node.props?.variant==='destructive').props.disabled,true);
  select.props.onChange({target:{value:target.id}});tree=h.render(props);submit=find(tree,node=>node.props?.variant==='destructive');assert.equal(submit.props.disabled,false);
  submit.props.onClick();await new Promise(resolve=>setImmediate(resolve));tree=h.render(props);
  assert.equal(closed,0);assert.equal(deleted,0);assert.equal(find(tree,node=>node.type?.name==='ErrorPopup').props.message,'Unavailable');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id:category.id,replacement_id:target.id});
  globalThis.fetch=async()=>Response.json({ok:true});find(tree,node=>node.props?.variant==='destructive').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);assert.equal(deleted,1);cleanup();
 }finally{globalThis.fetch=original;}
});
/** The Settings category list rendered whole, with the dialogs and the sortable kit as named stand-ins. */
function settings(props){
 const r=createRenderer();
 const {TransactionToolsPanel}=r.load('components/transaction-tools-panel.tsx',{
  '@/components/language-provider':language('en'),'lucide-react':hostModule(),
  '@/components/ui/button':hostModule(),'@/components/ui/input':hostModule(),'@/components/ui/native-select':hostModule(),'@/components/ui/dialog':hostModule(),
  '@/components/presentation-foundation/delete-button':hostModule(),'@/components/presentation-foundation/form-footer':hostModule(),'@/components/presentation-foundation/info-hint':hostModule(),'@/components/presentation-foundation/inline-error':hostModule(),'@/components/presentation-foundation/error-popup':hostModule(),'@/components/presentation-foundation/formatted-number-input':hostModule(),'@/components/presentation-foundation/count':hostModule(),'@/components/presentation-foundation/panel-title':hostModule(),'@/components/presentation-foundation/segmented':hostModule(),'@/components/presentation-foundation/sortable':hostModule(),
  '@/components/category-icon-picker':hostModule(),'@/components/workspace/workspace-lazy':hostModule(),
  '@/components/discard-changes':{useUnsavedNavigation:()=>null,useDiscardChanges:(dirty,onClose)=>({close:onClose,request:action=>action(),confirmation:null})},
  '@/lib/feedback':{showSaved(){}},
 });
 const base={categories:[],saveCategory:async()=>id(5),icons:{icons:{},colors:{},disabled:false,choose:async()=>{},update:async()=>{},emojiOf:()=>'🏷️'},removed:{kinds:[],restore:async()=>{},hideForVisit(){},deleted(){},disabled:false},loading:false,error:'',onRetry(){},onDeleted(){},preferences:{data:{preferences:[]},loading:false,error:'',save:async()=>{}},owner:null,demo:true,...props};
 r.render(r.react.createElement(TransactionToolsPanel,base));
 const rows=()=>r.all(byType('SortableItem'));
 const row=name=>r.find(node=>node.type==='SortableItem'&&node.props.label===name);
 const within=(name,predicate)=>r.find(predicate,row(name).children);
 return {r,rows,row,within,names:()=>rows().map(node=>node.props.label),show:direction=>r.fire(r.find(byType('Segmented')),'onChange',direction)};
}
test('categories are one list a direction at a time: each row opens its editor, with Edit and a bin of its own, disabled while loading',()=>{
 const category={id:id(1),name:'Leisure',direction:'expense'};
 const s=settings({categories:[category],loading:true});
 assert.deepEqual(s.names(),['Rent expense','Living expense','Charity','Other expense','Leisure'],'expenses first, built-in and added alike');
 assert.equal(s.r.find(byType('PanelTitle')).props.count.props.value,5);
 const edit=s.within('Leisure',byLabel('Edit Leisure'));
 assert.equal(edit.props.disabled,true);assert.equal(s.row('Leisure').props.onOpen,undefined,'a loading row opens nothing');
 assert.equal(s.within('Leisure',byType('DeleteButton')).props.disabled,true);
 assert.equal(s.r.find(node=>node.type==='Button'&&text(node)==='Add expense category').props.disabled,true);
 s.show('income');
 assert.deepEqual(s.names(),['Salary','Rent income','Business income','Other income']);
 assert.equal(text(s.r.find(node=>node.type==='Button'&&text(node)==='Add income category')),'Add income category');
 // The search narrows the open direction by name, in any letter case.
 s.r.fire(s.r.find(byLabel('Search categories')),'onChange',{target:{value:'  RENT '}});
 assert.deepEqual(s.names(),['Rent income']);
 s.r.fire(s.r.find(byLabel('Search categories')),'onChange',{target:{value:'zzz'}});
 assert.deepEqual(s.names(),[]);assert.equal(text(s.r.find(node=>node.props.role==='status')),'No matching categories.');
 assert.equal(s.r.all(byType('SortableList')).length,0);
});
test('a category row shows its colour, this month\u2019s budget and its recurring bill; a filtered list still reorders within what is shown',()=>{
 const category={id:id(1),name:'Leisure',direction:'expense'};
 const bill=(name,extra={})=>({id:name,name,kind:'Other expense',frequency:'Monthly',amount:10,currency:'USD',date:'2026-01-05',...extra});
 const saves=[];
 const plans={month:'2026-11',currency:'USD',rates:{USD:1,EUR:.5},amounts:[{category_key:id(1),month:'2026-10',amount:300,currency:'EUR',applies_forward:true},{category_key:'Charity',month:'2026-11',amount:0,currency:'USD',applies_forward:false},{category_key:'Living expense',month:'2026-11',amount:50,currency:'XXX',applies_forward:false},{category_key:'Salary',month:'2026-12',amount:900,currency:'USD',applies_forward:true}],
  records:[bill('Gym',{custom_category_id:id(1)}),bill('Car insurance'),bill('Phone'),bill('Old bill',{archived:true}),bill('Paused bill',{source_paused:true}),bill('One-off',{frequency:'Once'}),{...bill('Employer'),kind:'Salary'}]};
 const icons={icons:{[id(1)]:'🎬'},colors:{[id(1)]:'violet'},disabled:false,choose:async()=>{},update:async()=>{},emojiOf:kind=>kind==='Leisure'?'🎬':'🏷️'};
 const s=settings({categories:[category],icons,plans,demo:false,owner:id(9),preferences:{data:{preferences:[]},loading:false,error:'',save:async preference=>{saves.push(preference);}}});
 const cells=name=>s.r.all(node=>typeof node.props.className==='string'&&node.props.className.startsWith('category-row-plan'),s.row(name).children).map(text);
 assert.deepEqual(cells('Leisure'),['$600','Gym'],'the forward budget of an earlier month, converted into the display currency');
 assert.deepEqual(cells('Charity'),['$0','—'],'a budget of zero is still a budget');
 assert.deepEqual(cells('Other expense'),['—','Car insurance1 more'],'running bills only: not the archived, the paused or the one-off payment');
 assert.deepEqual(cells('Rent expense'),['—','—']);
 const unknown=s.r.find(node=>node.props['aria-label']==='Exchange rate unavailable.',s.row('Living expense').children);
 assert.equal(text(unknown),'—','a budget no rate converts is missing, never shown under the wrong currency');
 const icon=s.within('Leisure',node=>node.props.className==='category-icon');
 assert.equal(text(icon),'🎬');assert.equal(icon.props.style['--category-hue'],chosenCategoryHue(id(1),icons.colors),'the chosen colour tints the row icon');
 assert.equal(s.within('Leisure',node=>node.props.className==='category-row-dot').props.style['--category-hue'],chosenCategoryHue(id(1),icons.colors));
 // Income rows count recurring incomes, and a budget saved for a later month is not this month's.
 s.show('income');
 assert.deepEqual(cells('Salary'),['—','Employer']);
 assert.equal(text(s.r.find(node=>node.props.className==='category-row category-list-head')),'CategoryMonthly budgetRecurring income');
 // Dragging within a search keeps the hidden categories in their places.
 s.show('expense');
 s.r.fire(s.r.find(byLabel('Search categories')),'onChange',{target:{value:'expense'}});
 assert.deepEqual(s.names(),['Rent expense','Living expense','Other expense']);
 const list=s.r.find(byType('SortableList'));
 assert.equal(list.props.id,'categories-expense');assert.equal(list.props.nameOf('Living expense'),'Living expense');assert.equal(list.props.nameOf('gone'),'');
 s.r.fire(list,'onMove','Other expense','Rent expense');
 assert.deepEqual(saves,[{key:'category_order',data:{ids:['Salary','Rent income','Business income','Other income','Other expense','Rent expense','Charity','Living expense',id(1)]}}]);
 s.r.fire(s.r.find(byLabel('Search categories')),'onChange',{target:{value:''}});
 assert.deepEqual(s.names(),['Other expense','Rent expense','Charity','Living expense','Leisure'],'Charity and Leisure, hidden by the search, kept their slots');
});
test('a row edits its name and icon together; built-in names stay fixed, the row\u2019s bin deletes, and a new category opens in a dialog',async()=>{
 const category={id:id(1),name:'Leisure',direction:'expense'};
 const calls=[];
 const icons={icons:{[id(1)]:'🎬'},colors:{[id(1)]:'violet'},disabled:false,choose:async(key,icon)=>{calls.push(['icon',key,icon]);},update:async(key,look)=>{calls.push(['look',key,look]);},emojiOf:kind=>kind==='Leisure'?'🎬':'🏷️'};
 const hidden=[];
 const s=settings({categories:[category],saveCategory:async(name,direction,existing)=>{calls.push(['save',name,direction,existing]);return existing??id(5);},icons,removed:{kinds:[],restore:async()=>{},hideForVisit:kind=>hidden.push(kind),deleted(){},disabled:false}});
 const dialog=()=>s.r.find(byType('EditCategoryDialog'));
 assert.equal(s.rows().length,5,'built-in and added categories alike');
 s.r.fire(s.row('Leisure'),'onOpen');
 assert.deepEqual([dialog().props.item.label,dialog().props.icon,dialog().props.chosen,dialog().props.color],['Leisure','🎬',true,'violet']);
 assert.deepEqual(dialog().props.builtInNames,['Rent expense','Living expense','Charity','Other expense']);
 assert.equal(typeof dialog().props.onDelete,'function');
 await dialog().props.onSave({name:'Hobbies',icon:'🎨',color:'teal'});
 assert.deepEqual(calls.slice(-2),[['save','Hobbies','expense',id(1)],['look',id(1),{icon:'🎨',color:'teal'}]],'icon and colour are one save');
 await dialog().props.onSave({color:null});assert.deepEqual(calls.at(-1),['look',id(1),{color:null}],'a colour-only change does not rename');
 s.r.fire(dialog(),'onClose');assert.equal(s.r.all(byType('EditCategoryDialog')).length,0);
 // A built-in category keeps its name and can be deleted too; the sample workspace hides it for the visit.
 s.r.fire(s.within('Charity',byLabel('Edit Charity')),'onClick');
 assert.equal(dialog().props.item.category,undefined);assert.equal(dialog().props.color,null);
 s.r.fire(dialog(),'onDelete');assert.deepEqual(hidden,['Charity']);assert.equal(s.r.all(byType('EditCategoryDialog')).length,0);
 // The bin on the row does the same without opening the editor; an added category asks first.
 s.r.fire(s.within('Rent expense',byType('DeleteButton')),'onClick');assert.deepEqual(hidden,['Charity','Rent expense']);
 assert.equal(s.within('Leisure',byType('DeleteButton')).props.label,'Delete Leisure');
 s.r.fire(s.within('Leisure',byType('DeleteButton')),'onClick');
 assert.deepEqual(s.r.find(byType('DeleteCategoryDialog')).props.category,category);
 s.r.fire(s.r.find(byType('DeleteCategoryDialog')),'onClose');
 // A new category: the name, then its icon, in a dialog named for the open direction.
 s.r.fire(s.r.find(node=>node.type==='Button'&&text(node)==='Add expense category'&&node.props.size==='sm'),'onClick');
 const form=()=>s.r.find(byType('form'));
 assert.equal(text(s.r.find(byType('DialogTitle'))),'New expense category');
 const submit=()=>s.r.find(node=>node.type==='Button'&&!node.props.type,form().children);
 assert.equal(submit().props.disabled,true);assert.equal(submit().props.title,'Enter a name.');
 const name=()=>s.r.find(byType('Input'),form().children);
 s.r.fire(name(),'onChange',{target:{value:'leisure'}});
 assert.equal(submit().props.disabled,true,'a name in use is refused, letter case aside');assert.ok(s.r.find(node=>node.props.role==='alert'));
 s.r.fire(name(),'onChange',{target:{value:' Travel '}});
 const picker=()=>s.r.find(byType('CategoryIconPicker'));
 assert.deepEqual([picker().props.icon,picker().props.chosen],['🏷️',false]);
 s.r.fire(picker(),'onChoose','✈️');
 assert.equal(picker().props.icon,'✈️');assert.equal(submit().props.disabled,false);
 await s.r.fireAsync(form(),'onSubmit',{preventDefault(){}});
 assert.deepEqual(calls.slice(-2),[['save','Travel','expense',undefined],['icon',id(5),'✈️']]);
 assert.equal(s.r.all(byType('form')).length,0,'the dialog closes once the category is saved');
});
test('the category edit dialog saves only what changed (name, icon and colour), refuses a taken name and offers delete for added categories',async()=>{
 const h=harness('components/edit-category-dialog.tsx','EditCategoryDialog');const saved=[];let closed=0,deleted=0;
 const props={item:{id:id(1),label:'Leisure',direction:'expense',category:{id:id(1),name:'Leisure',direction:'expense'}},icon:'🎬',chosen:true,color:null,defaultHue:290,iconsDisabled:false,categories:[{id:id(1),name:'Leisure',direction:'expense'},{id:id(2),name:'Travel',direction:'expense'}],builtInNames:['Charity'],onSave:async change=>{saved.push(change);},onDelete:()=>{deleted++;},onClose:()=>{closed++;}};
 let tree=h.render(props);
 const save=()=>find(tree,node=>node.type?.name==='Button'&&!node.props.type);
 assert.equal(save().props.disabled,true,'nothing changed yet');
 find(tree,node=>node.type?.name==='Input').props.onChange({target:{value:'travel'}});tree=h.render(props);
 assert.equal(save().props.disabled,true,'a name in use is refused');assert.ok(find(tree,node=>node.props?.role==='alert'));
 find(tree,node=>node.type?.name==='Input').props.onChange({target:{value:' Hobbies '}});tree=h.render(props);
 find(tree,node=>node.type?.name==='CategoryIconPicker').props.onChoose('🎨');tree=h.render(props);
 assert.equal(find(tree,node=>node.type?.name==='CategoryIconPicker').props.icon,'🎨');
 const colours=()=>find(tree,node=>node.type?.name==='ColorChoices');
 assert.equal(colours().props.value,null,'no colour chosen yet');assert.ok(colours().props.automatic);assert.ok(!colours().props.colors.includes('slate'));
 colours().props.onChange('green');tree=h.render(props);assert.equal(colours().props.value,'green');
 await find(tree,node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(saved,[{name:'Hobbies',icon:'🎨',color:'green'}]);assert.equal(closed,1);
 find(tree,node=>node.props?.className==='category-edit-delete').props.onClick();assert.equal(deleted,1);
 const builtIn=harness('components/edit-category-dialog.tsx','EditCategoryDialog').render({...props,item:{id:'Charity',label:'Charity',direction:'expense'},onDelete:undefined});
 assert.equal(find(builtIn,node=>node.type?.name==='Input').props.disabled,true,'built-in names are translated and stay fixed');
 assert.equal(find(builtIn,node=>node.props?.className==='category-edit-delete').props.reason,'Keep at least one category of this type.','the last category of a direction shows the bin, disabled, with the reason');
});

test('deleted built-in categories leave the list, are never shown again, and the last category of a direction stays',async()=>{
 const removed={kinds:['Rent expense','Salary','Rent income','Business income'],hideForVisit(){},deleted(){}};
 const s=settings({removed,owner:id(9),demo:false});
 assert.deepEqual(s.names(),['Living expense','Charity','Other expense']);
 // Nothing lists what was deleted.
 assert.equal(s.r.all(node=>typeof node.props['aria-label']==='string'&&node.props['aria-label'].startsWith('Restore')).length,0);
 // A built-in category with a database opens the delete dialog, named by its kind, from the editor and from its bin.
 s.r.fire(s.row('Charity'),'onOpen');
 s.r.fire(s.r.find(byType('EditCategoryDialog')),'onDelete');
 assert.deepEqual(s.r.find(byType('DeleteCategoryDialog')).props.category,{id:'Charity',name:'Charity',direction:'expense'});
 assert.equal(s.r.all(byType('EditCategoryDialog')).length,0);
 // Other income is the only income category left: its bin stays, disabled, with the reason.
 s.show('income');
 assert.deepEqual(s.names(),['Other income']);
 const bin=s.within('Other income',byType('DeleteButton'));
 assert.equal(bin.props.reason,'Keep at least one category of this type.');assert.equal(bin.props.onClick,undefined);
 s.r.fire(s.row('Other income'),'onOpen');
 assert.equal(s.r.find(byType('EditCategoryDialog')).props.onDelete,undefined);
});
test('the category API reads and deletes a built-in category by its kind',async()=>{
 const app=api();
 assert.equal((await app.GET(new Request('https://local/api/categories?id=Rent%20expense'))).status,200);
 assert.deepEqual(app.calls[0],{path:'/rest/v1/rpc/built_in_category_usage',body:{p_kind:'Rent expense'},token:'owner-token'});
 assert.equal((await app.DELETE(request({id:'Rent expense',replacement_id:id(2)}))).status,200);
 assert.deepEqual(app.calls[1],{path:'/rest/v1/rpc/delete_built_in_category',body:{p_kind:'Rent expense',p_replacement:id(2),p_new_name:null},token:'owner-token'});
 assert.equal((await app.DELETE(request({id:'Groceries'}))).status,400);
});
test('records of a deleted category can move to a built-in category by its kind, and only one destination is accepted',async()=>{
 const app=api();
 assert.equal((await app.DELETE(request({id:id(1),replacement_kind:'Charity'}))).status,200);
 assert.deepEqual(app.calls[0],{path:'/rest/v1/rpc/delete_category_into_kind',body:{p_from:id(1),p_kind:'Charity'},token:'owner-token'});
 assert.equal((await app.DELETE(request({id:'Rent expense',replacement_kind:'Charity'}))).status,200,'a built-in category moves into another built-in one the same way');
 assert.deepEqual(app.calls[1],{path:'/rest/v1/rpc/delete_category_into_kind',body:{p_from:'Rent expense',p_kind:'Charity'},token:'owner-token'});
 for(const body of [{id:id(1),replacement_id:id(2),replacement_kind:'Charity'},{id:id(1),new_name:'New',replacement_kind:'Charity'},{id:id(1),replacement_kind:'Groceries'}]){const refused=api();assert.equal((await refused.DELETE(request(body))).status,400,JSON.stringify(body));assert.equal(refused.calls.length,0);}
});
test('the delete dialog offers the other built-in kinds of the same type, minus the deleted ones and its own, and sends the chosen kind',async()=>{
 const h=harness('components/delete-category-dialog.tsx','DeleteCategoryDialog');let closed=0,deleted=0;
 const category={id:id(1),name:'Leisure',direction:'expense'};
 const props={category,categories:[category,{id:id(2),name:'Travel',direction:'expense'}],removed:['Rent expense'],onClose:()=>closed++,onDeleted:()=>deleted++};
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return options?.method==='DELETE'?Response.json({ok:true}):Response.json({records:2,deleted:0,watchlists:0});};
 try{
  h.render(props);const cleanup=h.effects.at(-1)();await new Promise(resolve=>setImmediate(resolve));let tree=h.render(props);
  const options=[];(function walk(node){if(!node||typeof node!=='object')return;if(node.type==='option')options.push(node.props.value);for(const child of React.Children.toArray(node.props?.children))walk(child);})(find(tree,node=>node.type?.name==='NativeSelect'));
  assert.deepEqual(options,['','Living expense','Charity','Other expense',id(2),'new'],'built-in kinds first, without the deleted Rent expense, then added categories');
  find(tree,node=>node.type?.name==='NativeSelect').props.onChange({target:{value:'Charity'}});tree=h.render(props);
  const submit=find(tree,node=>node.props?.variant==='destructive');assert.equal(submit.props.disabled,false);
  submit.props.onClick();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id:category.id,replacement_kind:'Charity'});assert.equal(closed,1);assert.equal(deleted,1);cleanup();
  // A built-in category being deleted never offers itself.
  const own=harness('components/delete-category-dialog.tsx','DeleteCategoryDialog');const charity={id:'Charity',name:'Charity',direction:'expense'};
  own.render({...props,category:charity});const stop=own.effects.at(-1)();await new Promise(resolve=>setImmediate(resolve));
  const kinds=[];(function walk(node){if(!node||typeof node!=='object')return;if(node.type==='option')kinds.push(node.props.value);for(const child of React.Children.toArray(node.props?.children))walk(child);})(find(own.render({...props,category:charity}),node=>node.type?.name==='NativeSelect'));
  assert.ok(!kinds.includes('Charity'));assert.ok(kinds.includes('Living expense'));stop();
 }finally{globalThis.fetch=original;}
});
