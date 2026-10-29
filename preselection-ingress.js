let admissionCandidate=null,admissionOperation='',admissionSaving=false;
function openPreselectionAdmission(person){
 if(admissionSaving)return;admissionCandidate={...person};admissionOperation=crypto.randomUUID();$('preselectionAdmissionForm').reset();
 $('admissionDiscord').value=(person.discord_username||'Discord')+' · '+person.discord_user_id;$('admissionName').value=person.full_name||'';
 $('preselectionAdmissionFeedback').textContent='';
 $('preselectionAdmissionPolicy').textContent=(canAuthorizePromotions?'El ingreso se aplicará al confirmar.':'UCOP puede preparar el ingreso; Directiva lo aprobará desde Pendientes.')+' Se asignará Policía y el apodo Nombre IC #placa. La rama y el rango se configuran después en Personal.';
 $('savePreselectionAdmission').textContent=canAuthorizePromotions?'Ingresar a la base':'Enviar ingreso a Directiva';$('preselectionAdmissionDialog').showModal();
}
function closePreselectionAdmission(){if(!admissionSaving){$('preselectionAdmissionDialog').close();admissionCandidate=null;}}
['closePreselectionAdmission','cancelPreselectionAdmission'].forEach(id=>$(id).addEventListener('click',closePreselectionAdmission));$('preselectionAdmissionDialog').addEventListener('cancel',event=>{if(admissionSaving)event.preventDefault();});
$('preselectionAdmissionForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!admissionCandidate||admissionSaving)return;
 const body={discord_user_id:admissionCandidate.discord_user_id,operation_id:admissionOperation,expected_updated_at:admissionCandidate.updated_at||null,full_name:$('admissionName').value.trim(),plate:$('admissionPlate').value.trim(),steam_username:$('admissionSteam').value.trim(),approved_by_name:$('admissionApprover').value.replace(/@/g,'').trim(),interview_confirmed:$('admissionInterviewConfirmed').checked};
 if(!body.full_name||!body.plate||!body.steam_username||!body.approved_by_name||!body.interview_confirmed){$('preselectionAdmissionFeedback').textContent='Completa los datos y confirma la entrevista IC.';return;}
 admissionSaving=true;$('savePreselectionAdmission').disabled=true;$('preselectionAdmissionFeedback').textContent='Procesando el ingreso…';
 try{const result=await request('preselection-admit',{method:'POST',body});const message=[result.message,result.warning].filter(Boolean).join(' ');$('preselectionAdmissionDialog').close();admissionCandidate=null;showToast(message);directoryExpires=0;await loadPreselections();}
 catch(error){$('preselectionAdmissionFeedback').textContent=error.message;}
 finally{admissionSaving=false;$('savePreselectionAdmission').disabled=false;}
});
window.addEventListener('panel-session-ended',()=>{admissionCandidate=null;});
