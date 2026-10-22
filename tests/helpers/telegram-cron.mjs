// Stand-ins for what the scheduled Telegram messages read and write: an owner's records through the two reads of
// ownerRecordsSince (lib/telegram-owner.ts), and the delivery claims of migration 129.
const cashflow=['Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'];
/** The rows a finance_records path asks for: one-time cash flow from a day (`frequency=eq.Once&…&date=gte.`), or the
 * holdings and schedules (`or=(…)`) with salaries that settled a schedule before that day. */
export function recordsFor(rows,path){
 const params=new URLSearchParams(path.split('?')[1]);
 const once=row=>row.frequency==='Once'&&cashflow.includes(row.kind);
 if(params.get('frequency')==='eq.Once'){const from=params.get('date').slice(4);return rows.filter(row=>once(row)&&row.date>=from);}
 if(params.has('or')){const from=/date\.lt\.([\d-]+)/.exec(params.get('or'))[1];return rows.filter(row=>!once(row)||(row.kind==='Salary'&&row.income_source_id&&row.date<from));}
 return rows;
}
/** telegram_deliveries: claim_telegram_delivery (migration 153) answers true for a new claim, or for one a cut-off run
 * left undelivered for five minutes (`stale`), and false otherwise; a delivered claim is marked by PATCH, a failed one
 * removed by DELETE. Rows read as the table keeps them: user_id, kind, period, delivered. */
export function deliveryTable(rows=[],{stale=()=>false}={}){
 const key=row=>`${row.user_id}|${row.kind}|${row.period}`;
 const target=path=>{const params=new URLSearchParams(path.split('?')[1]);return `${params.get('user_id').slice(3)}|${params.get('kind').slice(3)}|${params.get('period').slice(3)}`;};
 return {rows,async write(path,init){
  if(path==='/rest/v1/rpc/claim_telegram_delivery'){
   const {p_user,p_kind,p_period}=JSON.parse(init.body),row={user_id:p_user,kind:p_kind,period:p_period,delivered:false};
   const existing=rows.find(item=>key(item)===key(row));
   if(!existing){rows.push(row);return Response.json(true);}
   return Response.json(!existing.delivered&&stale(existing));
  }
  if(!path.startsWith('/rest/v1/telegram_deliveries'))throw Error('unexpected write '+path);
  const wanted=target(path);
  if(init.method==='DELETE'){rows.splice(0,rows.length,...rows.filter(row=>key(row)!==wanted));return new Response(null,{status:204});}
  if(init.method==='PATCH'){for(const row of rows)if(key(row)===wanted)Object.assign(row,JSON.parse(init.body));return new Response(null,{status:204});}
  throw Error('a claim is only taken through claim_telegram_delivery');
 }};
}
