import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,host,text} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';
const {formatSignedMoney}=loadTS('lib/format.ts');

const t=(message,values={})=>message.replace(/\{(\w+)\}/g,(_,key)=>String(values[key]));
function open(props={}){
 const r=createRenderer(),feedback=[];
 const {TransactionDetailsDialog}=r.load('components/transaction-details-dialog.tsx',{
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t})},
  '@/components/ui/dialog':{Dialog:host('dialog'),DialogContent:host('content'),DialogTitle:host('h2'),DialogDescription:host('p')},
  '@/components/ui/button':{Button:host('button')},'@/components/presentation-foundation/drawer-link':{DrawerLink:host('a')},'lucide-react':{ArrowUpRight:host('arrow'),Pencil:host('pencil'),Paperclip:host('paperclip'),Split:host('split'),ChevronRight:host('chevron')},
  '@/components/presentation-foundation/category-icon':{CategoryIcon:host('CategoryIcon')},
  '@/components/presentation-foundation/delete-button':{DeleteButton:host('DeleteButton')},
  '@/components/presentation-foundation/category-badge':{CategoryBadge:host('CategoryBadge')},
  '@/components/transactions/pickers':{BusinessPicker:host('BusinessPicker'),CategoryPicker:host('CategoryPicker')},
  '@/components/transactions/tags':{TagSelector:host('TagSelector')},
  '@/lib/feedback':{showSaved:()=>feedback.push('saved'),showNotice:message=>feedback.push(message),showError:message=>feedback.push('error: '+message)},
 });
 const calls={tags:[],closed:0,edited:0,deleted:0};
 const record={id:'r',name:'Groceries run',kind:'Living expense',amount:42,currency:'USD',frequency:'Once',date:'2026-10-05',notes:'',quantity:1,cost:0,rate:0,...props.record};
 const all={record,incoming:false,businesses:[],onBusiness:async()=>1,tagging:{tags:[{id:'keep',name:'Keep receipt'}],tagIds:[],onTags:async(add,remove)=>{calls.tags.push([add,remove]);},onCreateTag:async()=>'new'},editable:true,onEdit:()=>calls.edited++,onDelete:()=>calls.deleted++,onClose:()=>calls.closed++,...props,record};
 r.mount(r.react.createElement(TransactionDetailsDialog,all));
 const rows=()=>r.all(node=>node.type==='dt').map(dt=>text(dt));
 const value=label=>{const dt=r.all(node=>node.type==='dt').find(node=>text(node)===label);return dt?r.all(node=>node.type==='dd').at(r.all(node=>node.type==='dt').indexOf(dt)):undefined;};
 return {r,calls,feedback,rows,value};
}

test('the details lead with the amount, then list what a transaction is, and only the rows it has',()=>{
 const plain=open();
 // A one-time transaction has no Frequency row; a schedule names its own.
 assert.deepEqual(plain.rows(),['Amount','Date','Category','Tags']);
 assert.deepEqual(plain.r.all(node=>node.props?.['data-wide']).map(node=>text(node.children[0])),['Amount','Tags'],'the amount and the tags take the whole row; short facts pair up');
 assert.equal(plain.r.find(node=>node.type==='CategoryIcon').props.kind,'Living expense');
 assert.equal(plain.r.all(node=>node.props?.className==='transaction-details-cards').length,0,'no cards without attachments or Split');
 assert.equal(text(plain.value('Amount')),'−$42');
 const full=open({incoming:true,categoryName:'Cafés',accountName:'Everyday checking',propertyName:'Lakeside condo',ownerName:'Sam',attachments:'receipt.pdf',record:{kind:'Other income',amount:1200,custom_category_id:'c1',end_date:'2026-12-31',notes:'Paid early',account_currency:'EUR',account_exchange_rate:1.08,payment_type:'bonus'}});
 assert.deepEqual(full.rows(),['Amount','Date','Account','Category','Owner','Last active date','Property','Exchange rate','Tags','Notes']);
 assert.equal(text(full.value('Owner')),'Sam');
 assert.equal(full.r.find(node=>node.type==='CategoryIcon').props.kind,'Cafés','a custom category shows its own icon');
 assert.equal(text(full.r.find(node=>node.type==='section'&&node.props['aria-label']==='Attachments')),'Attachmentsreceipt.pdf','attachments are a card under the fields');
 assert.equal(full.value('Amount').children[0].props.className,'transaction-details-amount positive');
 assert.equal(text(full.value('Amount')),'+$1,200');
 assert.deepEqual(full.r.all(node=>node.type==='CategoryBadge').map(badge=>badge.props.label),['Bonus','Cafés']);
 assert.equal(text(full.value('Property')),'Lakeside condo');
 assert.equal(text(full.value('Exchange rate')),'1 EUR = 1.08 USD');
 const mortgage=open({record:{kind:'Other expense',mortgage_payment_id:'m',payment_principal:555,payment_interest:925,amount:1480,frequency:'Monthly'}});
 assert.deepEqual(mortgage.rows().slice(4,6),['Principal','Interest']);
 assert.equal(text(mortgage.value('Frequency')),'Monthly');
 // The sign is the shared formatter's, never a hand-built prefix (MONEY-006).
 const euros=open({record:{currency:'EUR',amount:42}});
 assert.equal(text(euros.value('Amount')),formatSignedMoney(-42,'EUR','en-US'));
});

