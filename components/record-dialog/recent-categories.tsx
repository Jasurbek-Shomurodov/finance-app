"use client";
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { useLanguage } from '@/components/language-provider';

/** The categories used last, one tap each, beside the full category list. Shown once there are at least two to choose from. */
export function RecentCategories({keys,value,label,disabled=false,onChoose}:{keys:string[];value:string;label:(key:string)=>string;disabled?:boolean;onChoose:(key:string)=>void}){
 const {t}=useLanguage();
 if(keys.length<2)return null;
 return <div className="recent-categories" role="group" aria-label={t('Category')}>{keys.map(key=><button type="button" key={key} aria-pressed={key===value} disabled={disabled} onClick={()=>onChoose(key)}><CategoryIcon kind={key} size="sm"/>{label(key)}</button>)}</div>;
}
