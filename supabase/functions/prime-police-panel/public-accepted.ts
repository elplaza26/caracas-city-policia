import {parseApplicationIdentity} from '../_shared/application-identity.ts';
import {discordRequest} from './discord-client.ts';
import {withOperationLock} from './operation-lock.ts';

const CHANNEL='1564350390294552696';
const GUILD='1539970134469378068';
const BOT='1540484542354428025';
const groups=[
 {table:'police_applications',kind:'Reclutamiento',title:'📝 PRIME POLICE · Postulaciones aceptadas',intro:'Personas convocadas a entrevista IC',color:0x4d98c9,next:'Contactad con UCOP para coordinar vuestra entrevista IC.'},
 {table:'police_transfer_applications',kind:'Traslados',title:'🚔 PRIME POLICE · Traslados aceptados',intro:'Solicitudes de traslado aprobadas',color:0x45b879,next:'Contactad con UCOP para continuar el proceso de incorporación.'},
];
const safeName=(value:string)=>value.replace(/[\r\n\t]/g,' ').replace(/[<>]/g,'').replace(/([\\`*_~|\[\]()#])/g,'\\$1').slice(0,180);

async function records(table:string){
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const root=Deno.env.get('SUPABASE_URL')||'';
 if(!key||!root)throw Error('Accepted list database unavailable');
 const rows:any[]=[];
 for(let offset=0;;offset+=500){
  const fields='id,discord_user_id,full_name,reviewed_at,created_at'+(table==='police_applications'?',character_info:answers->>character_info':'');
  const response=await fetch(root+'/rest/v1/'+table+'?select='+fields+'&status=eq.accepted&order=reviewed_at.desc.nullslast,id.asc&limit=500&offset='+offset,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Accepted list query failed');
  const batch=await response.json();if(!Array.isArray(batch))throw Error('Invalid accepted list');
  rows.push(...batch);if(batch.length<500)break;
 }
 return rows;
}

export function acceptedCards(rows:any[],groupIndex:number){
 const group=groups[groupIndex],seen=new Set<string>(),entries:string[]=[];
 for(const row of rows){
  const id=String(row.discord_user_id||'');if(!/^\d{17,20}$/.test(id)||seen.has(id))continue;seen.add(id);
  const name=parseApplicationIdentity(row.full_name,{character_info:row.character_info}).name||'Nombre IC no indicado';
  entries.push('👤 **'+safeName(name)+'**\nDiscord: <@'+id+'>');
 }
 const pages:string[]=[];let current='';
 for(const entry of entries){if(current.length+entry.length+2>3400){pages.push(current);current='';}current+=(current?'\n\n':'')+entry;}
 if(current||!pages.length)pages.push(current||'Todavía no hay solicitudes aceptadas.');
 return pages.map((page,index)=>({embeds:[{
  title:group.title,color:group.color,description:'**'+group.intro+'**\n\n'+page,
  fields:[{name:'Siguiente paso',value:group.next},{name:'Total de aceptados',value:String(seen.size)}],
  footer:{text:'PRIME POLICE · '+group.kind+' · Página '+(index+1)+' de '+pages.length},
 }],allowed_mentions:{parse:[]}}));
}

async function publish(){
 const channel=await discordRequest('/channels/'+CHANNEL);
 if(channel.guild_id!==GUILD||![0,5].includes(channel.type))throw Error('Accepted list channel is not a text channel in PRIME POLICE');
 // Read complete existing history so retries edit the bot's own cards instead of duplicating them.
 const existing=new Map<string,any>();let before='';
 for(let page=0;;page++){
  if(page>=100)throw Error('Accepted list history needs manual review');
  const messages=await discordRequest('/channels/'+CHANNEL+'/messages?limit=100'+(before?'&before='+before:''));
  if(!Array.isArray(messages))throw Error('Could not inspect accepted list messages');
  for(const message of messages){
   if(message.author?.id!==BOT)continue;
   const match=String(message.embeds?.[0]?.footer?.text||'').match(/^PRIME POLICE · (Reclutamiento|Traslados) · Página (\d+) de \d+$/);
   if(match&&!existing.has(match[1]+':'+match[2]))existing.set(match[1]+':'+match[2],message);
  }
  if(messages.length<100)break;before=messages[messages.length-1].id;
 }
 const totals:any={};const messageIds:string[]=[];
 for(let index=0;index<groups.length;index++){
  const group=groups[index],cards=acceptedCards(await records(group.table),index);
  for(let page=0;page<cards.length;page++){
   const old=existing.get(group.kind+':'+(page+1));
   const payload:any=cards[page];
   const nonce='accepted-'+index+'-'+page;
   const message=await discordRequest('/channels/'+CHANNEL+'/messages'+(old?'/'+old.id:''),{method:old?'PATCH':'POST',body:JSON.stringify(old?payload:{...payload,nonce,enforce_nonce:true})});
   messageIds.push(message.id);
  }
  // Keep older surplus pages accurate without deleting unrelated channel history.
  for(const [key,old] of existing)if(key.startsWith(group.kind+':')&&Number(key.split(':')[1])>cards.length){
   await discordRequest('/channels/'+CHANNEL+'/messages/'+old.id,{method:'PATCH',body:JSON.stringify({embeds:[{title:group.title,description:'El listado actualizado está en las primeras '+cards.length+' tarjetas.',color:group.color,footer:old.embeds[0].footer}],allowed_mentions:{parse:[]}})});
  }
  totals[group.kind]=Number(cards[0].embeds[0].fields[1].value);
 }
 return {ok:true,channel_id:CHANNEL,totals,message_ids:messageIds};
}

export async function syncAcceptedPublicList(){
 for(let attempt=0;attempt<4;attempt++){
  const response=await withOperationLock('public-accepted-list',async()=>Response.json(await publish()));
  if(response.status===409&&attempt<3){await new Promise(resolve=>setTimeout(resolve,2000));continue;}
  if(!response.ok)throw Error('Accepted list sync did not finish: '+response.status);
  return await response.json();
 }
 throw Error('Accepted list sync unavailable');
}

export function scheduleAcceptedPublicList(){
 EdgeRuntime.waitUntil((async()=>{
  for(let attempt=0;attempt<3;attempt++){
   try{await syncAcceptedPublicList();return;}
   catch(error){if(attempt===2){console.error('Accepted public list pending:',String(error));return;}await new Promise(resolve=>setTimeout(resolve,2000));}
  }
 })());
}