test('a business changes here when it may, saying so; otherwise its name is shown',async()=>{
 const businesses=[{id:'shop',name:'Corner shop'}];
 const saved=open({businesses});
 const picker=saved.r.find(node=>node.type==='BusinessPicker');
 await saved.r.fireAsync(picker,'onChange','shop');
 assert.deepEqual(saved.feedback,['saved']);
 const kept=open({businesses,onBusiness:async()=>0});
 await kept.r.fireAsync(kept.r.find(node=>node.type==='BusinessPicker'),'onChange','shop');
 assert.deepEqual(kept.feedback,['This transaction keeps its business.']);
 const failed=open({businesses,onBusiness:async()=>{throw Error('');}});
 await failed.r.fireAsync(failed.r.find(node=>node.type==='BusinessPicker'),'onChange','shop');
 assert.deepEqual(failed.feedback,['error: Could not save changes.']);
 const fixed=open({businesses,record:{kind:'Living expense',business_id:'shop',frequency:'Monthly'}});
 assert.equal(text(fixed.value('Business')),'Corner shop','a schedule keeps its business; the name shows');
});

test('tags toggle on and off, and a failed save says so',async()=>{
 const view=open();
 const selector=()=>view.r.find(node=>node.type==='TagSelector');
 await view.r.fireAsync(selector(),'onToggle','keep');
 assert.deepEqual(selector().props.selected,['keep']);
 await view.r.fireAsync(selector(),'onToggle','keep');
 assert.deepEqual(view.calls.tags,[[['keep'],[]],[[],['keep']]]);
 assert.deepEqual(selector().props.selected,[]);
 const failed=open({tagging:{tags:[],tagIds:[],onTags:async()=>{throw Error('Tag refused');},onCreateTag:async()=>'x'}});
 await failed.r.fireAsync(failed.r.find(node=>node.type==='TagSelector'),'onToggle','keep');
 assert.deepEqual(failed.feedback,['error: Tag refused']);
});

test('edit, split, delete and close act on the transaction; a read-only one offers neither',()=>{
 const view=open({onSplit:()=>view.calls.split=1});
 const actions=view.r.find(node=>node.props?.className==='transaction-details-actions');
 assert.deepEqual(actions.children.map(node=>node.type),['DeleteButton','button'],'the bin stands at the footer\'s start, Edit at its end');
 view.r.fire(view.r.find(node=>node.type==='button'&&text(node)==='Split transaction'),'onClick');
 assert.equal(view.calls.split,1);
 view.r.fire(view.r.find(node=>node.type==='DeleteButton'),'onClick');
 assert.equal(view.calls.deleted,1);
 view.r.fire(view.r.find(node=>node.type==='button'&&text(node)==='Edit'),'onClick');
 assert.equal(view.calls.edited,1);
 view.r.fire(view.r.find(node=>node.type==='dialog'),'onOpenChange',false);
 assert.equal(view.calls.closed,1);
 const readOnly=open({editable:false,onDelete:undefined});
 assert.equal(readOnly.r.all(node=>node.type==='DeleteButton'||node.type==='button').length,0);
});

