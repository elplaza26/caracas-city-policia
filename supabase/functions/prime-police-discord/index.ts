const GUILD_ID = "1539970134469378068";
const PRESELECTION_ROLE_ID = "1564685481457877012";
const POLICE_ROLE_ID = "1539970134482092038";
const CIC_ROLE_ID = "1539970134519578772";
const EXPELLED_ROLE_ID = "1539970134482092034";
const APPLICATION_ANNOUNCEMENTS_CHANNEL_ID = "1539970135375478860";
const RANK_REQUEST_CHANNEL_ID = "1539970135375478859";
const TRANSFER_CHANNEL_ID = "1564900830077788190";
const POLICE_ONLY_RANK_LABEL = "Solo rol de Policía (sin rango configurado)";
function normalizeRankName(value: unknown) {
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
const APPLICATION_ID = "1540484542354428025";
const MANAGER_ROLE_IDS = new Set(["1539970134565982313", "1539970134544748562", "1539970134544748556", "1539970134544748557", "1539970134519578773", "1539970134519578774"]);
const canManage = (i:any) => (i.member?.roles || []).some((role:string) => MANAGER_ROLE_IDS.has(role));
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_PUBLIC_KEY = "00d2404753364bae3875ef0fb6f98707e642a08405a1fb3b97bcd391bd183d57";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS = {"Access-Control-Allow-Origin":"https://primepolicerp.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer"};
const json = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json",...CORS}});
const encoder = new TextEncoder();
const hexBytes=(hex:string)=>new Uint8Array((hex.match(/.{1,2}/g)||[]).map(x=>parseInt(x,16)));
async function verify(req:Request,body:ArrayBuffer){if(!DISCORD_PUBLIC_KEY)return false;const ts=req.headers.get("x-signature-timestamp")||"",sig=req.headers.get("x-signature-ed25519")||"";if(!ts||!sig||!/^\d+$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300)return false;try{const key=await crypto.subtle.importKey("raw",hexBytes(DISCORD_PUBLIC_KEY),{name:"Ed25519"},false,["verify"]);return await crypto.subtle.verify({name:"Ed25519"},key,hexBytes(sig),encoder.encode(ts).reduce((a,b)=>a, new Uint8Array()) /* replaced below */)}catch{return false}}
async function validSignature(req:Request,bodyText:string){if(!DISCORD_PUBLIC_KEY)return false;const ts=req.headers.get("x-signature-timestamp")||"",sig=req.headers.get("x-signature-ed25519")||"";if(!ts||!sig||!/^[0-9a-f]+$/i.test(sig)||!/^\d+$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300)return false;try{const key=await crypto.subtle.importKey("raw",hexBytes(DISCORD_PUBLIC_KEY),{name:"Ed25519"},false,["verify"]);const data=encoder.encode(ts+bodyText);return await crypto.subtle.verify({name:"Ed25519"},key,hexBytes(sig),data)}catch{return false}}
async function db(path:string,init:RequestInit={}){if(!SUPABASE_URL||!SERVICE_KEY)throw Error("Database credentials missing");const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})}});const text=await r.text();let body:any;try{body=JSON.parse(text)}catch{body=text}if(!r.ok)throw Error("DB "+r.status);return body}
async function discord(path:string,init:RequestInit={}){if(!BOT_TOKEN)throw Error("Discord bot token missing");const r=await fetch("https://discord.com/api/v10"+path,{...init,headers:{Authorization:"Bot "+BOT_TOKEN,"Content-Type":"application/json",...(init.headers||{})}});const text=await r.text();let body:any;try{body=text?JSON.parse(text):null}catch{body=text}if(!r.ok)throw Error("Discord "+r.status+" "+JSON.stringify(body));return body}
const response=(type:number,data:any)=>json({type,data});
const ephemeral=(content:string)=>response(4,{content,flags:64});
async function editInteractionResponse(interaction:any,payload:any){
 const token=String(interaction.token||"");
 if(!token)throw Error("Discord interaction token missing");
 const r=await fetch("https://discord.com/api/v10/webhooks/"+APPLICATION_ID+"/"+encodeURIComponent(token)+"/messages/@original",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 if(!r.ok)throw Error("Discord interaction reply "+r.status);
}
async function editInteractionReply(interaction:any,content:string){return editInteractionResponse(interaction,{content})}
async function publishOrUpdatePanel(channelId:string,customId:string,payload:any){
 const messages=await discord("/channels/"+channelId+"/messages?limit=100") as any[];
 const current=Array.isArray(messages)?messages.find((message:any)=>String(message.author?.id)===APPLICATION_ID&&(message.components||[]).some((row:any)=>(row.components||[]).some((component:any)=>component.custom_id===customId))):null;
 if(current?.id)return await discord("/channels/"+channelId+"/messages/"+current.id,{method:"PATCH",body:JSON.stringify(payload)});
 return await discord("/channels/"+channelId+"/messages",{method:"POST",body:JSON.stringify(payload)});
}
async function processApplicationSubmit(i:any,userId:string,username:string,a:any){
 const personal=a.character_info||"";const characterName=(personal.split(/\r?\n|\|/)[0].replace(/^Nombre IC:\s*/i,"").trim()||personal).slice(0,100);
 const ageIc=personal.match(/edad\s*IC\s*:\s*(\d{1,3})/i);const ageOoc=personal.match(/edad\s*OOC\s*:\s*(\d{1,3})/i);
 const answer={character_info:personal,age_ic:ageIc?Number(ageIc[1]):null,age_ooc:ageOoc?Number(ageOoc[1]):null,motivation:a.motivation,detention_rights:a.detention_rights,scene_resolution:a.scene_resolution,roleplay_response:a.roleplay_response};
 const submitted=await db("rpc/submit_police_application",{method:"POST",body:JSON.stringify({p_discord_user_id:userId,p_discord_username:username,p_full_name:characterName,p_previous_experience:a.motivation,p_motivation:a.motivation,p_answers:answer})});
 if(!submitted?.ok){await editInteractionReply(i,String(submitted?.message||"No se pudo aceptar la postulación."));return;}
 await editInteractionReply(i,"📋 **RRHH UCOP · Escrito recibido en privado**\nTu postulación quedó registrada de forma privada. Este es tu intento "+submitted.attempt_number+" de 3. UCOP revisará tus respuestas y te enviará el resultado por privado.");
}
async function processTransferSubmit(i:any,userId:string,username:string,a:any){
 const fullName=String(a.full_name||"").trim().slice(0,100);
 const ageIcText=String(a.age_ic||"").trim();
 const ageOocText=String(a.age_ooc||"").trim();
 if(!fullName){await editInteractionReply(i,"Escribe tu nombre IC. El formulario no se guardó.");return;}
 if(!/^\d{1,3}$/.test(ageIcText)||!/^\d{1,3}$/.test(ageOocText)){await editInteractionReply(i,"Las edades IC y OOC deben tener solo números, de 1 a 120. El formulario no se guardó.");return;}
 const ageIc=Number(ageIcText),ageOoc=Number(ageOocText);
 if(ageIc<1||ageIc>120||ageOoc<1||ageOoc>120){await editInteractionReply(i,"Las edades IC y OOC deben ser números entre 1 y 120. El formulario no se guardó.");return;}
 const sourceCurrent=String(a.source_current_data||"").trim().slice(0,4000);
 const sourceParts=sourceCurrent.split(/\s*(?:\||\r?\n|;|,)\s*/).map((part:string)=>part.trim()).filter(Boolean);
 const labeled=(pattern:RegExp)=>sourceCurrent.match(pattern)?.[1]?.trim()||"";
 const city=labeled(/ciudad\s*[:=\-]?\s*([^|\n;,]+)/i)||sourceParts[0]||"No especificada";
 const faction=labeled(/facc(?:i|í)on\s*[:=\-]?\s*([^|\n;,]+)/i)||sourceParts[1]||"No especificada";
 const rank=labeled(/rango(?:\s+actual)?\s*[:=\-]?\s*([^|\n;,]+)/i)||sourceParts[2]||"No especificado";
 const unit=labeled(/(?:unidad|divisi[oó]n)\s*[:=\-]?\s*([^|\n;,]+)/i)||sourceParts[3]||"";
 const requested=String(a.transfer_reason||"").trim().slice(0,4000);
 const desired=(requested.match(/rango\s*solicitado\s*[:=\-]?\s*([^|\n;,]+)/i)?.[1]||"").trim().slice(0,200);
 const explicitReason=requested.match(/motivo\s*[:=\-]?\s*([\s\S]+)/i)?.[1]||"";
 const reason=(explicitReason||requested.replace(/rango\s*solicitado\s*[:=\-]?\s*[^|\n;,]+\s*(?:\|\s*)?/i,"")).trim();
 if(!sourceCurrent||!reason){await editInteractionReply(i,"Completa procedencia/rango actual y el motivo. Puedes escribirlos libremente; el formulario no se guardó.");return;}
 const pending=await db("police_transfer_applications?select=id&discord_user_id=eq."+encodeURIComponent(userId)+"&status=eq.pending&limit=1");
 if(pending?.length){await editInteractionReply(i,"Ya tienes una solicitud de traslado pendiente de revisión por UCOP.");return;}
 const previous=await db("police_transfer_applications?select=attempt_number&discord_user_id=eq."+encodeURIComponent(userId)+"&order=created_at.asc");
 if(previous?.length>=3){await editInteractionReply(i,"Ya utilizaste tus 3 intentos para solicitar un traslado a PRIME POLICE.");return;}
 try {
  const rows=await db("police_transfer_applications",{method:"POST",body:JSON.stringify({discord_user_id:userId,discord_username:username,full_name:fullName,age_ic:ageIc,age_ooc:ageOoc,source_city:city,source_faction:faction,current_rank:rank,current_unit:unit,requested_rank:desired,reason,attempt_number:previous.length+1})});
  if(!rows?.[0]?.id)throw Error("Transfer request was not stored");
 } catch(error){
  if(String(error).includes("409")){await editInteractionReply(i,"Ya tienes una solicitud de traslado pendiente de revisión por UCOP.");return;}
  throw error;
 }
 await editInteractionReply(i,"📋 **RRHH UCOP · Escrito recibido en privado**\nTu solicitud quedó registrada en la web. Este es tu intento "+(previous.length+1)+" de 3. UCOP revisará tu información y te enviará el resultado de forma privada.");
}
async function processRankRequest(i:any,userId:string,username:string,a:any){
 const characterName=String(a.character_name||"").trim().slice(0,100);
 const plate=String(a.plate||"").trim().slice(0,30);
 const approvedBy=String(a.approved_by||"").replace(/@/g,"").trim().slice(0,100);
 if(!characterName||!plate||!approvedBy){await editInteractionReply(i,"Completa nombre IC, placa y nombre de quien aprobó la entrevista.");return;}
 const member=await discord("/guilds/"+GUILD_ID+"/members/"+encodeURIComponent(userId)) as any;
 const roles:string[]=member?.roles||[];
 if((!roles.includes(PRESELECTION_ROLE_ID)&&!roles.includes(POLICE_ROLE_ID))||roles.includes(CIC_ROLE_ID)||roles.includes(EXPELLED_ROLE_ID)){await editInteractionReply(i,"Solo las personas con rol Preselección o Policía pueden solicitar el ingreso tras su entrevista IC.");return;}
 const rankName=POLICE_ONLY_RANK_LABEL;
 const pending=await db("police_rank_requests?select=id&discord_user_id=eq."+encodeURIComponent(userId)+"&status=eq.pending&limit=1");
 if(pending?.length){await editInteractionReply(i,"Ya tienes una solicitud de ingreso pendiente de revisión por UCOP.");return;}
 const rows=await db("police_rank_requests",{method:"POST",body:JSON.stringify({discord_user_id:userId,discord_username:username,character_name:characterName,plate,requested_rank_name:rankName,approved_by_name:approvedBy})});
 const request=rows?.[0];
 if(!request?.id)throw Error("Rank request was not stored");
 await editInteractionReply(i,"Solicitud de ingreso enviada en privado a UCOP. Al aprobarla desde la web se asignará únicamente el rol Policía.");
}
const modalInput=(id:string,placeholder:string,required=true,style=2,maxLength=style===1?100:4000)=>({type:4,custom_id:id,style,...(placeholder?{placeholder}:{}),...(required?{min_length:1}:{}),max_length:maxLength,required});
function rankRequestModal(){return response(9,{custom_id:"prime_rank_request_submit",title:"Nuevo ingreso · UCOP",components:[
 {type:10,content:"⚠️ Este formulario se enviará a UCOP. No compartas contraseñas ni información confidencial. Tu usuario e ID de Discord se registran automáticamente."},
 {type:18,label:"Nombre IC",component:modalInput("character_name","Nombre de tu personaje.",true,1)},
 {type:18,label:"Número de placa",component:modalInput("plate","Número de placa policial.",true,1,30)},
 {type:18,label:"Aprobado por (sin @)",description:"Indica el nombre de quien aprobó tu entrevista IC.",component:modalInput("approved_by","Escribe el nombre, sin mencionar a nadie.",true,1)}
]})}
function modal(){return response(9,{custom_id:"prime_application_submit",title:"Postulación · PRIME POLICE",components:[
 {type:18,label:"Nombre IC, edad IC y edad OOC",description:"Nombre IC, edad IC y tu edad OOC. Formato: Nombre IC: ... | Edad IC: ... | Edad OOC: ...",component:modalInput("character_info","Nombre IC: ... | Edad IC: ... | Edad OOC: ...")},
 {type:18,label:"Motivación y mejora personal",description:"¿Por qué quieres formar parte de la Policía? ¿Cuáles son tus virtudes y qué aspectos mejorarías?",component:modalInput("motivation","Escribe tu respuesta.")},
 {type:18,label:"Responsabilidad y órdenes",description:"¿Qué significa pertenecer a la Policía? ¿Cómo actuarías ante una orden incorrecta de un superior?",component:modalInput("detention_rights","Escribe tu respuesta.")},
 {type:18,label:"Mala praxis o corrupción",description:"Si un compañero comete una falta grave o acepta un soborno, ¿qué harías y a quién informarías?",component:modalInput("scene_resolution","Escribe tu respuesta.")},
 {type:18,label:"Situaciones policiales",description:"1) Varios vehículos sospechosos: ¿cómo pides apoyo? 2) Persona con bate agresiva: ¿cómo actúas?",component:modalInput("roleplay_response","Escribe tu respuesta.")}
]})}
function transferModal(){return response(9,{custom_id:"prime_transfer_submit",title:"Traslado · PRIME POLICE",components:[
 {type:18,label:"Nombre IC",description:"Indica nombre y apellido de tu personaje.",component:modalInput("full_name","Nombre y apellido IC",true,1)},
 {type:18,label:"Edad IC · solo números",description:"Escribe únicamente números (1–120).",component:modalInput("age_ic","Ej. 25",true,1,3)},
 {type:18,label:"Edad OOC · solo números",description:"Escribe únicamente números (1–120).",component:modalInput("age_ooc","Ej. 18",true,1,3)},
 {type:18,label:"Procedencia y rango actual",description:"Escribe libremente. Si quieres, separa ciudad, facción, rango y unidad con |.",component:modalInput("source_current_data","Ciudad | Facción | Rango | Unidad",true)},
 {type:18,label:"Motivo del traslado",description:"Escribe libremente. El rango solicitado es opcional.",component:modalInput("transfer_reason","Motivo y, si quieres, rango solicitado",true)}
]})}
function values(interaction:any){const out:any={};const visit=(node:any)=>{if(!node||typeof node!=="object")return;if(typeof node.custom_id==="string"&&node.value!==undefined)out[node.custom_id]=String(node.value||"").trim();if(Array.isArray(node.components))for(const child of node.components)visit(child);if(node.component)visit(node.component)};for(const component of interaction.data?.components||[])visit(component);return out}
async function handle(i:any){
 if(i.type===1)return response(1,{});
 const user=i.member?.user||i.user;const userId=String(user?.id||"");const username=String(user?.global_name||user?.username||"Usuario Discord");
 if(i.type===2){
  const name=i.data?.name;
  if(name==="publicar_postulaciones"){
   if(!canManage(i))return ephemeral("No tienes permiso para publicar las postulaciones.");
   EdgeRuntime.waitUntil((async()=>{
    try{
     const applicationPanel={embeds:[{title:"📝 Preselección de ingreso · PRIME POLICE",description:"Completa la postulación para que **UCOP** revise tu solicitud. Cada persona dispone de un máximo de **3 intentos**.\n\nPulsa **Presentar postulación** para responder en privado. RRHH UCOP revisará tu escrito desde la web y te enviará el resultado por privado.\n\nSi te aprueban, recibirás el rol **Preselección** y UCOP coordinará contigo una **entrevista IC**. Después podrás solicitar el rol de Policía y tu rango desde <#"+RANK_REQUEST_CHANNEL_ID+">.",color:14264415,footer:{text:"PRIME POLICE · Preselección UCOP"}}],components:[{type:1,components:[{type:2,style:1,label:"Presentar postulación",custom_id:"prime_apply"}]}]};
     const rankPanel={embeds:[{title:"📝 Formulario de nuevo ingreso · UCOP",description:"Este formulario es para personas con rol **Preselección o Policía** que ya aprobaron su **entrevista IC**.\n\nCompleta el formulario. El acuse y las respuestas del formulario son privados: solo los verá quien lo envía. UCOP revisará la solicitud desde la web. Al aprobarla, recibirás únicamente el rol **Policía**. Los ascensos y descensos se gestionan después desde la web.",color:14264415,footer:{text:"PRIME POLICE · Solicitudes UCOP · Respuesta privada"}}],components:[{type:1,components:[{type:2,style:2,label:"Ingresar datos",custom_id:"prime_rank_request"}]}]};
     const transferPanel={embeds:[{title:"🏛️ UCOP · Solicitud de traslado",description:"¿Perteneces a la Policía de otra **facción o ciudad** y quieres incorporarte a PRIME POLICE?\n\nPulsa el botón para completar el formulario privado. Tus datos solo estarán disponibles para el personal autorizado de UCOP en el panel administrativo.\n\nSi aceptan la solicitud, recibirás el rol **Traslado** para coordinar una **entrevista IC** con UCOP. El rol no implica la incorporación automática como Policía.",color:14264415,footer:{text:"PRIME POLICE · RR. HH. · Solicitudes privadas"}}],components:[{type:1,components:[{type:2,style:1,label:"Solicitar traslado",custom_id:"prime_transfer"}]}]};
     await publishOrUpdatePanel(APPLICATION_ANNOUNCEMENTS_CHANNEL_ID,"prime_apply",applicationPanel);
     await publishOrUpdatePanel(RANK_REQUEST_CHANNEL_ID,"prime_rank_request",rankPanel);
     await publishOrUpdatePanel(TRANSFER_CHANNEL_ID,"prime_transfer",transferPanel);
     await editInteractionReply(i,"Paneles de postulación, solicitud de rango y traslado actualizados.");
    }catch(error){
     console.error("Could not publish application announcement:",String(error));
     try{await editInteractionReply(i,"No se pudo publicar el formulario. Comprueba los permisos del bot y vuelve a intentarlo.");}catch(replyError){console.error("Could not update deferred interaction:",String(replyError));}
    }
   })());
   return ephemeral("Actualizando los paneles de Discord… Solo tú puedes ver esta confirmación.");
  }
  if(name==="postulacion")return modal();
  if(name==="traslado")return transferModal();
  if(name==="panel_codigo")return ephemeral("El acceso por código se ha sustituido. Entra desde la web con tu cuenta de Discord y un rol autorizado.");
  return ephemeral("Comando no reconocido.");
 }
 if(i.type===3){
  if(i.data?.custom_id==="prime_apply")return modal();
  if(i.data?.custom_id==="prime_transfer")return transferModal();
  if(i.data?.custom_id==="prime_rank_request")return rankRequestModal();
  return ephemeral("Interacción no reconocida.");
 }
 if(i.type===5&&i.data?.custom_id==="prime_rank_request_submit"){
  const a=values(i);
  EdgeRuntime.waitUntil((async()=>{try{await processRankRequest(i,userId,username,a);}catch(error){console.error("Could not process rank request:",String(error));try{await editInteractionReply(i,"No se pudo completar la solicitud de rango. Contacta con UCOP antes de volver a enviarla.");}catch(replyError){console.error("Could not update rank request interaction:",String(replyError));}}})());
  return response(5,{flags:64});
 }
 if(i.type===5&&i.data?.custom_id==="prime_application_submit"){
  const a=values(i);const personal=a.character_info||"";
  if(!personal||!a.motivation||!a.detention_rights||!a.scene_resolution||!a.roleplay_response)return ephemeral("Completa todos los apartados antes de enviar.");
  EdgeRuntime.waitUntil((async()=>{try{await processApplicationSubmit(i,userId,username,a);}catch(error){console.error("Could not process application submit:",String(error));try{await editInteractionReply(i,"No se pudo completar el envío. Comprueba si quedó registrada en el panel y contacta con un administrador antes de volver a intentarlo.");}catch(replyError){console.error("Could not update application interaction:",String(replyError));}}})());
  return response(5,{flags:64});
 }
 if(i.type===5&&i.data?.custom_id==="prime_transfer_submit"){
  const a=values(i);
  EdgeRuntime.waitUntil((async()=>{try{await processTransferSubmit(i,userId,username,a);}catch(error){const detail=String(error);console.error("Could not process transfer submit:",detail);const message=detail.includes("DB 400")||detail.includes("DB 404")?"El formulario está completo, pero no se guardó porque la base de datos de traslados necesita actualizarse. Contacta con UCOP; no vuelvas a enviarlo todavía.":"No se pudo guardar la solicitud. Contacta con UCOP antes de volver a enviarla.";try{await editInteractionReply(i,message);}catch(replyError){console.error("Could not update transfer interaction:",String(replyError));}}})());
  return response(5,{flags:64});
 }
 return ephemeral("Interacción no compatible.");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method==="GET")return json({ok:true,service:"PRIME POLICE Discord applications",release:"private-modal-deferral-fix-2026-10-28f",configured:{discord:Boolean(BOT_TOKEN),database:Boolean(SUPABASE_URL&&SERVICE_KEY),public_key:Boolean(DISCORD_PUBLIC_KEY)},application_id:APPLICATION_ID,guild_id:GUILD_ID,commands:["publicar_postulaciones","postulacion","traslado"],message:DISCORD_PUBLIC_KEY?"Endpoint disponible.":"Falta configurar DISCORD_PUBLIC_KEY en los secretos de Supabase."});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const body=await req.text();if(!await validSignature(req,body))return json({error:"Invalid Discord signature or DISCORD_PUBLIC_KEY not configured"},401);
 let i:any;try{i=JSON.parse(body)}catch{return json({error:"Invalid JSON"},400)}
 try{return await handle(i)}catch(e){console.error("PRIME POLICE interaction:",String(e));if(i.type===2||i.type===3||i.type===5)return ephemeral("No se pudo completar la operación. Contacta con un administrador.");return json({error:"Internal error"},500)}
});
