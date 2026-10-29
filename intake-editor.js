let editingIntake=null,intakeEditSaving=false;
function openIntakeEditor(item){
 if(intakeEditSaving)return;
 editingIntake={id:item.id,updated_at:item.updated_at||null};
 $('intakeEditDiscord').value=(item.discord_username||'Usuario')+' · '+item.discord_user_id;
 $('intakeEditName').value=item.character_name||'';$('intakeEditPlate').value=item.plate||'';
 $('intakeEditSteam').value=item.steam_username||'';$('intakeEditApprover').value=item.approved_by_name||'';
 $('intakeEditFeedback').textContent='';$('intakeEditResult').classList.add('hidden');
 $('intakeEditNote').textContent=item.status==='accepted'?'Este ingreso ya está aprobado. Esta edición corrige la solicitud, sin modificar la ficha de Personal, el apodo ni los roles.':'Corrige los datos enviados. Si eres UCOP, la propuesta deberá aprobarla Directiva desde Pendientes antes de que se guarde.';
 $('intakeEditDialog').showModal();
}
function closeIntakeEditor(){if(!intakeEditSaving){$('intakeEditDialog').close();editingIntake=null;}}
$('closeIntakeEdit').addEventListener('click',closeIntakeEditor);$('cancelIntakeEdit').addEventListener('click',closeIntakeEditor);
$('intakeEditDialog').addEventListener('cancel',event=>{if(intakeEditSaving)event.preventDefault();});
$('intakeEditForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!editingIntake||intakeEditSaving)return;
 const payload={id:editingIntake.id,expected_updated_at:editingIntake.updated_at,character_name:$('intakeEditName').value.trim(),plate:$('intakeEditPlate').value.trim(),steam_username:$('intakeEditSteam').value.trim(),approved_by_name:$('intakeEditApprover').value.replace(/@/g,'').trim()};
 if(!payload.character_name||!payload.plate||!payload.approved_by_name){$('intakeEditFeedback').textContent='Completa nombre IC, placa y quién aprobó la entrevista.';return;}
 intakeEditSaving=true;$('saveIntakeEdit').disabled=true;$('saveIntakeEdit').textContent='Guardando…';$('intakeEditFeedback').textContent='Procesando la corrección…';
 try{
  const result=await request('rank-request-edit',{method:'POST',body:payload});
  const message=result.message||'Datos de la solicitud guardados.';const feedback=$('intakeEditResult');feedback.textContent=message;feedback.classList.remove('hidden');showToast(message);
  $('intakeEditDialog').close();editingIntake=null;await loadRankRequests();feedback.scrollIntoView({behavior:'smooth',block:'nearest'});
 }catch(error){$('intakeEditFeedback').textContent=error.message;}
 finally{intakeEditSaving=false;$('saveIntakeEdit').disabled=false;$('saveIntakeEdit').textContent='Guardar corrección';}
});
