// Retry reads only: a retry must never repeat a financial mutation.
// `cache` defaults to no-store; a read whose answer says how long it keeps (benchmarks) may pass 'default'.
export async function refreshRead(url:string,options:{signal?:AbortSignal;cache?:RequestCache}={},delays:readonly number[]=[500,1500,3000]):Promise<Response>{
 const {signal,cache='no-store'}=options;
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();
  try{
   const response=await fetch(url,{signal,cache});
   if(response.ok||![408,429,500,502,503,504].includes(response.status)||attempt>=delays.length)return response;
  }catch(error){if(signal?.aborted||attempt>=delays.length)throw error;}
  await new Promise<void>((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
   const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delays[attempt]);
   signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted)abort();
  });
 }
}
