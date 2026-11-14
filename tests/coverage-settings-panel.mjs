import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,hostModule,language,text,byLabel,byText,byType,event} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';

const {formatMoney}=loadTS('lib/format.ts');
const {currencyLabel}=loadTS('lib/currencies.ts');

function panel(t,props={},{reply,mobile=false}={}){
 if(!t.timersMocked){t.mock.timers.enable({apis:['setTimeout']});t.timersMocked=true;}
 const r=createRenderer(),saved=[],errors=[],savedNotices=[],requests=[],retries=[],themes=[];
 const replies=[];
 const {SettingsPanel}=r.load('components/settings-panel.tsx',{
  '@/components/language-provider':language('en'),
  '@/components/ui/button':hostModule(),'@/components/ui/input':hostModule(),'@/components/ui/native-select':hostModule(),'@/components/ui/dialog':hostModule(),'@/components/ui/alert-dialog':hostModule(),'lucide-react':hostModule(),
  '@/components/ui/popover':hostModule(),'@/components/ui/command':hostModule(),'@/hooks/use-mobile':{useIsMobile:()=>mobile},'next-themes':{useTheme:()=>({theme:themes.at(-1),setTheme:theme=>themes.push(theme)})},
  '@/components/presentation-foundation/sortable':hostModule(),'@/components/presentation-foundation/delete-button':hostModule(),
  '@/components/presentation-foundation/inline-error':hostModule(),'@/components/presentation-foundation/info-hint':hostModule(),'@/components/presentation-foundation/screen-skeletons':hostModule(),
  '@/lib/feedback':{showError:message=>errors.push(message),showSaved:language=>savedNotices.push(language)},
  '@/lib/api-client':{requestJson:async(url,options)=>{requests.push([url,options]);const next=replies.shift()??reply;if(next instanceof Error)throw next;return typeof next==='function'?next(options.body):next??options.body;}},
 });
 const base={initial:{display_name:'Ada',country:'GB',language:'en',currencies:['USD'],font:'inter'},demo:false,onSaved:p=>saved.push(p),loading:false,loadError:'',onRetry:()=>retries.push(true),ratesDate:'2026-09-30'};
 const view=(next={})=>r.render(r.react.createElement(SettingsPanel,Object.assign(base,next)));
 view(props);
 const select=value=>r.find(node=>node.type==='NativeSelect'&&node.children.some(option=>option.type==='option'&&option.props.value===value));
 const settle=async(ms=0)=>{t.mock.timers.tick(ms);await r.flush();};
 const country=code=>r.find(node=>node.type==='CommandItem'&&node.props.value===code);
 return {r,view,saved,errors,savedNotices,requests,retries,replies,select,settle,themes,country};
}

test('loading shows the preference cards shimmering instead of the form',t=>{
 const {r}=panel(t,{loading:true});
 assert.equal(r.find(byType('PreferencesSkeleton')).props.label,'Loading settings…');
 assert.equal(r.all(byType('form')).length,0);
 assert.equal(text(r.find(byType('h2'))),'Profile & preferences'+'Keep your profile details, language, and currency preferences up to date.');
});

test('a failed load offers a retry, disables the fields and never saves fallback preferences',async t=>{
 const s=panel(t,{loadError:'Could not load settings.'});
 assert.equal(s.r.find(byType('InlineError')).props.message,'Could not load settings.');
 s.r.fire(s.r.find(byText('Button','Retry loading settings')),'onClick');
 assert.equal(s.retries.length,1);
 assert.equal(s.r.find(byType('fieldset')).props.disabled,true);
 s.r.fire(s.select('fr'),'onChange',{target:{value:'fr'}});
 await s.settle(1000);
 assert.deepEqual(s.requests,[]);assert.deepEqual(s.saved,[]);
});

