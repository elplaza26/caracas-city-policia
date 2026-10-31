let admissionCandidate=null,admissionOperation='',admissionSaving=false,admissionSource='preselection';
function appendAdmissionAction(container,person,source='preselection'){
 if(person.personnel_registered===false&&!person.personnel_membership_unavailable){
  const button=document.createElement('button');button.type='button';button.className='btn primary';button.textContent='Ingresar a la base';button.addEventListener('click',()=>openPreselectionAdmission(person,source));container.append(button);
 }else{
  const label=document.createElement('span');label.className='muted';label.textContent=person.personnel_registered===true?'Ya registrado en Personal':'Actualiza para comprobar su registro en Personal';container.append(label);
 }
}
async function openPreselectionAdmission(person,source='preselection'){
 if(person.personnel_registered===true){showToast('Ya tiene una ficha. Revísala desde Personal.');return;}
 if(admissionSaving)return;admissionSource=source;admissionCandidate={...person};admissionOperation=crypto.randomUUID();$('preselectionAdmissionForm').reset();
 $('admissionDiscord').value=(person.discord_username||'Discord')+' · '+person.discord_user_id;$('admissionName').value=person.full_name||'';
 $('preselectionAdmissionFeedback').textContent='';suggestNextPlate($('admissionPlate'),admissionOperation);
 $('preselectionAdmissionPolicy').textContent=(canAuthorizePromotions?'El ingreso se aplicará al confirmar.':'UCOP puede preparar el ingreso; Directiva lo aprobará desde Pendientes.')+' Se asignarán Policía, la división y el rango elegidos, junto al apodo Nombre IC #placa.';
 $('savePreselectionAdmission').textContent=canAuthorizePromotions?'Ingresar a la base':'Enviar ingreso a Directiva';$('preselectionAdmissionDialog').showModal();
 const operation=admissionOperation,select=$('admissionRank');select.replaceChildren(new Option('Sin rango por ahora',''));select.disabled=true;
 try{const result=await request('rank-config',{method:'GET'});if(operation!==admissionOperation)return;(result.ranks||[]).forEach(rank=>select.add(new Option(rank.role_name,rank.role_id)));}
 catch(error){if(operation===admissionOperation)$('preselectionAdmissionFeedback').textContent='No se cargaron los rangos. Puedes reabrir el formulario para reintentar. '+error.message;}
 finally{if(operation===admissionOperation)select.disabled=false;}
}
function closePreselectionAdmission(){if(!admissionSaving){$('preselectionAdmissionDialog').close();$('admissionPlate').dataset.plateOperation='';admissionCandidate=null;}}
['closePreselectionAdmission','cancelPreselectionAdmission'].forEach(id=>$(id).addEventListener('click',closePreselectionAdmission));$('preselectionAdmissionDialog').addEventListener('cancel',event=>{if(admissionSaving)event.preventDefault();});
$('preselectionAdmissionForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!admissionCandidate||admissionSaving)return;
 const body={...(admissionSource==='transfer'?{transfer_id:admissionCandidate.id,expected_reviewed_at:admissionCandidate.reviewed_at||null}:{}),discord_user_id:admissionCandidate.discord_user_id,operation_id:admissionOperation,expected_updated_at:admissionCandidate.updated_at||null,full_name:$('admissionName').value.trim(),plate:$('admissionPlate').value.trim(),steam_username:$('admissionSteam').value.trim(),approved_by_name:$('admissionApprover').value.replace(/@/g,'').trim(),interview_confirmed:$('admissionInterviewConfirmed').checked,unit:$('admissionUnit').value,rank_role_id:$('admissionRank').value,auto_plate:$('admissionPlate').dataset.autoPlate==='true'};
 if($('admissionRank').disabled){$('preselectionAdmissionFeedback').textContent='Espera a que terminen de cargar los rangos.';return;}
 if(!body.full_name||!body.plate||!body.steam_username||!body.approved_by_name||!body.interview_confirmed){$('preselectionAdmissionFeedback').textContent='Completa los datos y confirma la entrevista IC.';return;}
 admissionSaving=true;$('savePreselectionAdmission').disabled=true;$('preselectionAdmissionFeedback').textContent='Procesando el ingreso…';
 try{const result=await request(admissionSource==='transfer'?'transfer-admit':'preselection-admit',{method:'POST',body});const message=[result.message,result.assigned_plate?'Placa '+result.assigned_plate+'.':'',result.warning].filter(Boolean).join(' ');$('preselectionAdmissionDialog').close();admissionCandidate=null;showToast(message);directoryExpires=0;await (admissionSource==='transfer'?loadTransfers():loadPreselections());}
 catch(error){$('preselectionAdmissionFeedback').textContent=error.message;}
 finally{admissionSaving=false;$('savePreselectionAdmission').disabled=false;}
});
window.addEventListener('panel-session-ended',()=>{admissionCandidate=null;});
