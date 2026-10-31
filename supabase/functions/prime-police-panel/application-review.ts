const questions:Record<string,string>={motivation:'Motivación',detention_rights:'Responsabilidad y órdenes',scene_resolution:'Mala praxis',roleplay_response:'Situaciones policiales'};
const normalize=(value:unknown)=>String(value||'').normalize('NFKC').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function reviewApplicationAnswers(current:any,others:any[]){
 const flags:any[]=[];const entries=Object.entries(questions).map(([key,label])=>({key,label,text:String(current.answers?.[key]||'')}));
 for(const entry of entries){
  const match=entry.text.match(/como (?:un )?(?:modelo de lenguaje|inteligencia artificial|asistente de ia)|as an ai (?:language model|assistant)|(?:chatgpt|claude|gemini)\s*:\s*/i);
  if(match)flags.push({question:entry.label,title:'Referencia explícita a un asistente',detail:'Fragmento encontrado: «'+entry.text.slice(Math.max(0,(match.index||0)-20),(match.index||0)+140)+'». Puede ser una cita; compruébalo en entrevista.'});
  const normalized=normalize(entry.text);if(normalized.length<120)continue;
  if(entries.some(other=>other.key<entry.key&&normalize(other.text)===normalized))flags.push({question:entry.label,title:'Respuesta repetida entre apartados',detail:'El mismo texto aparece en otra pregunta de esta solicitud.'});
  const matches=others.filter(other=>String(other.discord_user_id)!==String(current.discord_user_id)&&Object.keys(questions).some(key=>normalize(other.answers?.[key])===normalized));
  if(matches.length)flags.push({question:entry.label,title:'Coincidencia exacta con otras solicitudes',detail:'Esta respuesta coincide con '+matches.length+' solicitud(es) de otras personas en la muestra consultada. Una coincidencia no demuestra uso de IA.'});
 }
 return {flags,compared:others.length,notice:'Revisión orientativa: no determina si un texto fue escrito por IA. No uses estas señales como único motivo de rechazo; confirma las respuestas en entrevista IC. No se envía ningún texto a servicios externos.'};
}
export async function applicationReview(req:Request,db:any,json:any){
 if(req.method!=='GET')return json({error:'Método no permitido.'},405);
 const id=new URL(req.url).searchParams.get('id')||'';if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Solicitud inválida.'},400);
 const found=await db('police_applications?select=id,discord_user_id,answers&id=eq.'+id+'&limit=1');if(!found?.length)return json({error:'No se encontró la postulación.'},404);
 const others=await db('police_applications?select=discord_user_id,answers&id=neq.'+id+'&order=created_at.desc&limit=200');
 const reviews=await db('police_application_reviews?select=id,verdict,note,reviewed_by_discord_id,reviewed_by_name,created_at&application_id=eq.'+id+'&order=created_at.desc,id.desc&limit=5');
 return json({ok:true,...reviewApplicationAnswers(found[0],others||[]),reviews:reviews||[]});
}
export async function saveApplicationReview(req:Request,db:any,json:any,actor:string,actorName:string){
 if(req.method!=='POST')return json({error:'Método no permitido.'},405);
 let body:any;try{body=await req.json();}catch{return json({error:'Solicitud inválida.'},400);}
 const id=String(body.id||''),reviewId=String(body.review_id||''),verdict=String(body.verdict||''),note=String(body.note||'').trim();
 if(!/^[a-f0-9-]{36}$/i.test(id)||!/^[a-f0-9-]{36}$/i.test(reviewId)||!['reviewed','suspected_ai','declared_ai'].includes(verdict)||note.length<3||note.length>2000)return json({error:'Selecciona una marca y añade una observación de entre 3 y 2000 caracteres.'},400);
 const matches=(row:any)=>row.application_id===id&&row.reviewed_by_discord_id===actor&&row.verdict===verdict&&row.note===note;
 const previous=await db('police_application_reviews?select=*&id=eq.'+reviewId+'&limit=1');
 if(previous?.length)return matches(previous[0])?json({ok:true,review:previous[0]}):json({error:'Esta referencia ya corresponde a otra constancia. Actualiza la ficha.'},409);
 const application=await db('police_applications?select=id&id=eq.'+id+'&limit=1');if(!application?.length)return json({error:'La postulación ya no existe.'},404);
 try{
  const rows=await db('police_application_reviews',{method:'POST',body:JSON.stringify({id:reviewId,application_id:id,verdict,note,reviewed_by_discord_id:actor,reviewed_by_name:actorName})});
  return json({ok:true,review:rows?.[0],message:'Constancia interna guardada. La decisión de la postulación sigue siendo manual.'});
 }catch(error){
  const rows=await db('police_application_reviews?select=*&id=eq.'+reviewId+'&limit=1');
  if(rows?.length&&matches(rows[0]))return json({ok:true,review:rows[0]});
  throw error;
 }
}