test('a changed setting saves at once to the server without the onboarded flag',async t=>{
 const s=panel(t,{initial:{display_name:'Ada',country:'GB',language:'en',currencies:['USD'],font:'inter',onboarded:true}},{reply:body=>({...body,display_name:'Ada'})});
 s.r.fire(s.select('fr'),'onChange',{target:{value:'fr'}});
 await s.settle();
 assert.equal(s.requests.length,1);
 const [url,options]=s.requests[0];
 assert.equal(url,'/api/settings');assert.equal(options.method,'PUT');
 assert.equal(options.body.language,'fr');assert.equal(options.body.onboarded,undefined);
 assert.equal(s.saved.at(-1).language,'fr');assert.deepEqual(s.savedNotices,['fr']);
 await s.settle(1000);
 assert.equal(s.requests.length,1,'a saved draft is not sent again');
 // The country is a searchable list: translated names, the chosen one named on the field.
 const field=()=>s.r.find(node=>node.type==='Button'&&node.props.id==='profile-country');
 assert.equal(field().props.role,'combobox');assert.equal(text(field()),'United Kingdom');
 const countries=()=>s.r.all(byType('CommandItem')).map(text);
 assert.equal(countries()[0],'Select your country');assert.ok(countries().length>200);
 s.r.fire(s.r.find(byType('CommandInput')),'onValueChange','germ');
 assert.deepEqual(countries(),['Germany'],'the search narrows the list and leaves out the clearing choice');
 s.r.fire(s.r.find(byType('CommandInput')),'onValueChange','qqq');
 assert.deepEqual(countries(),[]);assert.equal(text(s.r.find(byType('CommandEmpty'))),'No matching countries.');
 s.r.fire(s.r.find(byType('CommandInput')),'onValueChange','de');
 assert.ok(countries().includes('Germany'),'a two-letter code finds its country');
 s.r.fire(s.r.find(byType('Popover')),'onOpenChange',true);
 assert.equal(field().props['aria-expanded'],true);
 s.r.fire(s.country('DE'),'onSelect');
 await s.settle();
 assert.equal(s.requests.at(-1)[1].body.country,'DE');
 assert.equal(text(field()),'Germany');assert.equal(field().props['aria-expanded'],false);
 assert.equal(s.r.find(byType('CommandInput')).props.value,'','choosing clears the search');
 // The first choice clears the country again.
 s.r.fire(s.country('none'),'onSelect');
 await s.settle();
 assert.equal(s.requests.at(-1)[1].body.country,'');assert.equal(field().props['data-empty'],true);
 // On a phone the same list opens as a full-screen sheet.
 assert.equal(s.r.all(byType('Dialog')).filter(node=>node.props.open!==undefined&&s.r.all(byType('CommandInput'),node).length).length,0);
 const phone=panel(t,{},{mobile:true});
 const sheet=()=>phone.r.find(node=>node.type==='Dialog'&&phone.r.all(byType('CommandInput'),node).length>0);
 assert.equal(sheet().props.open,false);
 phone.r.fire(sheet(),'onOpenChange',true);
 assert.equal(sheet().props.open,true);assert.equal(phone.r.find(byType('Popover')).props.open,false);
});

test('typing a name waits for a pause, and leaving the field saves at once; demo mode trims locally',async t=>{
 const s=panel(t,{demo:true,ratesDate:'2026-09-30'});
 assert.equal(s.r.all(node=>node.props.className==='preferences-rates-credit').length,0,'demo shows no rates credit');
 const name=()=>s.r.find(node=>node.props.id==='profile-name');
 s.r.fire(name(),'onChange',{target:{value:'  Grace  '}});
 await s.settle(899);
 assert.deepEqual(s.saved,[],'typing waits');
 await s.settle(1);
 assert.equal(s.saved.at(-1).display_name,'Grace','demo saves the trimmed name locally');
 assert.deepEqual(s.requests,[]);
 assert.equal(name().props.value,'Grace','the field shows what was saved');
 s.r.fire(name(),'onChange',{target:{value:'Grace H'}});
 s.r.fire(name(),'onBlur');
 await s.settle(0);
 assert.equal(s.saved.at(-1).display_name,'Grace H','leaving the field saves without waiting');
 s.r.fire(name(),'onChange',{target:{value:'Grace Hopper'}});
 const e=event();s.r.fire(s.r.find(byType('form')),'onSubmit',e);
 assert.equal(e.defaultPrevented,true);
 await s.settle(0);
 assert.equal(s.saved.at(-1).display_name,'Grace Hopper','pressing Enter saves at once');
 // A missing name saves as empty.
 const blank=panel(t,{demo:true,initial:{language:'en',currencies:['USD']}});
 blank.r.fire(blank.select('de'),'onChange',{target:{value:'de'}});
 await blank.settle();
 assert.equal(blank.saved.at(-1).display_name,'');
 assert.equal(blank.r.find(node=>node.props.id==='profile-name').props.value,'');
 assert.equal(text(blank.r.find(node=>node.type==='Button'&&node.props.id==='profile-country')),'Select your country');
});

test('a failed save reports the error once and retries only after another change',async t=>{
 const s=panel(t);
 s.replies.push(Error('Settings service is down.'));
 s.r.fire(s.select('es'),'onChange',{target:{value:'es'}});
 await s.settle();
 assert.deepEqual(s.errors,['Settings service is down.']);
 await s.settle(1000);
 assert.equal(s.requests.length,1,'the failed draft is not retried in a loop');
 s.r.fire(s.select('es'),'onChange',{target:{value:'de'}});
 await s.settle();
 assert.equal(s.requests.at(-1)[1].fallback,'Could not save settings. Try again.','a reply without a message reads as this one');
 s.r.fire(s.select('de'),'onChange',{target:{value:'it'}});
 await s.settle();
 assert.equal(s.saved.at(-1).language,'it');
});

