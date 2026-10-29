let selectedAbsenceAgent=null,absenceMode='roster',absenceRosterOffset=0,absenceRegisterKey='',absenceRegisterSaving=false;
let absenceOffset=0,absenceSequence=0,absenceTimer,absenceCache=null;
const absenceLabels={pending:'Pendiente',approved:'Registrada',rejected:'Rechazada',cancelled:'Cancelada'};
const absenceDateText=date=>new Date(date+'T12:00:00').toLocaleDateString('es-ES');
async function loadAbsenceSummary(force=false){
 const session=token;if(!force&&absenceCache?.token===session&&absenceCache.expires>Date.now())return absenceCache.value;
 const value=await request('absence-summary',{method:'GET'});if(token===session)absenceCache={token:session,value,expires:Date.now()+15000};return value;
}
function absencePhase(item,today){return item.status!=='approved'?absenceLabels[item.status]:item.start_date>today?'Programada':item.end_date<today?'Finalizada':'Ausencia vigente';}
function renderAbsenceSummary(summary){$('absenceSummary').innerHTML=[['Personal con ficha activa',summary.active_personnel],['Disponible · sin ausencia',summary.available],['En ausencia',summary.absent],['Ausencias programadas',summary.scheduled]].map(([label,total])=>'<div class="stat"><span>'+safeText(label)+'</span><strong>'+Number(total||0)+'</strong></div>').join('');}
async function loadAbsences(){
 const sequence=++absenceSequence,session=token;const list=$('absenceList');list.setAttribute('aria-busy','true');$('absenceFeedback').textContent='Cargando ausencias…';
 try{
  const [summary,result]=await Promise.all([loadAbsenceSummary(true),request('records',{method:'GET',query:{kind:'absences',...(selectedAbsenceAgent?{discord_user_id:selectedAbsenceAgent.discord_user_id}:{}),status:$('absenceFilter').value,search:$('absenceSearch').value,offset:absenceOffset,limit:25}})]);
  if(sequence!==absenceSequence||token!==session)return;
  renderAbsenceSummary(summary);list.replaceChildren();$('absenceFeedback').textContent='Actualizado · '+result.total+' solicitudes en este filtro.';
  if(!result.records.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='No hay solicitudes que coincidan con este filtro.';list.append(empty);}
  for(const item of result.records){
   const card=document.createElement('article');card.className='candidate';const head=document.createElement('div');head.className='candidate-head';const title=document.createElement('h3');title.textContent=item.full_name+' · Placa '+(item.plate||'—');const badge=document.createElement('span');badge.className='badge '+(item.status==='pending'?'pending':item.status==='approved'?'accepted':'rejected');badge.textContent=absencePhase(item,summary.today);head.append(title,badge);
   const details=document.createElement('div');details.className='details';details.append(detail('Primer día',absenceDateText(item.start_date)),detail('Último día · incluido',absenceDateText(item.end_date)),detail('Motivo privado',item.reason),detail('Solicitada',niceDate(item.created_at)),detail('Observación de administración',item.review_reason||'—'));
   const actions=document.createElement('div');actions.className='candidate-actions';
   const choices=item.status==='pending'?[['cancel','Cancelar ausencia','reject']]:item.status==='approved'&&item.end_date>=summary.today?[['cancel','Cancelar ausencia','reject']]:[];
   for(const [decision,label,cls]of choices){const button=document.createElement('button');button.type='button';button.className='btn '+cls;button.textContent=label;button.addEventListener('click',async()=>{
    const reason=prompt('Motivo de la cancelación (opcional):','');if(reason===null)return;
    if(!confirm(label+' · '+item.full_name+' · '+absenceDateText(item.start_date)+' → '+absenceDateText(item.end_date)+'?'))return;
    actions.querySelectorAll('button').forEach(b=>{b.disabled=true;});
    try{const response=await request('absence-review',{method:'POST',body:{id:item.id,decision,reason,expected_updated_at:item.updated_at}});const message=[response.message,response.warning].filter(Boolean).join(' ');showToast(message);absenceCache=null;await loadAbsences();$('absenceFeedback').textContent=message;}
    catch(error){$('absenceFeedback').textContent=error.message;actions.querySelectorAll('button').forEach(b=>{b.disabled=false;});}
   });actions.append(button);}
   card.append(head,details,actions);list.append(card);
  }
  const pager=$('absencePager');pager.replaceChildren();const label=document.createElement('span');label.className='muted';label.textContent='Página '+(Math.floor(absenceOffset/25)+1)+' · '+result.total+' solicitudes';pager.append(label);
  for(const [text,offset,disabled]of [['Anterior',Math.max(0,absenceOffset-25),absenceOffset===0],['Siguiente',result.next_offset,result.next_offset===null]]){const button=document.createElement('button');button.className='btn';button.type='button';button.textContent=text;button.disabled=disabled;button.addEventListener('click',()=>{absenceOffset=offset;loadAbsences();});pager.append(button);}
 }catch(error){if(sequence===absenceSequence)$('absenceFeedback').textContent=error.message;}
 finally{if(sequence===absenceSequence)list.removeAttribute('aria-busy');}
}
document.querySelectorAll('.workspace-tab').forEach(button=>button.addEventListener('click',()=>{$('absencesView').classList.toggle('hidden',button.dataset.view!=='absences');if(button.dataset.view==='absences')loadAbsences();}));
$('refreshAbsences').addEventListener('click',()=>loadAbsences());$('absenceFilter').addEventListener('change',()=>{absenceOffset=0;loadAbsences();});$('absenceSearch').addEventListener('input',()=>{clearTimeout(absenceTimer);absenceSequence++;absenceTimer=setTimeout(()=>{absenceOffset=0;loadAbsences();},350);});
const renderPersonnelBeforeAbsences=renderPersonnel;
renderPersonnel=()=>{renderPersonnelBeforeAbsences();if(!token)return;loadAbsenceSummary().then(summary=>{
 if(!token)return;const current=new Map((summary.current||[]).map(item=>[item.discord_user_id,item]));
 $('personnelRows').querySelectorAll('tr[data-person-id]').forEach(row=>{const person=(rosterPage||personnel).find(p=>p.discord_user_id===row.dataset.personId);if(person?.status!=='active')return;const chip=row.children[6]?.querySelector('.personnel-status');if(!chip)return;const absence=current.get(person.discord_user_id);chip.textContent=absence?'Ausencia':'Disponible';chip.title=absence?'Ausencia registrada hasta '+absenceDateText(absence.end_date):'Ficha activa, sin ausencia vigente';chip.classList.toggle('on-absence',!!absence);});
 }).catch(()=>{});};
