let pendingChangeStatus='pending',pendingChangeOffset=0,pendingChangeSequence=0;
const changeLabels={'preselection-admit':'Ingresar preseleccionado a Personal','personnel-register':'Editar o registrar personal','personnel-delete':'Eliminar ficha de personal','rank-change':'Ascenso o descenso','rank-config-save':'Modificar escala de rangos','rank-config-import-all':'Sincronizar escala de rangos','decision':'Resolver postulación','transfer-decision':'Resolver traslado','rank-request-review':'Resolver nuevo ingreso','rank-request-edit':'Corregir datos de nuevo ingreso','sanction':'Aplicar sanción','sanction-delete':'Eliminar sanción','nickname-sync':'Sincronizar nombre y placa','shift-close':'Cerrar bitácora','shift-delete':'Eliminar bitácora','absence-review':'Revisar ausencia','absence-register':'Registrar ausencia'};
const changeFieldLabels={interview_confirmed:"Entrevista IC confirmada",start_date:"Primer día de ausencia",end_date:"Último día de ausencia",started_at:"Fecha y hora de entrada",ended_at:"Fecha y hora de salida",character_name:"Nombre IC",steam_username:"Usuario de Steam",approved_by_name:"Entrevista aprobada por",record_action:'Operación sobre la ficha',discord_user_id:'Usuario de Discord',full_name:'Nombre completo',name_ooc:'Nombre OOC',plate:'Placa',unit:'Rama',rank_role_id:'Rango',role_ids:'Escala de rangos',minimum_days_by_role:'Días mínimos por rango',action_type:'Tipo de movimiento',effective_date:'Fecha efectiva',reason:'Motivo',target_name:'Agente',evidence_url:'Evidencia',action:'Decisión',decision:'Decisión'};
const changeValueLabels={POLICIA:"Sin rama · Policía",create:'Registrar nuevo agente',approve:'Aprobar',cancel:'Cancelar',update:'Editar agente',accept:'Aceptar',reject:'Rechazar',promotion:'Ascenso',demotion:'Descenso',assignment:'Asignación inicial',warning:'Warning',strike:'Strike'};
function changeValue(value,item){
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value))return niceDate(value);
 const ranks=item.before_state?.ranks||item.before_state?.available_roles||[];
 const roleName=id=>ranks.find(r=>String(r.role_id||r.id)===String(id))?.role_name||ranks.find(r=>String(r.id)===String(id))?.name||String(id);
 if(Array.isArray(value))return value.map(roleName).join(' → ');
 if(value&&typeof value==='object')return Object.entries(value).map(([key,days])=>roleName(key)+': '+days+' días').join(' · ');
 if(typeof value==='boolean')return value?'Sí':'No';
 return changeValueLabels[value]||roleName(value??'—');
}
async function loadPendingChanges(){
 const sequence=++pendingChangeSequence,box=$('pendingChanges');box.textContent='Cargando pendientes…';
 document.querySelectorAll('[data-change-status]').forEach(b=>b.classList.toggle('active',b.dataset.changeStatus===pendingChangeStatus));
 try{
  const [result,legacyResult]=await Promise.all([request('change-requests',{method:'GET',query:{status:pendingChangeStatus,offset:pendingChangeOffset}}),pendingChangeOffset===0?request('rank-authorizations',{method:'GET'}).catch(()=>({authorizations:[]})):Promise.resolve({authorizations:[]})]);
  if(sequence!==pendingChangeSequence)return;box.replaceChildren();
  const legacy=(legacyResult.authorizations||[]).filter(r=>pendingChangeStatus==='pending'?['pending','processing'].includes(r.status):!['pending','processing'].includes(r.status)).map(r=>({...r,legacy:true,action:'rank-change',requested_by_name:r.requested_by,payload:{full_name:r.full_name,rank_role_id:r.new_rank_name},before_state:{}}));
  const rows=[...(result.requests||[]),...legacy];
  if(!rows.length){const empty=document.createElement('div');empty.className='dashboard-inbox-empty';const icon=document.createElement('span');icon.className='dashboard-empty-check';icon.setAttribute('aria-hidden','true');icon.textContent=pendingChangeStatus==='pending'?'✓':'↗';const title=document.createElement('strong');title.textContent=pendingChangeStatus==='pending'?'Todo al día':'Sin decisiones registradas';const copy=document.createElement('p');copy.textContent=pendingChangeStatus==='pending'?'No hay propuestas pendientes de Directiva. Los nuevos cambios aparecerán aquí.':'Aquí podrás consultar las decisiones y el resultado de cada cambio.';empty.append(icon,title,copy);box.append(empty);}
  for(const item of rows){
   const card=document.createElement('article');card.className='candidate';
   const title=document.createElement('h3');title.textContent=changeLabels[item.action]||'Cambio administrativo';
   const state=item.before_state||{},record=state.profile||state.record||{},name=item.payload?.full_name||record.full_name||record.character_name||record.target_name||item.payload?.target_name;
   if(name)title.textContent+=' · '+name;
   const meta=document.createElement('p');meta.className='muted';meta.textContent='Propuesto por '+(item.requested_by_name||item.requested_by)+' · '+niceDate(item.requested_at);
   const status=document.createElement('p');status.setAttribute('role','status');status.textContent=({pending:'Pendiente de Directiva',processing:'Procesando; no repetir',approved:'Aprobado y aplicado',rejected:'Rechazado',failed:'No aplicado; revisar motivo'})[item.status]||item.status;
   card.append(title,meta,status);
   const fields=document.createElement('div');fields.className='details';
   if(item.action==='absence-review'){fields.append(detail('Placa',record.plate||'—'),detail('Ausencia desde',record.start_date),detail('Ausencia hasta',record.end_date),detail('Motivo de la solicitud',record.reason));}
   if(item.action==='shift-delete'){fields.append(detail('Placa',record.plate||'—'),detail('Entrada',niceDate(record.started_at)),detail('Salida',record.ended_at?niceDate(record.ended_at):'En servicio'));}
   for(const [key,value]of Object.entries(item.payload||{})){
    if(key==='operation_id'||key==='request_key'||key==='id'||key==='discord_user_id'||key==='expected_updated_at'||key==='expected_started_at'||key==='expected_ended_at')continue;
    const previous=record[key],oldValue=previous!==undefined&&JSON.stringify(previous)!==JSON.stringify(value)?changeValue(previous,item)+' → ':'';
    fields.append(detail(changeFieldLabels[key]||key,oldValue+changeValue(value,item)));
   }
   card.append(fields);
   if(item.reviewed_by){const review=document.createElement('p');review.className='muted';review.textContent='Revisado por '+(item.reviewed_by_name||item.reviewed_by)+' · '+niceDate(item.reviewed_at)+(item.review_reason?' · '+item.review_reason:'');card.append(review);}
   if(item.result_message){const outcome=document.createElement('p');outcome.textContent=item.result_message;card.append(outcome);}
   if(item.status==='pending'&&result.can_approve){
    const actions=document.createElement('div');actions.className='candidate-actions';
    for(const [decision,label,cls]of [['approve','Aprobar y aplicar','btn accept'],['reject','Rechazar','btn reject']]){
     const button=document.createElement('button');button.className=cls;button.type='button';button.textContent=label;
     button.addEventListener('click',async()=>{const reason=prompt(decision==='approve'?'Observación de Directiva (opcional)':'Motivo del rechazo');if(reason===null)return;if(!confirm(label+': '+title.textContent+'?'))return;actions.querySelectorAll('button').forEach(b=>b.disabled=true);try{const r=await request(item.legacy?'rank-authorization-review':'change-request-review',{method:'POST',body:{id:item.id,decision,reason}});showToast((r.message||'Solicitud revisada.')+(r.warning||''));await loadPendingChanges();if(typeof loadDashboard==='function')loadDashboard();}catch(e){status.textContent=e.message;actions.querySelectorAll('button').forEach(b=>b.disabled=false);}});
     actions.append(button);
    }card.append(actions);
   }box.append(card);
  }
  const pagination=document.createElement('div');pagination.className='toolbar';for(const [label,next,disabled]of [['Anterior',Math.max(0,pendingChangeOffset-25),pendingChangeOffset===0],['Siguiente',result.next_offset,result.next_offset==null]]){const b=document.createElement('button');b.className='btn';b.type='button';b.textContent=label;b.disabled=disabled;b.addEventListener('click',()=>{pendingChangeOffset=next;loadPendingChanges();});pagination.append(b);}if(pendingChangeOffset>0||result.next_offset!=null)box.append(pagination);
 }catch(e){if(sequence===pendingChangeSequence)box.textContent=e.message;}
}
$('refreshPendingChanges').addEventListener('click',loadPendingChanges);
document.querySelectorAll('[data-change-status]').forEach(b=>b.addEventListener('click',()=>{pendingChangeStatus=b.dataset.changeStatus;pendingChangeOffset=0;loadPendingChanges();}));
window.addEventListener('pending-change-created',()=>{pendingChangeStatus='pending';pendingChangeOffset=0;loadPendingChanges();});
if(token&&!$('appView').classList.contains('hidden'))loadPendingChanges();
