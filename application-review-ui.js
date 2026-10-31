function automaticReviewNotice(item){
 const review=item.automatic_review,box=document.createElement('div');
 if(!review)return box;
 box.className='detail';box.style.marginBottom='14px';box.setAttribute('role','status');
 if(review.unavailable){box.textContent='Análisis automático no disponible. Actualiza para reintentarlo; puedes revisar y decidir manualmente.';return box;}
 if(!review.flags?.length){box.textContent='Análisis automático: sin indicios de copia o referencias a IA. Esto no confirma autoría humana.';return box;}
 box.style.borderColor='#d5ad5a';
 const heading=document.createElement('strong');heading.textContent='⚠ Revisar respuestas · posibles indicios de copia o IA';box.append(heading);
 for(const flag of review.flags){const text=document.createElement('p');text.textContent=flag.question+' · '+flag.title+': '+flag.detail;box.append(text);}
 const note=document.createElement('small');note.textContent='Aviso orientativo, no un veredicto de IA. Comparación privada con hasta 200 solicitudes recientes. UCOP o Directiva deciden; no hay aceptación ni rechazo automático.';box.append(note);return box;
}
function applicationReviewPanel(app){
 const box=document.createElement('details');box.className='detail';box.style.marginBottom='14px';
 const title=document.createElement('summary');title.textContent='Revisión interna · IA y coincidencias';title.style.cursor='pointer';
 const body=document.createElement('div');body.style.paddingTop='12px';box.append(title,body);let loaded=false,loading=false;
 const load=async()=>{if(loaded||loading)return;loading=true;body.textContent='Revisando respuestas…';try{
  const result=await request('application-review',{method:'GET',query:{id:app.id}});body.replaceChildren();
  const notice=document.createElement('p');notice.className='muted';notice.textContent=result.notice;body.append(notice);
  if(!result.flags.length){const empty=document.createElement('p');empty.textContent='Sin referencias explícitas ni coincidencias detectadas. Esto no acredita autoría humana.';body.append(empty);}
  for(const flag of result.flags){const row=document.createElement('div');row.className='detail';row.style.marginBottom='8px';const strong=document.createElement('strong');strong.textContent=flag.question+' · '+flag.title;const text=document.createElement('p');text.className='muted';text.textContent=flag.detail;row.append(strong,text);body.append(row);}
  const sample=document.createElement('small');sample.className='muted';sample.textContent='Comparación con '+result.compared+' solicitudes recientes (máximo 200). Solo visible para gestores autorizados.';body.append(sample);
  const labels={reviewed:'Revisada · sin marca de IA',suspected_ai:'Posible uso de IA',declared_ai:'Uso de IA declarado por el postulante'};
  const heading=document.createElement('h4');heading.textContent='Constancia del revisor · últimas 5';body.append(heading);
  if(!(result.reviews||[]).length){const none=document.createElement('p');none.className='muted';none.textContent='Todavía no hay una marca manual guardada.';body.append(none);}
  for(const review of result.reviews||[]){const row=document.createElement('div');row.className='detail';row.style.marginBottom='8px';const label=document.createElement('strong');label.textContent=labels[review.verdict]||'Revisión interna';const note=document.createElement('p');note.textContent=review.note;const by=document.createElement('small');by.className='muted';by.textContent='Marcada por '+review.reviewed_by_name+' · Discord ID '+review.reviewed_by_discord_id+' · '+niceDate(review.created_at);row.append(label,note,by);body.append(row);}
  const form=document.createElement('form');form.className='personnel-fields';form.style.marginTop='14px';const selectField=document.createElement('div');selectField.className='field';const selectLabel=document.createElement('label');selectLabel.textContent='Marca manual de la revisión';const select=document.createElement('select');select.required=true;select.id='reviewVerdict-'+app.id;selectLabel.htmlFor=select.id;const empty=document.createElement('option');empty.value='';empty.textContent='Selecciona el resultado manual';select.append(empty);for(const [value,text] of Object.entries(labels)){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}selectField.append(selectLabel,select);
  const noteField=document.createElement('div');noteField.className='field';const noteLabel=document.createElement('label');noteLabel.textContent='Observación o evidencia';const note=document.createElement('textarea');note.id='reviewNote-'+app.id;noteLabel.htmlFor=note.id;note.rows=3;note.required=true;note.minLength=3;note.maxLength=2000;note.placeholder='Describe qué comprobaste o qué declaró la persona…';noteField.append(noteLabel,note);
  const controls=document.createElement('div');const save=document.createElement('button');save.type='submit';save.className='btn';save.textContent='Guardar constancia interna';const feedback=document.createElement('p');feedback.className='muted';feedback.setAttribute('role','status');feedback.textContent='Guardar una marca no acepta ni rechaza la solicitud. La decisión la toma UCOP o Directiva.';controls.append(save,feedback);form.append(selectField,noteField,controls);body.append(form);
  let operationId=crypto.randomUUID(),saving=false;const changed=()=>{if(!saving)operationId=crypto.randomUUID();};select.addEventListener('change',changed);note.addEventListener('input',changed);
  form.addEventListener('submit',async event=>{event.preventDefault();if(saving||!form.reportValidity())return;saving=true;save.disabled=select.disabled=note.disabled=true;feedback.textContent='Guardando constancia…';try{const saved=await request('application-review-save',{method:'POST',body:{id:app.id,review_id:operationId,verdict:select.value,note:note.value.trim()}});feedback.textContent=saved.message||'Constancia guardada.';loaded=false;loading=false;if(activeStatus==='rejected-ai'){showToast(saved.message||'Constancia guardada.');await activeRecordPage('applications');}else await load();}catch(error){feedback.textContent=error.message;}finally{saving=false;save.disabled=select.disabled=note.disabled=false;}});loaded=true;
 }catch(error){body.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Reintentar revisión';retry.onclick=load;body.append(retry);}finally{loading=false;}};
 box.addEventListener('toggle',()=>{if(box.open)load();});return box;
}