const loadShiftsBeforeAbsences=loadShifts;
loadShifts=async()=>{let summary;try{summary=await loadAbsenceSummary(true);}catch{}await loadShiftsBeforeAbsences();if(summary){const current=new Map((summary.current||[]).map(item=>[item.discord_user_id,item]));dutyPeople=dutyPeople.map(p=>({...p,on_absence:current.has(p.discord_user_id),absence_until:current.get(p.discord_user_id)?.end_date}));if(shiftTab==='activity')renderShifts();}else $('shiftNotice').textContent+=' No se pudo comprobar la disponibilidad por ausencias; revisa antes de tomar medidas.';};
const loadDashboardBeforeAbsences=loadDashboard;
loadDashboard=async()=>{const session=token;await loadDashboardBeforeAbsences();try{const summary=await loadAbsenceSummary();if(session!==token)return;const panel=document.createElement('section');panel.className='panel';const title=document.createElement('h3');title.textContent='Disponibilidad del personal';const info=document.createElement('p');info.textContent=summary.available+' disponibles · '+summary.absent+' con ausencia registrada · '+summary.scheduled+' ausencias programadas';const button=document.createElement('button');button.className='btn';button.textContent='Ver ausencias';button.addEventListener('click',()=>document.querySelector('[data-view=absences]').click());panel.append(title,info,button);$('dashboardContent').prepend(panel);}catch{/* Preserve the rest of the dashboard on a temporary absence failure. */}};
window.addEventListener('panel-data-changed',()=>{absenceCache=null;});window.addEventListener('panel-session-ended',()=>{absenceCache=null;absenceSequence++;$('absenceList').replaceChildren();$('absenceSummary').replaceChildren();});
function showAbsenceMode(mode){absenceMode=mode;$('absenceRosterPanel').hidden=mode!=='roster';$('absenceRequestsPanel').hidden=mode!=='requests';document.querySelectorAll('[data-absence-view]').forEach(b=>b.classList.toggle('active',b.dataset.absenceView===mode));}
async function loadAbsenceRoster(){
 const session=token,result=await request('absence-roster',{method:'GET',query:{offset:absenceRosterOffset,search:$('absenceSearch').value}});if(session!==token)return;
 const rows=$('absenceRosterRows');rows.replaceChildren();
 for(const person of result.people){const row=document.createElement('tr');const status=person.status!=='active'?'Baja / inactivo':person.on_absence?'Ausencia':'Disponible';for(const value of [person.plate,person.full_name,person.rank_name||'Sin rango',status,String(person.absence_count)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}const cell=document.createElement('td'),button=document.createElement('button');button.className='btn';button.textContent='Ver historial';button.addEventListener('click',()=>{selectedAbsenceAgent=person;absenceOffset=0;$('absenceFilter').value='';$('absenceSelectedLabel').textContent='Historial · '+person.full_name+' · Placa '+person.plate;$('clearAbsenceAgent').hidden=false;showAbsenceMode('requests');loadAbsences();});cell.append(button);row.append(cell);rows.append(row);}
 if(!result.people.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=6;cell.textContent='No hay oficiales que coincidan con la búsqueda.';row.append(cell);rows.append(row);}
 const pager=$('absenceRosterPager');pager.replaceChildren();const total=document.createElement('span');total.className='muted';total.textContent=result.total+' oficiales · Página '+(Math.floor(absenceRosterOffset/25)+1);pager.append(total);
 for(const [label,offset,disabled]of [['Anterior',Math.max(0,absenceRosterOffset-25),absenceRosterOffset===0],['Siguiente',absenceRosterOffset+25,absenceRosterOffset+25>=result.total]]){const button=document.createElement('button');button.className='btn';button.textContent=label;button.disabled=disabled;button.addEventListener('click',()=>{absenceRosterOffset=offset;loadAbsenceRoster().catch(e=>{$('absenceFeedback').textContent=e.message;});});pager.append(button);}
}
const loadAbsencesBeforeRoster=loadAbsences;
loadAbsences=async()=>{await loadAbsencesBeforeRoster();try{await loadAbsenceRoster();}catch(error){$('absenceFeedback').textContent=error.message;}showAbsenceMode(absenceMode);};
document.querySelectorAll('[data-absence-view]').forEach(b=>b.addEventListener('click',()=>showAbsenceMode(b.dataset.absenceView)));
$('clearAbsenceAgent').addEventListener('click',()=>{selectedAbsenceAgent=null;absenceOffset=0;$('absenceSelectedLabel').textContent='Historial de ausencias';$('clearAbsenceAgent').hidden=true;loadAbsences();});
$('absenceSearch').addEventListener('input',()=>{absenceRosterOffset=0;});
async function openAbsenceRegister(){
 absenceRegisterKey=crypto.randomUUID();$('absenceRegisterForm').reset();$('absenceRegisterFeedback').textContent='Cargando oficiales…';$('absenceRegisterDialog').showModal();$('saveAbsenceRegister').disabled=true;
 try{await loadPersonnelDirectory();const options=$('absenceAgentList');options.replaceChildren();personnel.filter(p=>p.status==='active').forEach(p=>{const option=document.createElement('option');option.value=p.full_name+' · #'+p.plate;options.append(option);});$('absenceStart').value=(await loadAbsenceSummary()).today;$('absenceRegisterFeedback').textContent='';}
 catch(error){$('absenceRegisterFeedback').textContent=error.message;}finally{$('saveAbsenceRegister').disabled=false;}
}
function closeAbsenceRegister(){if(!absenceRegisterSaving)$('absenceRegisterDialog').close();}
$('registerAbsence').addEventListener('click',openAbsenceRegister);$('closeAbsenceRegister').addEventListener('click',closeAbsenceRegister);$('cancelAbsenceRegister').addEventListener('click',closeAbsenceRegister);$('absenceRegisterDialog').addEventListener('cancel',e=>{if(absenceRegisterSaving)e.preventDefault();});
$('absenceRegisterForm').addEventListener('submit',async event=>{
 event.preventDefault();if(absenceRegisterSaving)return;const matches=personnel.filter(p=>p.status==='active'&&p.full_name+' · #'+p.plate===$('absenceAgent').value);if(matches.length!==1){$('absenceRegisterFeedback').textContent='Selecciona un oficial de las opciones de placa y nombre.';return;}
 const body={discord_user_id:matches[0].discord_user_id,request_key:absenceRegisterKey,start_date:$('absenceStart').value,end_date:$('absenceEnd').value,reason:$('absenceReason').value.trim()};if(!body.start_date||!body.end_date||body.end_date<body.start_date||body.reason.length<3){$('absenceRegisterFeedback').textContent='Revisa las fechas y el motivo.';return;}
 absenceRegisterSaving=true;$('saveAbsenceRegister').disabled=true;$('absenceRegisterFeedback').textContent='Registrando…';
 try{const result=await request('absence-register',{method:'POST',body});$('absenceRegisterDialog').close();absenceCache=null;showToast(result.message);await loadAbsences();$('absenceFeedback').textContent=result.message;}
 catch(error){$('absenceRegisterFeedback').textContent=error.message;}finally{absenceRegisterSaving=false;$('saveAbsenceRegister').disabled=false;}
});