test('the category changes right in the details, and a transaction written by a larger action names where it came from',async()=>{
 const categories=[{id:'c1',name:'Housing',direction:'expense'}],record={kind:'Other expense',mortgage_payment_id:'m',payment_principal:5,payment_interest:6,amount:11};
 const calls=[];
 const view=open({record,categoryEditing:{categories,onChange:async choice=>{calls.push(choice);return 1;}},origin:{label:'Payment on Home',openLabel:'Open mortgage',onOpen:()=>calls.push('opened')}});
 assert.deepEqual(view.rows(),['Amount','Date','Category','Source','Principal','Interest','Tags']);
 const picker=()=>view.r.find(node=>node.type==='CategoryPicker');
 assert.deepEqual(view.r.all(node=>node.type==='CategoryBadge').map(badge=>badge.props.label),['Other expense']);
 await view.r.fireAsync(picker(),'onChange',{kind:'Other expense',category_id:'c1'});
 assert.deepEqual(calls,[{kind:'Other expense',category_id:'c1'}]);
 assert.deepEqual(view.feedback,['saved']);
 assert.deepEqual(view.r.all(node=>node.type==='CategoryBadge').map(badge=>badge.props.label),['Other expense','Housing'],'the new category shows at once');
 assert.equal(view.r.find(node=>node.type==='CategoryIcon').props.kind,'Housing');
 // The source line names the mortgage and opens it.
 assert.equal(text(view.value('Source')),'Payment on HomeOpen mortgage');
 view.r.fire(view.value('Source').children[0].children[1],'onClick');
 assert.equal(calls.at(-1),'opened');
 // A transfer fee has nowhere to open: the line only says so.
 const fee=open({record:{kind:'Other expense',operation_id:'o'},origin:{label:'Transfer or repayment fee.'}});
 assert.equal(text(fee.value('Source')),'Transfer or repayment fee.');
 assert.equal(fee.r.all(node=>node.type==='CategoryPicker').length,0,'without categoryEditing the category is only shown');
 // A change that moved nothing, and one that failed, say so.
 const kept=open({record,categoryEditing:{categories,onChange:async()=>0}});
 await kept.r.fireAsync(kept.r.find(node=>node.type==='CategoryPicker'),'onChange',{kind:'Charity',category_id:null});
 assert.deepEqual(kept.feedback,['This transaction keeps its category.']);
 const failed=open({record,categoryEditing:{categories,onChange:async()=>{throw Error('');}}});
 await failed.r.fireAsync(failed.r.find(node=>node.type==='CategoryPicker'),'onChange',{kind:'Charity',category_id:null});
 assert.deepEqual(failed.feedback,['error: Could not save changes.']);
});

test('the account, property, business and category open their own pages, each only where there is one to open',()=>{
 const opened=[];
 const businesses=[{id:'shop',name:'Corner shop'},{id:'cafe',name:'Café'}];
 const opens={account:()=>opened.push('account'),property:()=>opened.push('property'),business:id=>id==='shop'?()=>opened.push('business '+id):undefined,categoryHref:category=>'/transactions?category='+category};
 const view=open({opens,businesses,accountName:'Everyday checking',propertyName:'Lakeside condo',record:{business_id:'shop'}});
 const link=name=>view.r.find(node=>node.props?.className==='transaction-details-link'&&node.props['aria-label']==='Open '+name);
 assert.equal(text(link('Everyday checking')),'Everyday checking','a plain name is the link itself');
 for(const name of ['Everyday checking','Lakeside condo','Corner shop'])view.r.fire(link(name),'onClick');
 assert.deepEqual(opened,['account','property','business shop']);
 // The business still changes in place: its picker stays beside the arrow.
 assert.equal(view.r.all(node=>node.type==='BusinessPicker').length,1);
 const category=link('Living expense');
 assert.deepEqual([category.type,category.props.href],['a','/transactions?category=Living expense']);
 view.r.fire(category,'onClick');
 assert.equal(view.calls.closed,1,'following the category link closes the details');
 const custom=open({opens,categoryName:'Cafés',record:{custom_category_id:'c1'}});
 assert.equal(custom.r.find(node=>node.props?.['aria-label']==='Open Cafés').props.href,'/transactions?category=c1');
 // Nothing to open: no page for this business, and no opens at all.
 const none=open({opens,businesses,record:{business_id:'cafe'}});
 assert.equal(none.r.all(node=>node.props?.['aria-label']==='Open Café').length,0);
 const bare=open({accountName:'Everyday checking'});
 assert.equal(bare.r.all(node=>node.props?.className==='transaction-details-link').length,0);
 assert.equal(text(bare.value('Account')),'Everyday checking');
});

test('a payment of a schedule names it and opens it, and tags link through the selector',()=>{
 let opened=0;
 const view=open({schedule:{name:'Rent',onOpen:()=>opened++},opens:{tagHref:id=>'/transactions?tag='+id}});
 assert.deepEqual(view.rows(),['Amount','Date','Category','Recurring','Tags']);
 view.r.fire(view.r.find(node=>node.props?.['aria-label']==='Open Rent'),'onClick');
 assert.equal(opened,1);
 const selector=view.r.find(node=>node.type==='TagSelector');
 assert.equal(selector.props.hrefFor('keep'),'/transactions?tag=keep');
 selector.props.onOpen();assert.equal(view.calls.closed,1);
 assert.equal(text(open({schedule:{name:'Rent'}}).value('Recurring')),'Rent','with nothing to open the schedule is still named');
});
