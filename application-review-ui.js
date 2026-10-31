function applicationReviewPanel(app){
 const box=document.createElement('details');box.className='detail';box.style.marginBottom='14px';
 const title=document.createElement('summary');title.textContent='Revisión interna · IA y coincidencias';title.style.cursor='pointer';
 const body=document.createElement('div');body.style.paddingTop='12px';box.append(title,body);let loaded=false,loading=false;
 const load=async()=>{if(loaded||loading)return;loading=true;body.textContent='Revisando respuestas…';try{
  const result=await request('application-review',{query:{id:app.id}});body.replaceChildren();
  const notice=document.createElement('p');notice.className='muted';notice.textContent=result.notice;body.append(notice);
  if(!result.flags.length){const empty=document.createElement('p');empty.textContent='Sin referencias explícitas ni coincidencias detectadas. Esto no acredita autoría humana.';body.append(empty);}
  for(const flag of result.flags){const row=document.createElement('div');row.className='detail';row.style.marginBottom='8px';const strong=document.createElement('strong');strong.textContent=flag.question+' · '+flag.title;const text=document.createElement('p');text.className='muted';text.textContent=flag.detail;row.append(strong,text);body.append(row);}
  const sample=document.createElement('small');sample.className='muted';sample.textContent='Comparación con '+result.compared+' solicitudes recientes (máximo 200). Solo visible para gestores autorizados.';body.append(sample);loaded=true;
 }catch(error){body.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Reintentar revisión';retry.onclick=load;body.append(retry);}finally{loading=false;}};
 box.addEventListener('toggle',()=>{if(box.open)load();});return box;
}