test('a change made while a save is running is kept and saved next',async t=>{
 const s=panel(t);
 let release;s.replies.push(new Promise(resolve=>{release=resolve;}).then(()=>({display_name:'Ada',country:'GB',language:'fr',currencies:['USD'],font:'inter'})));
 s.r.fire(s.select('fr'),'onChange',{target:{value:'fr'}});
 await s.settle();
 assert.equal(s.requests.length,1);
 s.r.fire(s.country('FR'),'onSelect');
 release();await s.settle();await s.settle();
 assert.equal(s.requests.length,2);
 assert.equal(s.requests[1][1].body.country,'FR');assert.equal(s.requests[1][1].body.language,'fr');
});

test('the font is chosen from preview cards that show the primary currency through the money formatter',async t=>{
 const s=panel(t,{initial:{language:'en',currencies:['EUR','USD'],font:'unknown'}});
 const radio=value=>s.r.find(node=>node.type==='input'&&node.props.type==='radio'&&node.props.value===value);
 assert.equal(radio('inter').props.checked,true,'an unknown font falls back to Inter');assert.equal(radio('onest').props.checked,false);
 const cards=s.r.all(node=>node.props.className==='choice-card'&&node.props['data-font']);
 assert.deepEqual(cards.map(card=>card.props['data-font']),['inter','onest'],'each card is set in its own font');
 for(const card of cards)assert.equal(text(card).replace(/^(Inter|Onest)/,''),'Net worth'+formatMoney(1234567,'EUR','en'));
 s.r.fire(radio('onest'),'onChange');
 await s.settle();
 assert.equal(s.requests.at(-1)[1].body.font,'onest');
 assert.equal(radio('onest').props.checked,true);
 assert.equal(s.r.find(node=>node.props['data-font']==='onest').props['data-checked'],true);
});

test('the theme is light, dark or the device\u2019s own, kept on the device rather than in the account',async t=>{
 const s=panel(t);
 const radio=value=>s.r.find(node=>node.type==='input'&&node.props.type==='radio'&&node.props.value===value);
 assert.equal(radio('system').props.checked,true,'nothing chosen yet follows the device');
 assert.deepEqual(s.r.all(node=>node.props.className==='theme-preview').map(node=>node.props['data-preview']),['light','dark','system']);
 s.r.fire(radio('dark'),'onChange');
 await s.settle(1000);
 assert.deepEqual(s.themes,['dark']);assert.equal(radio('dark').props.checked,true);
 assert.deepEqual(s.requests,[],'the theme is not an account setting');
});

test('the preferred currencies are one ordered list: the first is primary, and either can be removed',async t=>{
 const s=panel(t,{initial:{language:'en',currencies:['USD','EUR']},rates:{USD:1,EUR:.8}});
 const list=()=>s.r.find(node=>node.props.className==='preferred-currency-list');
 assert.equal(text(list()),'USDPrimaryEUR1 EUR = 1.25 USD','the codes alone, never the currency names; the pair is quoted from the dearer currency');
 assert.equal(s.r.all(byType('NativeSelect')).length,1,'no separate Primary select: only the language is a select');
 assert.equal(text(s.r.find(node=>node.props.className==='currency-search-trigger')),'Change currencies');
 assert.equal(text(s.r.find(node=>node.props.className==='preferred-currency-count')),'2 of 2');
 const sortable=()=>s.r.find(byType('SortableList'));
 assert.deepEqual(sortable().props.items,['USD','EUR']);assert.equal(sortable().props.disabled,false);assert.equal(sortable().props.nameOf('EUR'),'EUR');
 s.r.fire(sortable(),'onMove','EUR','USD');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['EUR','USD'],'dragging a currency to the top makes it primary');
 assert.equal(text(list()),'EURPrimaryUSD1 EUR = 1.25 USD','whichever comes first');
 const bin=code=>s.r.find(node=>node.type==='DeleteButton'&&node.props.label==='Remove '+code);
 assert.equal(bin('EUR').props.reason,undefined);
 s.r.fire(bin('EUR'),'onClick');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['USD'],'removing the primary leaves the other one as primary');
 assert.equal(text(list()),'USDPrimary');
 assert.equal(bin('USD').props.reason,'Keep at least one currency');assert.equal(sortable().props.disabled,true);
 assert.equal(text(s.r.find(node=>node.props.className==='currency-search-trigger')),'Add currency');
 assert.equal(text(s.r.find(node=>node.props.className==='preferred-currency-count')),'1 of 2');
 // The free rates service is credited with the date written out.
 assert.equal(text(s.r.find(node=>node.props.className==='preferences-rates-credit')),'Updated 30 September 2026Rates By Exchange Rate API');
 // Without a usable rate the second row shows its code alone.
 const unrated=panel(t,{initial:{language:'en',currencies:['USD','EUR']}});
 assert.equal(text(unrated.r.find(node=>node.props.className==='preferred-currency-list')),'USDPrimaryEUR');
});

