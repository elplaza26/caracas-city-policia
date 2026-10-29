type Context={db:(path:string,init?:RequestInit)=>Promise<any>,json:(v:unknown,status?:number)=>Response,notify:(id:string,payload:Record<string,unknown>)=>Promise<any>,audit:(title:string,color:number,fields:Array<{name:string,value:string}>)=>Promise<any>};
export async function manageAbsences(req:Request,action:string,actor:string,c:Context){
 if(action==='absence-summary'&&req.method==='GET')return c.json({ok:true,...await c.db('rpc/police_absence_summary',{method:'POST',body:'{}'})});
 if(action==='absence-roster'&&req.method==='GET'){
  const params=new URL(req.url).searchParams,offset=Number(params.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)return c.json({error:'Página inválida.'},400);
  return c.json({ok:true,...await c.db('rpc/police_absence_roster',{method:'POST',body:JSON.stringify({p_search:(params.get('search')||'').slice(0,100),p_offset:offset})})});
 }
 if(action==='absence-register'&&req.method==='POST'){
  let input:any;try{input=await req.json();}catch{return c.json({error:'Datos inválidos.'},400);}
  const user=String(input.discord_user_id||''),key=String(input.request_key||''),reason=String(input.reason||'').trim();
  const validDate=(s:any)=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&Number.isFinite(new Date(s+'T12:00:00Z').getTime())&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
  if(!/^\d{17,20}$/.test(user)||!key||key.length>100||!validDate(input.start_date)||!validDate(input.end_date)||input.end_date<input.start_date||reason.length<3||reason.length>4000)return c.json({error:'Selecciona un oficial y revisa las fechas y el motivo.'},400);
  const result=await c.db('rpc/register_police_absence',{method:'POST',body:JSON.stringify({p_user:user,p_request_key:key,p_start:input.start_date,p_end:input.end_date,p_reason:reason,p_actor:actor})});
  if(!result.ok)return c.json({error:result.error||'No se pudo registrar la ausencia.'},409);
  if(!result.existing)await c.audit('📋 Ausencia registrada desde la web',0xe7b45b,[{name:'Agente',value:user},{name:'Período',value:input.start_date+' → '+input.end_date},{name:'Registrada por',value:actor}]);
  return c.json({ok:true,message:'Ausencia registrada. La disponibilidad se actualiza según las fechas indicadas.'});
 }
 if(action!=='absence-review'||req.method!=='POST')return c.json({error:'Acción inválida.'},400);
 let input:any;try{input=await req.json();}catch{return c.json({error:'Solicitud inválida.'},400);}
 const id=String(input.id||''),decision=String(input.decision||''),reason=String(input.reason||'').trim().slice(0,500);
 if(!/^[a-f0-9-]{36}$/i.test(id)||decision!=='cancel')return c.json({error:'Decisión inválida.'},400);
 const rows=await c.db('police_absence_requests?select=*&id=eq.'+encodeURIComponent(id)+'&limit=1'),record=rows?.[0];
 if(!record)return c.json({error:'La solicitud ya no existe.'},404);
 if(input.expected_updated_at!==undefined&&String(input.expected_updated_at)!==String(record.updated_at))return c.json({error:'La ausencia cambió desde que la abriste. Actualiza la lista.'},409);
 if((decision==='cancel'?!['pending','approved'].includes(record.status):record.status!=='pending'))return c.json({error:'Esta solicitud ya fue revisada. Actualiza la lista.'},409);
 const status='cancelled',now=new Date().toISOString();
 const changed=await c.db('police_absence_requests?id=eq.'+id+'&status=eq.'+record.status+'&updated_at=eq.'+encodeURIComponent(record.updated_at),{method:'PATCH',body:JSON.stringify({status,reviewed_by:actor,reviewed_at:now,updated_at:now,review_reason:reason||null})});
 if(!changed?.length)return c.json({error:'Otro gestor modificó la ausencia. Actualiza la lista.'},409);
 const label='cancelada';
 await c.audit('📋 Ausencia '+label,0xe7b45b,[{name:'Agente',value:record.full_name},{name:'Placa',value:record.plate||'—'},{name:'Período',value:record.start_date+' → '+record.end_date},{name:'Revisada por',value:actor},{name:'Observación',value:reason||'Sin observaciones'}]);
 let warning='';try{await c.notify(record.discord_user_id,{embeds:[{title:'📋 Solicitud de ausencia · '+label,description:'Tu ausencia del **'+record.start_date+'** al **'+record.end_date+'** fue **'+label+'**.'+(reason?'\n\nObservación: '+reason:''),color:0xe7b45b}],allowed_mentions:{parse:[]}});}catch{warning='La revisión se guardó, pero no se pudo enviar el aviso privado al agente.';}
 return c.json({ok:true,message:'Ausencia '+label+'. El estado de disponibilidad se actualiza según las fechas registradas.',warning:warning||undefined});
}
