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
  '@/components/ui/button':{Button:host('button')},'lucide-react':{Pencil:host('pencil')},
  '@/components/presentation-foundation/delete-button':{DeleteButton:host('DeleteButton')},
  '@/components/presentation-foundation/category-badge':{CategoryBadge:host('CategoryBadge')},
  '@/components/transactions/pickers':{BusinessPicker:host('BusinessPicker')},
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

test('the details list what a transaction is: amount, category, date, and only the rows it has',()=>{
 const plain=open();
 assert.deepEqual(plain.rows(),['Amount','Category','Date','Frequency','Tags']);
 assert.equal(text(plain.value('Amount')),'−$42');
 const full=open({incoming:true,categoryName:'Cafés',accountName:'Everyday checking',propertyName:'Lakeside condo',attachments:'receipt.pdf',record:{kind:'Other income',amount:1200,custom_category_id:'c1',end_date:'2026-12-31',notes:'Paid early',account_currency:'EUR',account_exchange_rate:1.08,payment_type:'bonus'}});
 assert.deepEqual(full.rows(),['Amount','Category','Date','Frequency','Last active date','Tags','Property','Account','Exchange rate','Notes','Attachments']);
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

test('edit, delete and close act on the transaction; a read-only one offers neither',()=>{
 const view=open();
 view.r.fire(view.r.find(node=>node.type==='DeleteButton'),'onClick');
 assert.equal(view.calls.deleted,1);
 view.r.fire(view.r.find(node=>node.type==='button'),'onClick');
 assert.equal(view.calls.edited,1);
 view.r.fire(view.r.find(node=>node.type==='dialog'),'onOpenChange',false);
 assert.equal(view.calls.closed,1);
 const readOnly=open({editable:false,onDelete:undefined});
 assert.equal(readOnly.r.all(node=>node.type==='DeleteButton'||node.type==='button').length,0);
});
