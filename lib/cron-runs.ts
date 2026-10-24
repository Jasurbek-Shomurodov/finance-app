// Each scheduled job's run, kept in cron_runs (migration 153): when it started, how it ended and what it answered. A
// Hobby project keeps Vercel's logs for about an hour, so this is where a morning digest that never arrived can still
// be read. A row left 'running' is a run the platform cut off before it could answer. Recording never fails the job.
import {scrub} from './monitoring';
import type {ServiceDatabase} from './service-role';
const runs='/rest/v1/cron_runs';
/** Days a run stays recorded; older runs of the same job are dropped as each new one finishes. */
export const cronRunDays=90;
async function startRun(db:ServiceDatabase,job:string){
 const response=await db.write(runs,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({job})}).catch(()=>null);
 if(!response?.ok)return null;
 const rows:unknown=await response.json().catch(()=>null);
 const id=Array.isArray(rows)?(rows[0] as {id?:unknown}|undefined)?.id:undefined;
 return typeof id==='number'?id:null;
}
/** Why a run failed, short enough for its record and scrubbed (lib/monitoring.ts): a message quoting a URL, a token or
 * a row's value never reaches the 503 body or cron_runs. */
export const runFailure=(error:unknown)=>scrub(error instanceof Error?error.message:String(error),300);
/** cron_runs.result must fit pg_column_size(result) <= 8192. Longer strings are cut and an answer still too long is
 * reduced to its status, so the row is finished rather than left 'running' by a refused PATCH. */
export const resultLimits={field:300,bytes:7000};
export function boundedResult(result:Record<string,unknown>):Record<string,unknown>{
 const trimmed=Object.fromEntries(Object.entries(result).map(([key,value])=>[key,typeof value==='string'&&value.length>resultLimits.field?value.slice(0,resultLimits.field)+'…':value]));
 return new TextEncoder().encode(JSON.stringify(trimmed)).length<=resultLimits.bytes?trimmed:{status:trimmed.status,ms:trimmed.ms,truncated:true};
}
/** Runs a cron job and records its run: started before it begins, then finished with its HTTP status, how long it took
 * and the JSON it answered (counts, or the error message). */
export async function recordCronRun(db:ServiceDatabase,job:string,run:()=>Promise<Response>,now:()=>Date=()=>new Date()):Promise<Response>{
 const started=now(),id=await startRun(db,job);
 let response:Response;
 try{response=await run();}
 catch(error){response=Response.json({error:runFailure(error)},{status:500});}
 const finished=now();
 if(id!==null){
  const answer=await response.clone().json().catch(()=>null) as Record<string,unknown>|null;
  const result=boundedResult({status:response.status,ms:finished.getTime()-started.getTime(),...answer});
  await db.write(`${runs}?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({finished_at:finished.toISOString(),status:response.ok?'ok':'failed',result})}).catch(()=>null);
 }
 const cutoff=new Date(finished.getTime()-cronRunDays*86400000).toISOString();
 await db.write(`${runs}?job=eq.${job}&started_at=lt.${cutoff}`,{method:'DELETE'}).catch(()=>null);
 return response;
}
