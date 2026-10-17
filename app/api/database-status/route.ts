import {postgrestFailure,signInAgain} from '@/lib/api-route';
import {session,supa} from '@/lib/supabase';
import {databaseUpdateMessage,requiredSchemaVersion,schemaVersionOf,supportsDatabase} from '@/lib/database-capabilities';
const noStore={'Cache-Control':'no-store'};
/** Whether the database has every migration this version of the app needs. Each migration raises
 * `finance_capabilities()`'s schema_version to its own number, so the versions say how far behind it is. */
export async function GET(){
 try{
  const auth=await session();if(!auth)return signInAgain();
  const response=await supa('/rest/v1/rpc/finance_capabilities',{method:'POST',body:'{}'},auth.token);
  if(!response.ok){
   const failure=await postgrestFailure(response,'Could not check the database. Please try again.',{status:503,codes:{PGRST202:databaseUpdateMessage}});
   const {error}=await failure.json() as {error:string};
   // A missing function means the database predates every versioned migration.
   const known=error===databaseUpdateMessage?{compatible:false,schemaVersion:null,requiredVersion:requiredSchemaVersion}:{};
   return Response.json({error,...known},{status:failure.status,headers:noStore});
  }
  const capabilities=await response.json();
  const versions={schemaVersion:schemaVersionOf(capabilities),requiredVersion:requiredSchemaVersion};
  if(!supportsDatabase(capabilities))return Response.json({error:databaseUpdateMessage,compatible:false,...versions},{status:503,headers:noStore});
  return Response.json({compatible:true,...versions},{headers:noStore});
 }catch{return Response.json({error:'Could not check the database. Please try again.'},{status:503,headers:noStore});}
}
