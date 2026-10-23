import { timingSafeEqual } from 'node:crypto';
import { reportError } from '@/lib/monitoring';
import { serviceDatabase } from '@/lib/service-role';
import { answerCallback, deliverTelegramMessage, telegramConfig } from '@/lib/telegram';
import { handleTelegramUpdate, type TelegramUpdate } from '@/lib/telegram-bot';
export const maxDuration=30;
// Telegram retries an update until it gets a 2xx, so only database failures answer with an error.
export async function POST(req:Request){
 const config=telegramConfig();
 if(!config)return new Response(null,{status:503});
 const provided=req.headers.get('x-telegram-bot-api-secret-token')??'';
 if(Buffer.byteLength(provided)!==Buffer.byteLength(config.webhookSecret)||!timingSafeEqual(Buffer.from(provided),Buffer.from(config.webhookSecret)))return new Response(null,{status:401});
 const db=serviceDatabase();
 if(!db)return new Response(null,{status:503});
 let update:TelegramUpdate;
 try{update=await req.json() as TelegramUpdate;}catch{return new Response(null,{status:200});}
 try{
  const outcome=await handleTelegramUpdate(update,db);
  if(outcome.callbackId)await answerCallback(outcome.callbackId,config);
  let failed=0;
  for(const reply of outcome.replies)if(await deliverTelegramMessage(reply,config)==='failed')failed++;
  // A reply Telegram would not take is not retried (the update was handled), but it is counted: only numbers travel, never a chat or its text.
  if(failed)await reportError('telegram-webhook',Object.assign(new Error('Telegram did not accept every reply.'),{name:'TelegramSendError',stack:''}),{route:'/api/telegram/webhook',status:200,counts:{failed,replies:outcome.replies.length}},{alert:'repeated'});
  return new Response(null,{status:200});
 }catch(error){
  // Telegram retries the update, so the alert is deduplicated per failure (lib/monitoring.ts).
  await reportError('telegram-webhook',error,{route:'/api/telegram/webhook',status:503},{alert:true});
  return new Response(null,{status:503});
 }
}
