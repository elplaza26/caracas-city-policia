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
 return json({ok:true,...reviewApplicationAnswers(found[0],others||[])});
}
