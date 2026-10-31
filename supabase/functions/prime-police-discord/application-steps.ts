const uuid=(v:string)=>/^[a-f0-9-]{36}$/i.test(v);
export function identityModal(input:any,response:any){return response(9,{custom_id:'prime_application_identity_submit',title:'Postulación · Datos personales',components:[
 {type:18,label:'Nombre IC · solo nombre y apellido',component:input('character_name','Ej. Pedro Martinez',true,1,100)},
 {type:18,label:'Edad IC · personaje',component:input('age_ic','Solo números, ej. 25',true,1,3)},
 {type:18,label:'Edad OOC · fuera del personaje',component:input('age_ooc','Solo números, ej. 18',true,1,3)}
]});}
export function questionsModal(id:string,input:any,response:any){return response(9,{custom_id:'prime_application_answers:'+id,title:'Postulación · Preguntas',components:[
 {type:18,label:'Motivación y mejora personal',description:'¿Por qué quieres entrar? ¿Cuáles son tus virtudes y qué mejorarías?',component:input('motivation','Escribe tu respuesta.')},
 {type:18,label:'Responsabilidad y órdenes',description:'¿Qué significa pertenecer a la Policía? ¿Qué harías ante una orden incorrecta?',component:input('detention_rights','Escribe tu respuesta.')},
 {type:18,label:'Mala praxis o corrupción',description:'Si un compañero comete una falta grave o acepta un soborno, ¿qué harías?',component:input('scene_resolution','Escribe tu respuesta.')},
 {type:18,label:'Situaciones policiales',description:'1) Varios vehículos sospechosos: ¿cómo pides apoyo? 2) Persona con bate agresiva: ¿cómo actúas?',component:input('roleplay_response','Escribe tu respuesta.')}
]});}
export async function handleApplicationSteps(i:any,userId:string,username:string,c:any):Promise<Response|null>{
 const id=String(i.data?.custom_id||'');
 if((id==='prime_application_identity_submit'||id.startsWith('prime_application_continue:')||id.startsWith('prime_application_answers:'))&&(i.guild_id!=='1539970134469378068'||!/^\d{17,20}$/.test(userId)))return c.ephemeral('Este formulario solo puede usarse dentro del servidor de PRIME POLICE.');
 const getDraft=async(draftId:string)=>{
  if(!uuid(draftId))return null;
  const rows=await c.db('police_application_drafts?select=*&id=eq.'+draftId+'&discord_user_id=eq.'+userId+'&consumed_at=is.null&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&limit=1',{signal:AbortSignal.timeout(1800)});
  return rows?.[0]||null;
 };
 const defer=(job:()=>Promise<void>)=>{EdgeRuntime.waitUntil(job().catch(async(error)=>{console.error('Application steps:',String(error));try{await c.edit(i,{content:'No se pudo confirmar este paso. Si ya enviaste las respuestas, consulta con UCOP si quedaron registradas antes de repetir el envío.',components:[]});}catch{/* preserve server error */}}));return c.response(5,{flags:64});};
 if(i.type===5&&id==='prime_application_identity_submit'){
  const a=c.values(i),name=String(a.character_name||'').trim();
  if(name.length<3||/\d|\r|\n|\|/.test(name))return c.ephemeral('Escribe solo el nombre y apellido IC. Pon las edades en sus campos separados.');
  if(![a.age_ic,a.age_ooc].every(v=>/^\d{1,3}$/.test(v)&&Number(v)>=1&&Number(v)<=120))return c.ephemeral('Las edades IC y OOC deben ser números entre 1 y 120.');
  return defer(async()=>{
   const draftId=crypto.randomUUID(),now=new Date();
   await c.db('police_application_drafts?on_conflict=discord_user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:draftId,discord_user_id:userId,payload:{character_name:name,age_ic:Number(a.age_ic),age_ooc:Number(a.age_ooc)},created_at:now.toISOString(),expires_at:new Date(now.getTime()+30*60*1000).toISOString(),consumed_at:null})});
   await c.edit(i,{content:'**Paso 1 de 2 completado.** Continúa para responder las preguntas. Tienes 30 minutos; todavía no has enviado una postulación.',components:[{type:1,components:[{type:2,style:1,label:'Continuar con las preguntas',custom_id:'prime_application_continue:'+draftId}]}]});
  });
 }
 if(i.type===3&&id.startsWith('prime_application_continue:')){
  try{const draft=await getDraft(id.split(':')[1]);return draft?questionsModal(draft.id,c.input,c.response):c.ephemeral('Este formulario caducó, ya se envió o no te pertenece. Abre una nueva postulación.');}
  catch{return c.ephemeral('La conexión tardó demasiado. Pulsa de nuevo Continuar para reintentarlo.');}
 }
 if(i.type===5&&id.startsWith('prime_application_answers:')){
  const a=c.values(i);if(!['motivation','detention_rights','scene_resolution','roleplay_response'].every(key=>a[key]))return c.ephemeral('Completa todas las preguntas.');
  return defer(async()=>{
   const draft=await getDraft(id.split(':')[1]);if(!draft){await c.edit(i,{content:'Este formulario caducó o ya se envió. Abre una nueva postulación.',components:[]});return;}
   const result=await c.process(i,userId,username,{...a,...draft.payload});
   if(result?.ok)await c.db('police_application_drafts?id=eq.'+draft.id+'&discord_user_id=eq.'+userId,{method:'PATCH',body:JSON.stringify({consumed_at:new Date().toISOString(),payload:{}})}).catch((error)=>console.error('Completed draft cleanup failed:',String(error)));
  });
 }
 return null;
}
