let shiftAdminItem=null,shiftAdminMode='close',shiftAdminSaving=false;
const shiftPad=n=>String(n).padStart(2,'0');
const shiftDateValue=d=>d.getFullYear()+'-'+shiftPad(d.getMonth()+1)+'-'+shiftPad(d.getDate());
const shiftClockValue=d=>[d.getHours(),d.getMinutes(),d.getSeconds()].map(shiftPad).join(':');
function shiftInputDate(dateId,timeId){
 const date=$(dateId).value,time=$(timeId).value;
 if(!date||!time)throw Error('Completa las fechas y horas de entrada y salida.');
 const result=new Date(date+'T'+time);
 if(!Number.isFinite(result.getTime())||shiftDateValue(result)!==date||shiftClockValue(result).slice(0,5)!==time.slice(0,5))throw Error('La hora indicada no es válida para esa fecha.');
 return result;
}
function shiftDayMode(){
 const start=new Date($('shiftEntryDate').value+'T12:00:00');start.setDate(start.getDate()+1);
 const value=$('shiftExitDate').value===$('shiftEntryDate').value?'same':$('shiftExitDate').value===shiftDateValue(start)?'next':'custom';
 document.querySelectorAll('[name="shiftExitDay"]').forEach(r=>{r.checked=r.value===value;});
}
function shiftUpdateDuration(){
 try{const start=shiftInputDate('shiftEntryDate','shiftEntryTime'),end=shiftInputDate('shiftExitDate','shiftExitTime');$('shiftAdminDuration').textContent=end<start?'La salida debe ser posterior a la entrada.':'Duración que se registrará: '+duration(start,end)+' · Horario local';}
 catch(error){$('shiftAdminDuration').textContent=error.message;}
}
function shiftSetNow(){const now=new Date();$('shiftExitDate').value=shiftDateValue(now);$('shiftExitTime').value=shiftClockValue(now);shiftDayMode();shiftUpdateDuration();}
function openShiftAdmin(item,mode){
 if(shiftAdminSaving)return;shiftAdminItem={...item};shiftAdminMode=mode;
 const removing=mode==='delete',start=new Date(item.started_at),direct=canAuthorizePromotions||canManageShiftsDirect;
 $('shiftAdminTitle').textContent=removing?'Eliminar bitácora':'Forzar cierre de bitácora';
 $('shiftAdminAgent').textContent=item.full_name+' · Placa '+(item.plate||'—')+' · Entrada: '+shiftTime(item.started_at);
 $('shiftAdminPolicy').textContent=(direct?'Puedes aplicar este cambio directamente. Se registrará en la auditoría.':'Se creará una petición para Directiva. El registro solo cambiará cuando la apruebe.')+(removing?' Al eliminarla, sus horas dejarán de contar. Se conservará una copia en la auditoría.':'');
 $('shiftAdminTimes').hidden=removing;
 ['shiftEntryDate','shiftEntryTime','shiftExitDate','shiftExitTime'].forEach(id=>{$(id).disabled=removing;});
 $('shiftEntryDate').value=shiftDateValue(start);$('shiftEntryTime').value=shiftClockValue(start);shiftSetNow();
 $('shiftAdminReason').value='';$('shiftAdminFeedback').textContent='';
 $('shiftAdminSave').textContent=direct?(removing?'Eliminar bitácora':'Guardar cierre'):'Enviar petición';
 $('shiftAdminSave').className='btn '+(removing?'reject':'primary');
 $('shiftAdminDialog').showModal();
}
function closeShiftAdmin(){if(!shiftAdminSaving){$('shiftAdminDialog').close();shiftAdminItem=null;}}
['shiftAdminX','shiftAdminCancel'].forEach(id=>$(id).addEventListener('click',closeShiftAdmin));
$('shiftAdminDialog').addEventListener('cancel',event=>{if(shiftAdminSaving)event.preventDefault();});
$('shiftCloseNow').addEventListener('click',shiftSetNow);
document.querySelectorAll('[name="shiftExitDay"]').forEach(r=>r.addEventListener('change',()=>{
 if(r.value!=='custom'){const day=new Date($('shiftEntryDate').value+'T12:00:00');if(r.value==='next')day.setDate(day.getDate()+1);$('shiftExitDate').value=shiftDateValue(day);}
 shiftUpdateDuration();
}));
['shiftEntryDate','shiftEntryTime','shiftExitDate','shiftExitTime'].forEach(id=>$(id).addEventListener('change',()=>{shiftDayMode();shiftUpdateDuration();}));
$('shiftAdminForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!shiftAdminItem||shiftAdminSaving)return;
 const payload={id:shiftAdminItem.id,reason:$('shiftAdminReason').value.trim(),expected_started_at:shiftAdminItem.started_at,expected_ended_at:shiftAdminItem.ended_at||null};
 try{
  if(payload.reason.length<3)throw Error('Indica un motivo de al menos 3 caracteres.');
  if(shiftAdminMode==='close'){
   const start=shiftInputDate('shiftEntryDate','shiftEntryTime'),end=shiftInputDate('shiftExitDate','shiftExitTime');
   if(end<start||end.getTime()>Date.now()+60000)throw Error('La salida debe ser posterior a la entrada y no puede estar en el futuro.');
   payload.started_at=start.toISOString();payload.ended_at=end.toISOString();
  }
 }catch(error){$('shiftAdminFeedback').textContent=error.message;return;}
 shiftAdminSaving=true;$('shiftAdminSave').disabled=true;$('shiftAdminFeedback').textContent='Procesando…';
 try{
  const result=await request(shiftAdminMode==='delete'?'shift-delete':'shift-close',{method:'POST',body:payload});
  $('shiftAdminDialog').close();shiftAdminItem=null;showToast(result.message);await loadShifts();
  $('shiftNotice').textContent=result.message;
 }catch(error){$('shiftAdminFeedback').textContent=error.message;}
 finally{shiftAdminSaving=false;$('shiftAdminSave').disabled=false;}
});
