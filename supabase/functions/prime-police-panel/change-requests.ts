import { discordFailure } from "./discord-client.ts";
import { accessMember } from './access-member.ts';
import { withOperationLock } from './operation-lock.ts';
import { writeAudit } from './audit-events.ts';
export const CHANGE_ACTIONS:Record<string,string>={
 'personnel-register':'Editar o registrar personal','personnel-delete':'Eliminar ficha de personal',
 'rank-change':'Ascenso o descenso','rank-config-save':'Modificar escala de rangos','rank-config-import-all':'Sincronizar escala con Discord',
 'decision':'Resolver postulación','transfer-decision':'Resolver traslado','rank-request-review':'Resolver nuevo ingreso','rank-request-edit':'Corregir datos de nuevo ingreso',
 'sanction':'Aplicar sanción','sanction-delete':'Eliminar sanción','nickname-sync':'Sincronizar nombre y placa','shift-close':'Cerrar bitácora','shift-delete':'Eliminar bitácora'
};
const directors=new Set(['1539970134565982313','1539970134544748562','1539970134519578774']);
const uuid=(s:string)=>/^[0-9a-f-]{36}$/i.test(s);
const id=(s:string)=>/^\d{17,20}$/.test(s);
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
async function fingerprint(v:any){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(v)))))).map(n=>n.toString(16).padStart(2,'0')).join('');}
type Context={db:(path:string,init?:RequestInit)=>Promise<any>,authorizedUser:(req:Request)=>Promise<string|null>,discord:(path:string)=>Promise<any>,dispatch:(req:Request)=>Promise<Response>,json:(body:any,status?:number)=>Response};
class ChangeInputError extends Error{}
async function snapshot(action:string,payload:any,c:Context){
 if(action.startsWith('rank-config-'))return{resource:'rank-scale',state:{ranks:await c.db('police_rank_roles?select=*&order=rank_order.asc')}};
 const lookups:Record<string,[string,string]>={decision:['police_applications','discord_user_id'],'transfer-decision':['police_transfer_applications','discord_user_id'],'rank-request-review':['police_rank_requests','discord_user_id'],'rank-request-edit':['police_rank_requests','discord_user_id'],'sanction-delete':['police_sanctions','discord_user_id'],'shift-close':['police_duty_shifts','discord_user_id'],'shift-delete':['police_duty_shifts','discord_user_id']};
 if(lookups[action]){
  const recordId=String(payload.id||'');if(!uuid(recordId))throw Error('Identificador de registro inválido.');
  const [table,field]=lookups[action],rows=await c.db(table+'?select=*&id=eq.'+encodeURIComponent(recordId)+'&limit=1');if(!rows?.length)throw Error('El registro ya no existe.');
  if(action==='shift-close'||action==='shift-delete'){
   const record=rows[0];
   if((payload.expected_started_at!==undefined&&String(payload.expected_started_at)!==String(record.started_at))||(payload.expected_ended_at!==undefined&&String(payload.expected_ended_at??'')!==String(record.ended_at??'')))throw new ChangeInputError('La bitácora cambió desde que la abriste. Actualiza la lista.');
   if(String(payload.reason||'').trim().length<3)throw new ChangeInputError('Indica un motivo de al menos 3 caracteres.');
   if(action==='shift-close'){
    if(record.ended_at)throw new ChangeInputError('La bitácora ya estaba cerrada. Actualiza la lista.');
    const start=new Date(payload.started_at??record.started_at),end=new Date(payload.ended_at??Date.now());
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start||end.getTime()>Date.now()+60000)throw new ChangeInputError('Revisa las fechas de entrada y salida.');
   }
  }
  if(action==='rank-request-edit'&&Object.prototype.hasOwnProperty.call(payload,'expected_updated_at')&&String(payload.expected_updated_at??'')!==String(rows[0].updated_at??''))throw new ChangeInputError('La solicitud cambió desde que la abriste. Actualiza Nuevos ingresos antes de corregirla.');
  return{resource:'personnel:'+String(rows[0][field]),state:{record:rows[0]}};
 }
 const target=String(payload.discord_user_id||'');if(!id(target))throw Error('ID de Discord inválido.');
 const profile=await c.db('police_personnel?select=*&discord_user_id=eq.'+encodeURIComponent(target)+'&limit=1');
 if(action==='personnel-register'&&payload.record_action==='create'&&profile?.length)throw new ChangeInputError('Este ID de Discord ya tiene una ficha. Busca al agente en Personal y pulsa Editar.');
 if(action==='personnel-register'&&payload.record_action==='update'&&!profile?.length)throw new ChangeInputError('La ficha ya no existe. Actualiza Personal antes de registrar al agente.');
 const state:any={profile:profile?.[0]||null};
 if(action!=='personnel-delete'){
  const member=await c.discord('/guilds/1539970134469378068/members/'+encodeURIComponent(target));state.roles=[...(member.roles||[])].sort();state.nickname=member.nick||null;
 }
 if(action==='sanction')state.sanctions=await c.db('police_sanctions?select=id,level,action_type,status,active&discord_user_id=eq.'+encodeURIComponent(target)+'&order=id.asc');
 if(action==='rank-change'||action==='personnel-register')state.ranks=await c.db('police_rank_roles?select=role_id,rank_order,role_name&order=rank_order.asc');
 return{resource:'personnel:'+target,state};
}
async function readBody(req:Request){const text=await req.clone().text();if(text.length>48000)throw Error('La solicitud es demasiado larga.');const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Solicitud inválida.');return body;}
export async function interceptChanges(req:Request,action:string,c:Context):Promise<Response|null>{
 if(!CHANGE_ACTIONS[action]&&!['change-requests','change-request-review'].includes(action))return null;
 if(req.method!=='POST'&&!(action==='change-requests'&&req.method==='GET'))return null;
 const actor=await c.authorizedUser(req);if(!actor)return c.json({error:'Sesión caducada o sin permisos de gestión.'},403);
 const member=await accessMember(actor),isDirector=(member.roles||[]).some((r:string)=>directors.has(r));
 const actorName=String(member.nick||member.user?.global_name||member.user?.username||actor);
 if(action==='change-requests'){
  const params=new URL(req.url).searchParams,offset=Number(params.get('offset')||0),status=params.get('status')||'pending';
  if(!Number.isSafeInteger(offset)||offset<0||!['pending','history'].includes(status))return c.json({error:'Página inválida.'},400);
  const filter=status==='pending'?'in.(pending,processing)':'in.(approved,rejected,failed)';
  const rows=await c.db('police_change_requests?select=*&status='+filter+'&order=requested_at.desc,id.desc&limit=26&offset='+offset);
  return c.json({ok:true,can_approve:isDirector,requests:rows.slice(0,25),next_offset:rows.length>25?offset+25:null});
 }
 let payload:any;try{payload=await readBody(req);}catch{return c.json({error:'Revisa los datos del cambio.'},400);}
 if(action==='change-request-review'){
  if(!isDirector)return c.json({error:'Solo Directiva puede aprobar o rechazar cambios pendientes.'},403);
  const proposalId=String(payload.id||''),decision=String(payload.decision||''),reason=String(payload.reason||'').trim().slice(0,500);
  if(!uuid(proposalId)||!['approve','reject'].includes(decision))return c.json({error:'Decisión inválida.'},400);
  const found=await c.db('police_change_requests?select=*&id=eq.'+encodeURIComponent(proposalId)+'&limit=1');if(!found?.length)return c.json({error:'La solicitud no existe.'},404);
  const proposal=found[0];if(!CHANGE_ACTIONS[proposal.action])return c.json({error:'Tipo de cambio no permitido.'},400);
  return withOperationLock(proposal.resource_key,async()=>{
   let claimed=false,applied=false;
   try{
    const fresh=await accessMember(actor,true);if(!(fresh.roles||[]).some((r:string)=>directors.has(r)))return c.json({error:'Ya no tienes el rol de Directiva.'},403);
    const rows=await c.db('police_change_requests?id=eq.'+encodeURIComponent(proposalId)+'&status=eq.pending',{method:'PATCH',body:JSON.stringify({status:decision==='approve'?'processing':'rejected',reviewed_by:actor,reviewed_by_name:actorName,reviewed_at:new Date().toISOString(),review_reason:reason||null})});
    if(!rows?.length)return c.json({error:'Otro gestor ya revisó o está procesando esta solicitud.'},409);claimed=true;
    if(decision==='reject'){await writeAudit('❌ Cambio rechazado por Directiva',[{name:'Cambio',value:CHANGE_ACTIONS[proposal.action]},{name:'Gestor',value:actorName},{name:'Motivo',value:reason||'Sin observaciones'}]);return c.json({ok:true,message:'Cambio rechazado. No se aplicó la propuesta.'});}
    const current=await snapshot(proposal.action,proposal.payload,c);if(current.resource!==proposal.resource_key||await fingerprint(current.state)!==proposal.fingerprint)throw Error('El registro cambió desde que se envió esta propuesta. Solicita una nueva para evitar sobrescribir cambios recientes.');
    const url=new URL(req.url);url.search='';url.searchParams.set('panel',proposal.action);
    const result=await c.dispatch(new Request(url,{method:'POST',headers:{authorization:req.headers.get('authorization')||'','content-type':'application/json'},body:JSON.stringify(proposal.payload)}));
    const outcome=await result.json();if(!result.ok||outcome.pending_authorization||outcome.pending_approval)throw Error(outcome.error||'No se pudo aplicar el cambio.');
    applied=true;
    await c.db('police_change_requests?id=eq.'+encodeURIComponent(proposalId)+'&status=eq.processing',{method:'PATCH',body:JSON.stringify({status:'approved',result_message:[outcome.message||'Cambio aplicado',outcome.warning].filter(Boolean).join(' ').slice(0,1000)})});
    await writeAudit('✅ Cambio aprobado por Directiva',[{name:'Cambio',value:CHANGE_ACTIONS[proposal.action]},{name:'Propuesto por',value:proposal.requested_by_name},{name:'Autorizado por',value:actorName},{name:'Motivo',value:reason||'Autorizado'}]);
    return c.json({ok:true,message:outcome.message||'Cambio aprobado y aplicado.',warning:outcome.warning});
   }catch(error){console.error('Review pending change:',String(error));if(applied)return c.json({ok:true,message:'Cambio aplicado.',warning:'Falta cerrar el expediente. No repitas la aprobación.'});
    if(claimed)try{await c.db('police_change_requests?id=eq.'+encodeURIComponent(proposalId)+'&status=eq.processing',{method:'PATCH',body:JSON.stringify({status:'failed',review_reason:String(error).replace(/^Error: /,'').slice(0,500)})});}catch{/* never reopen a possibly executed operation */}
    const upstream=discordFailure(error);if(upstream)return c.json(upstream.body,upstream.status);return c.json({error:claimed?String(error).replace(/^Error: /,''):'No se pudo procesar la solicitud.'},409);
   }
  });
 }
 if(isDirector)return null;
 try{
  const before=await snapshot(action,payload,c);
  const rows=await c.db('police_change_requests',{method:'POST',body:JSON.stringify({action,resource_key:before.resource,requested_by:actor,requested_by_name:actorName,payload,before_state:before.state,fingerprint:await fingerprint(before.state)})});
  await writeAudit('⏳ Cambio pendiente de Directiva',[{name:'Cambio',value:CHANGE_ACTIONS[action]},{name:'Propuesto por',value:actorName},{name:'Referencia',value:before.resource}]);
  return c.json({ok:true,pending_approval:true,request_id:rows?.[0]?.id,message:'Propuesta enviada a Pendientes del panel principal. Directiva debe aprobarla antes de que se aplique.'});
 }catch(error){console.error('Queue pending change:',String(error));if(error instanceof ChangeInputError)return c.json({error:error.message},409);const upstream=discordFailure(error);if(upstream)return c.json(upstream.body,upstream.status);if(String(error).includes('409'))return c.json({error:'Ya hay una propuesta de este tipo pendiente para este registro.'},409);return c.json({error:'No se pudo preparar la propuesta. Revisa el registro y las migraciones.'},400);}
}
