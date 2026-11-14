"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { Briefcase, ChartPie, Lock, Send, SlidersHorizontal, Tag, TrendingUp, Upload, Users, Zap, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { PageHeader } from '@/components/presentation-foundation/page-header';

// Settings is an index card of two groups beside one section at a time, like the reference app's settings. Each
// section keeps its own anchor (#rules, #tags, #security…), and the old view anchors (#account) still open the right one.
const groups: ReadonlyArray<{label:string;sections:ReadonlyArray<{id:string;label:string;icon:LucideIcon}>}> = [
 {label:'Personal',sections:[
  {id:'preferences',label:'Profile & preferences',icon:SlidersHorizontal},
  {id:'telegram',label:'Telegram',icon:Send},
  {id:'security',label:'Account access',icon:Lock},
 ]},
 {label:'Workspace',sections:[
  {id:'household',label:'Household sharing',icon:Users},
  {id:'categories',label:'Categories',icon:ChartPie},
  {id:'tags',label:'Tags',icon:Tag},
  {id:'rules',label:'Rules',icon:Zap},
  {id:'businesses',label:'Businesses',icon:Briefcase},
  {id:'benchmarks',label:'Investment benchmarks',icon:TrendingUp},
  {id:'data-tools',label:'Import & backup',icon:Upload},
 ]},
];
type Section = 'preferences'|'telegram'|'security'|'household'|'categories'|'tags'|'rules'|'businesses'|'benchmarks'|'data-tools';
const sections = groups.flatMap(group => group.sections.map(section => section.id)) as Section[];
export const sectionOf = (hash: string): Section => (sections as string[]).includes(hash) ? hash as Section : 'preferences';

export function SettingsLayout({actions,...panels}:{actions?:ReactNode}&Record<Section,ReactNode>){
 const {t}=useLanguage();
 const [active,setActive]=useState<Section>('preferences');
 useEffect(()=>{
  const sync=()=>setActive(sectionOf(window.location.hash.slice(1)));
  // Links followed by the router change the address without a hashchange event.
  const followed=(event:MouseEvent)=>{if(event.target instanceof Element&&event.target.closest('a[href*="#"]'))setTimeout(sync,0);};
  sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);document.addEventListener('click',followed);
  return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);document.removeEventListener('click',followed);};
 },[]);
 const open=(section:Section)=>{setActive(section);window.history.replaceState(null,'','#'+section);};
 return <div className="settings-layout">
  <PageHeader title={t('Settings')}>{actions}</PageHeader>
  <div className="settings-columns">
   <nav className="settings-nav" aria-label={t('Settings')}>
    {groups.map(group=><div key={group.label} className="settings-nav-group">
     <h2>{t(group.label)}</h2>
     <ul>{group.sections.map(section=><li key={section.id}><button type="button" aria-current={active===section.id?'page':undefined} onClick={()=>open(section.id as Section)}><section.icon size={17} aria-hidden="true"/>{t(section.label)}</button></li>)}</ul>
    </div>)}
   </nav>
   {/* Every section stays mounted so unsaved fields survive switching. */}
   <div className="settings-sections">{sections.map(section=><section key={section} id={`settings-${section}`} className="settings-area" hidden={active!==section}>{panels[section]}</section>)}</div>
  </div>
 </div>;
}
