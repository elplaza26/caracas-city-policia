type Context={db:(path:string,init?:RequestInit)=>Promise<any>,json:(value:unknown,status?:number)=>Response,actorName:string};
const profileUuid=(value:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export async function managePersonnelProfile(req:Request,action:string,actor:string,c:Context){
 const params=new URL(req.url).searchParams;
 if(action==='personnel-profile'&&req.method==='GET'){
  const target=params.get('discord_user_id')||'',noteOffset=Number(params.get('note_offset')||0),historyOffset=Number(params.get('history_offset')||0);
  if(!/^\d{17,20}$/.test(target)||![noteOffset,historyOffset].every(n=>Number.isSafeInteger(n)&&n>=0))return c.json({error:'Ficha o página inválida.'},400);
  const people=await c.db('police_personnel?select=*&discord_user_id=eq.'+target+'&limit=1');if(!people?.length)return c.json({error:'La ficha de personal ya no existe.'},404);
  const operations=[
   ['summary',()=>c.db('rpc/police_personnel_profile_summary',{method:'POST',body:JSON.stringify({p_user:target})})],
   ['notes',()=>c.db('police_personnel_notes?select=*&discord_user_id=eq.'+target+'&archived_at=is.null&order=created_at.desc,id.desc&limit=26&offset='+noteOffset)],
   ['history',()=>c.db('police_rank_history?select=*&discord_user_id=eq.'+target+'&order=created_at.desc,id.desc&limit=21&offset='+historyOffset)],
   ['absences',()=>c.db('police_absence_requests?select=id,start_date,end_date,status,reason&discord_user_id=eq.'+target+'&order=created_at.desc,id.desc&limit=5')],
   ['sanctions',()=>c.db('police_sanctions?select=id,action_type,level,reason,status,active,created_at,issuer_name&discord_user_id=eq.'+target+'&order=created_at.desc,id.desc&limit=10')],
  ] as const;
  const outcomes=await Promise.allSettled(operations.map(([,run])=>run())),result:any={ok:true,person:people[0],summary:null,notes:[],history:[],absences:[],sanctions:[],failed_sections:[],note_next_offset:null,history_next_offset:null};
  outcomes.forEach((outcome,index)=>{const key=operations[index][0];if(outcome.status==='fulfilled')result[key]=outcome.value;else result.failed_sections.push(key);});
  if(result.summary===null&&!result.failed_sections.includes('summary'))result.failed_sections.push('summary');
  if(result.notes.length>25)result.note_next_offset=noteOffset+25;result.notes=result.notes.slice(0,25);
  if(result.history.length>20)result.history_next_offset=historyOffset+20;result.history=result.history.slice(0,20);
  return c.json(result);
 }
 if(!['personnel-note-add','personnel-note-edit','personnel-note-archive'].includes(action)||req.method!=='POST')return c.json({error:'Acción inválida.'},400);
 let body:any;try{body=await req.json();}catch{return c.json({error:'Datos de observación inválidos.'},400);}
 const target=String(body.discord_user_id||''),note=String(body.note_id||''),operation=action.replace('personnel-note-',''),content=String(body.content||'').trim();
 if(!/^\d{17,20}$/.test(target)||!profileUuid(note)||(operation!=='archive'&&(!content||content.length>2000))||(operation!=='add'&&(!Number.isSafeInteger(body.expected_version)||body.expected_version<1)))return c.json({error:'Escribe una observación de 1 a 2000 caracteres y actualiza la ficha si cambió.'},400);
 let author=actor,authorName=c.actorName;
 if(body._approved_change_id){
  const id=String(body._approved_change_id);if(!profileUuid(id))return c.json({error:'Aprobación inválida.'},400);
  const rows=await c.db('police_change_requests?select=action,payload,status,reviewed_by,requested_by,requested_by_name&id=eq.'+id+'&limit=1'),proposal=rows?.[0],original=proposal?.payload;
  if(!proposal||proposal.status!=='processing'||proposal.reviewed_by!==actor||proposal.action!==action||original?.discord_user_id!==target||original?.note_id!==note||String(original?.content||'').trim()!==content||original?.expected_version!==body.expected_version)return c.json({error:'No se pudo verificar la aprobación de esta observación.'},409);
  author=proposal.requested_by;authorName=proposal.requested_by_name||proposal.requested_by;
 }
 const result=await c.db('rpc/mutate_police_personnel_note',{method:'POST',body:JSON.stringify({p_user:target,p_note:note,p_actor:author,p_actor_name:authorName,p_content:content,p_operation:operation,p_expected_version:body.expected_version??null})});
 if(!result?.ok)return c.json({error:result?.error||'No se pudo guardar la observación.'},409);
 return c.json({ok:true,note:result.note,message:operation==='add'?'Observación añadida.':operation==='edit'?'Observación actualizada.':'Observación archivada; se conserva su historial.'});
}