test('the currency catalogue searches, adds, refuses the last one and asks which one to replace when full',async t=>{
 const s=panel(t,{ratesDate:null});
 assert.equal(s.r.all(node=>node.props.className==='preferences-rates-credit').length,0);
 const dialog=()=>s.r.find(node=>node.type==='Dialog'&&s.r.all(byLabel('Search currencies'),node).length>0);
 s.r.fire(dialog(),'onOpenChange',true);
 assert.equal(dialog().props.open,true);
 const search=()=>s.r.find(byLabel('Search currencies'));
 const boxes=()=>s.r.all(node=>node.type==='input'&&node.props.type==='checkbox');
 assert.ok(boxes().length>100);
 s.r.fire(search(),'onChange',{target:{value:'euro'}});
 const euro=s.r.find(node=>node.type==='label'&&text(node)===currencyLabel('EUR','en'));
 s.r.fire(euro.children[0],'onChange');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['USD','EUR']);
 // A third currency asks which one it replaces.
 s.r.fire(search(),'onChange',{target:{value:'yen'}});
 const yen=s.r.find(node=>node.type==='label'&&text(node).startsWith('JPY'));
 s.r.fire(yen.children[0],'onChange');
 const alert=()=>s.r.find(byType('AlertDialog'));
 assert.equal(alert().props.open,true);
 assert.equal(text(s.r.find(byType('AlertDialogTitle'))),'You already have two currencies');
 assert.equal(text(s.r.find(byType('AlertDialogDescription'))),'You can keep up to two preferred currencies. Choose which one JPY replaces.');
 assert.deepEqual(s.r.all(byType('AlertDialogAction')).map(text),['Replace USD','Replace EUR']);
 assert.equal(text(s.r.find(byType('AlertDialogCancel'))),'Cancel');
 s.r.fire(s.r.find(byText('AlertDialogAction','Replace EUR')),'onClick');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['USD','JPY']);
 s.r.fire(alert(),'onOpenChange',true);assert.equal(alert().props.open,true,'opening keeps the notice');
 s.r.fire(alert(),'onOpenChange',false);assert.equal(alert().props.open,false);
 // Nothing matches.
 s.r.fire(search(),'onChange',{target:{value:'zzzz'}});
 assert.equal(text(s.r.find(node=>node.props.role==='status')),'No matching currencies.');
 s.r.fire(dialog(),'onOpenChange',false);
 assert.equal(search().props.value,'','closing clears the search');
 assert.equal(dialog().props.open,false);
 // Clearing back to one, then trying to clear the last one.
 s.r.fire(s.r.find(node=>node.type==='label'&&text(node).startsWith('JPY')).children[0],'onChange');
 await s.settle();
 assert.deepEqual(s.requests.at(-1)[1].body.currencies,['USD']);
 s.r.fire(s.r.find(node=>node.type==='label'&&text(node).startsWith('USD')).children[0],'onChange');
 assert.equal(text(s.r.find(byType('AlertDialogTitle'))),'Keep at least one currency');
 assert.equal(text(s.r.find(byType('AlertDialogDescription'))),'USD is your only currency, so it can’t be cleared. Pick another currency first.');
 assert.deepEqual(s.r.all(byType('AlertDialogAction')).map(text),['OK']);
});

test('running the welcome setup again waits for saves and reports a failure',async t=>{
 let finish;const runs=[];
 const s=panel(t,{onRestartSetup:()=>{runs.push(true);return new Promise((resolve,reject)=>{finish={resolve,reject};});}});
 const button=()=>s.r.find(byText('Button','Run setup again'));
 assert.equal(button().props.disabled,false);
 s.r.fire(button(),'onClick');
 assert.equal(button().props.disabled,true,'busy while the setup restarts');
 finish.reject(Error('Could not restart setup.'));await s.settle();
 assert.deepEqual(s.errors,['Could not restart setup.']);
 assert.equal(button().props.disabled,false);
 s.r.fire(button(),'onClick');finish.resolve();await s.settle();
 assert.equal(runs.length,2);assert.equal(s.errors.length,1);
 // An unsaved change disables it.
 s.r.fire(s.r.find(node=>node.props.id==='profile-name'),'onChange',{target:{value:'Ada L'}});
 assert.equal(button().props.disabled,true);
 assert.equal(panel(t,{onRestartSetup:undefined}).r.all(byText('Button','Run setup again')).length,0);
});
