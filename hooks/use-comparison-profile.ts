"use client";
import { useEffect,useState } from 'react';
import { showSaved } from '@/lib/feedback';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { requestJson } from '@/lib/api-client';
import type { ComparisonProfile } from '@/lib/comparison-profile';

/** Stores the day portfolio tracking begins; null returns to the first investment activity. */
export async function saveTrackingStartRequest(date:string|null){
 await requestJson('/api/comparison-profile',{method:'PATCH',body:{tracking_start:date},fallback:'Could not save the tracking start date.'});
}
const noProfile:ComparisonProfile|null=null;
/** Regaining focus reads the profile again only this long after the last read. */
export const focusRereadMs=60_000;
// The owner's benchmark choices and tracking start, shared by the Overview chart and its figures.
// Sample workspaces cannot save, so their tracking start lasts for the visit.
// The profile belongs to the signed-in session, so it reads again when settings are saved, and when the window regains
// focus a minute or more after the last read (switching tabs back and forth does not read it each time).
export function useComparisonProfile(demo:boolean){
 const [revision,setRevision]=useState(0);
 const remote=useOwnerResource('/api/comparison-profile','session',!demo,revision,noProfile);
 const [demoStart,setDemoStart]=useState<string|null>(null);
 useEffect(()=>{
  let readAt=Date.now();
  const refresh=()=>{readAt=Date.now();setRevision(value=>value+1);};
  const focused=()=>{if(Date.now()-readAt>=focusRereadMs)refresh();};
  window.addEventListener('comparison-settings-saved',refresh);window.addEventListener('focus',focused);
  return()=>{window.removeEventListener('comparison-settings-saved',refresh);window.removeEventListener('focus',focused);};
 },[]);
 async function saveTrackingStart(date:string|null){
  if(demo){setDemoStart(date);showSaved();return;}
  await saveTrackingStartRequest(date);
  remote.update(current=>current&&{...current,tracking_start:date});
  showSaved();
 }
 return {profile:remote.data,error:remote.error,retry:remote.retry,trackingStart:demo?demoStart:remote.data?.tracking_start??null,saveTrackingStart};
}
