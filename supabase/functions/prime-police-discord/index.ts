import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GUILD_ID = "1539970134469378068";
const PRESELECTION_ROLE_ID = "1564685481457877012";
const CIC_ROLE_ID = "1539970134519578772";
const EXPELLED_ROLE_ID = "1539970134482092034";
const APPLICATION_CHANNEL_ID = "1539970136683847857";
const APPLICATION_ANNOUNCEMENTS_CHANNEL_ID = "1539970135375478860";
const RANK_REQUEST_CHANNEL_ID = "1539970135375478859";
const APPLICATION_ID = "1540484542354428025";
const MANAGER_ROLE_IDS = new Set(["1539970134565982313", "1539970134544748562", "1539970134544748556", "1539970134544748557", "1539970134519578773", "1539970134519578774"]);
const canManage = (i:any) => (i.member?.roles || []).some((role:string) => MANAGER_ROLE_IDS.has(role));
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_PUBLIC_KEY = "00d2404753364bae3875ef0fb6f98707e642a08405a1fb3b97bcd391bd183d57";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"};
const json = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json",...CORS}});
const encoder = new TextEncoder();
const hexBytes=(hex:string)=>new Uint8Array((hex.match(/.{1,2}/g)||[]).map(x=>parseInt(x,16)));
async function verify(req:Request,body:ArrayBuffer){if(!DISCORD_PUBLIC_KEY)return false;const ts=req.headers.get("x-signature-timestamp")||"",sig=req.headers.get("x-signature-ed25519")||"";if(!ts||!sig||!/^\d+$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300)return false;try{const key=await crypto.subtle.importKey("raw",hexBytes(DISCORD_PUBLIC_KEY),{name:"Ed25519"},false,["verify"]);return await crypto.subtle.verify({name:"Ed25519"},key,hexBytes(sig),encoder.encode(ts).reduce((a,b)=>a, new Uint8Array()) /* replaced below */)}catch{return false}}
async function validSignature(req:Request,bodyText:string){if(!DISCORD_PUBLIC_KEY)return false;const ts=req.headers.get("x-signature-timestamp")||"",sig=req.headers.get("x-signature-ed25519")||"";if(!ts||!sig||!/^[0-9a-f]+$/i.test(sig)||!/^\d+$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300)return false;try{const key=await crypto.subtle.importKey("raw",hexBytes(DISCORD_PUBLIC_KEY),{name:"Ed25519"},false,["verify"]);const data=encoder.encode(ts+bodyText);return await crypto.subtle.verify({name:"Ed25519"},key,hexBytes(sig),data)}catch{return false}}
async function db(path:string,init:RequestInit={}){if(!SUPABASE_URL||!SERVICE_KEY)throw Error("Database credentials missing");const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})}});const text=await r.text();let body:any;try{body=JSON.parse(text)}catch{body=text}if(!r.ok)throw Error("DB "+r.status);return body}
async function discord(path:string,init:RequestInit={}){if(!BOT_TOKEN)throw Error("Discord bot token missing");const r=await fetch("https://discord.com/api/v10"+path,{...init,headers:{Authorization:"Bot "+BOT_TOKEN,"Content-Type":"application/json",...(init.headers||{})}});const text=await r.text();let body:any;try{body=text?JSON.parse(text):null}catch{body=text}if(!r.ok)throw Error("Discord "+r.status+" "+JSON.stringify(body));return body}
const response=(type:number,data:any)=>json({type,data});
const ephemeral=(content:string)=>response(4,{content,flags:64});
async function editInteractionReply(interaction:any,content:string){
 const token=String(interaction.token||"");
 if(!token)throw Error("Discord interaction token missing");
 const r=await fetch("https://discord.com/api/v10/webhooks/"+APPLICATION_ID+"/"+encodeURIComponent(token)+"/messages/@original",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});
 if(!r.ok)throw Error("Discord interaction reply "+r.status);
}
async function publishOrUpdatePanel(channelId:string,customId:string,payload:any){
 const messages=await discord("/channels/"+channelId+"/messages?limit=100") as any[];
 const current=Array.isArray(messages)?messages.find((message:any)=>String(message.author?.id)===APPLICATION_ID&&(message.components||[]).some((row:any)=>(row.components||[]).some((component:any)=>component.custom_id===customId))):null;
 if(current?.id)return await discord("/channels/"+channelId+"/messages/"+current.id,{method:"PATCH",body:JSON.stringify(payload)});
 return await discord("/channels/"+channelId+"/messages",{method:"POST",body:JSON.stringify(payload)});
}
async function processApplicationSubmit(i:any,userId:string,username:string,a:any){
 const personal=a.character_info||"";const characterName=(personal.split(/\r?\n|\|/)[0].replace(/^Nombre IC:\s*/i,"").trim()||personal).slice(0,100);
 const answer={character_info:personal,motivation:a.motivation,detention_rights:a.detention_rights,scene_resolution:a.scene_resolution,roleplay_response:a.roleplay_response};
 const submitted=await db("rpc/submit_police_application",{method:"POST",body:JSON.stringify({p_discord_user_id:userId,p_discord_username:username,p_full_name:characterName,p_previous_experience:a.motivation,p_motivation:a.motivation,p_answers:answer})});
 if(!submitted?.ok){await editInteractionReply(i,String(submitted?.message||"No se pudo aceptar la postulación."));return;}
 const app=submitted.application;
 const embed={title:"📋 Nueva postulación · PRIME POLICE",description:"**Solicitante:** <@"+userId+">\n**Intento:** "+submitted.attempt_number+" de 3",fields:[{name:"Nombre y edad (IC)",value:personal.slice(0,1000)},{name:"Motivación y mejora personal",value:a.motivation.slice(0,1000)},{name:"Responsabilidad y órdenes",value:a.detention_rights.slice(0,1000)},{name:"Mala praxis o corrupción",value:a.scene_resolution.slice(0,1000)},{name:"Situaciones policiales",value:a.roleplay_response.slice(0,1000)}],color:14264415,footer:{text:"ID: "+String(app.id)+" · Intento "+submitted.attempt_number+"/3 · Revisar desde el panel web"}};
 try{const posted=await discord("/channels/"+APPLICATION_CHANNEL_ID+"/messages",{method:"POST",body:JSON.stringify({embeds:[embed]})}) as any;if(posted?.id)await db("police_applications?id=eq."+encodeURIComponent(String(app.id)),{method:"PATCH",body:JSON.stringify({discord_message_id:String(posted.id)})});}
 catch(error){console.error("Could not publish application intake message:",String(error));await editInteractionReply(i,"Tu postulación quedó guardada, pero no se pudo publicar el aviso en el canal. Contacta con un administrador para confirmar su recepción.");return;}
 await editInteractionReply(i,"¡Postulación recibida! Este es tu intento "+submitted.attempt_number+" de 3. El equipo de PRIME POLICE la revisará y comunicará el resultado en el canal correspondiente.");
}
async function processRankRequest(i:any,userId:string,username:string,a:any){
 const characterName=String(a.character_name||"").trim().slice(0,100);
 const plate=String(a.plate||"").trim().slice(0,30);
 const requestedRank=String(a.requested_rank||"").trim().slice(0,100);
 const approvedBy=String(a.approved_by||"").replace(/@/g,"").trim().slice(0,100);
 if(!characterName||!plate||!requestedRank||!approvedBy){await editInteractionReply(i,"Completa nombre IC, placa, rango y nombre de quien aprobó la entrevista.");return;}
 const member=await discord("/guilds/"+GUILD_ID+"/members/"+encodeURIComponent(userId)) as any;
 const roles:string[]=member?.roles||[];
 if(!roles.includes(PRESELECTION_ROLE_ID)||roles.includes(CIC_ROLE_ID)||roles.includes(EXPELLED_ROLE_ID)){await editInteractionReply(i,"Solo las personas aceptadas con el rol de Preselección pueden enviar una solicitud de rango tras su entrevista IC.");return;}
 const configured=await db("police_rank_roles?select=role_name");
 const rank=(configured||[]).find((row:any)=>String(row.role_name||"").trim().toLocaleLowerCase("es")===requestedRank.toLocaleLowerCase("es"));
 if(!rank){const names=(configured||[]).map((row:any)=>String(row.role_name||"")).filter(Boolean);await editInteractionReply(i,names.length?"Ese rango no está configurado. Rangos disponibles: "+names.join(", "):"UCOP todavía no ha configurado rangos en la web.");return;}
 const pending=await db("police_rank_requests?select=id&discord_user_id=eq."+encodeURIComponent(userId)+"&status=eq.pending&limit=1");
 if(pending?.length){await editInteractionReply(i,"Ya tienes una solicitud de rango pendiente de revisión por UCOP.");return;}
 const rows=await db("police_rank_requests",{method:"POST",body:JSON.stringify({discord_user_id:userId,discord_username:username,character_name:characterName,plate,requested_rank_name:String(rank.role_name),approved_by_name:approvedBy})});
 const request=rows?.[0];
 if(!request?.id)throw Error("Rank request was not stored");
 try{
  const posted=await discord("/channels/"+RANK_REQUEST_CHANNEL_ID+"/messages",{method:"POST",body:JSON.stringify({embeds:[{title:"📋 Solicitud de rango · UCOP",description:"Nueva solicitud para revisión de UCOP.",fields:[{name:"Nombre del personaje",value:characterName},{name:"Número de placa",value:plate},{name:"Rango solicitado",value:String(rank.role_name)},{name:"Aprobado por",value:approvedBy},{name:"Solicitado por",value:"<@"+userId+">"}],color:14264415,footer:{text:"Solicitud "+String(request.id)+" · Revisión pendiente en la web UCOP"}}],allowed_mentions:{parse:[],users:[]}})}) as any;
  if(posted?.id)await db("police_rank_requests?id=eq."+encodeURIComponent(String(request.id)),{method:"PATCH",body:JSON.stringify({discord_message_id:String(posted.id)})});
 }catch(error){console.error("Could not post rank request to Discord channel:",String(error));await editInteractionReply(i,"La solicitud quedó guardada en la web UCOP, pero no se pudo publicar en el canal de solicitudes. Contacta con UCOP.");return;}
 await editInteractionReply(i,"Solicitud de rango enviada a UCOP para revisión. El equipo comprobará la aprobación de tu entrevista IC.");
}
const input=(id:string,label:string,placeholder:string,required=true,style=2,maxLength=style===1?100:1000)=>({type:4,custom_id:id,label,style,...(placeholder?{placeholder}:{}),min_length:1,max_length:maxLength,required});
function rankRequestModal(){return response(9,{custom_id:"prime_rank_request_submit",title:"Solicitar rango · UCOP",components:[
 {type:1,components:[input("character_name","Nombre del personaje","",true,1)]},
 {type:1,components:[input("plate","Número de placa","",true,1,30)]},
 {type:1,components:[input("requested_rank","Rango solicitado","Escribe el nombre del rango configurado en la web.",true,1)]},
 {type:1,components:[input("approved_by","Aprobado por (sin @)","Escribe el nombre, sin mencionar a nadie.",true,1)]}
]})}
function applicationQuestions(){return [
 "1. **Nombre y edad (IC)**\n   Indica el nombre de tu personaje y su edad dentro del servidor.",
 "2. **Motivación y mejora personal**\n   ¿Por qué quieres formar parte de la Policía? ¿Cuáles son tus virtudes y qué aspectos mejorarías?",
 "3. **Responsabilidad y órdenes**\n   ¿Qué significa para ti pertenecer a la Policía? ¿Cómo actuarías ante una orden de un superior que consideras incorrecta o contraria a los protocolos?",
 "4. **Mala praxis o corrupción**\n   Si descubres que un compañero ha cometido una falta grave o ha aceptado un soborno, ¿qué harías y a quién lo comunicarías?",
 "5. **Situaciones policiales**\n   - **Caso 1:** Estás solo ante varios vehículos sospechosos. ¿Cómo pides apoyo?\n   - **Caso 2:** Una persona está agresiva, desobedece y tiene un bate. ¿Cómo actuarías?"
].join("\n\n")}
function applicationInstructions(){return response(4,{flags:64,embeds:[{title:"Preguntas de postulación · PRIME POLICE",description:applicationQuestions(),color:14264415,footer:{text:"Lee las preguntas y pulsa Continuar para responderlas."}}],components:[{type:1,components:[{type:2,style:1,label:"Continuar · Responder preguntas",custom_id:"prime_application_form"}]}]})}
function modal(){return response(9,{custom_id:"prime_application_submit",title:"Postulación · PRIME POLICE",components:[
 {type:18,label:"Nombre y edad (IC)",description:"Indica el nombre de tu personaje y su edad dentro del servidor.",component:input("character_info","Respuesta","Escribe tu respuesta.")},
 {type:18,label:"Motivación y mejora personal",description:"¿Por qué quieres formar parte de la Policía? ¿Cuáles son tus virtudes y qué aspectos mejorarías?",component:input("motivation","Respuesta","Escribe tu respuesta.")},
 {type:18,label:"Responsabilidad y órdenes",component:input("detention_rights","Respuesta","Responde a la pregunta completa que aparece en el paso anterior.")},
 {type:18,label:"Mala praxis o corrupción",component:input("scene_resolution","Respuesta","Responde a la pregunta completa que aparece en el paso anterior.")},
 {type:18,label:"Situaciones policiales",component:input("roleplay_response","Responde ambos casos","Responde a los dos casos que aparecen en el paso anterior.")}
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
     const applicationPanel={embeds:[{title:"📝 Preselección de ingreso · PRIME POLICE",description:"Completa la postulación para que **UCOP** revise tu solicitud. Cada persona dispone de un máximo de **3 intentos**.\n\nSi te aprueban, recibirás el rol **Preselección** y UCOP coordinará contigo una **entrevista IC**. Después de aprobarla, podrás solicitar el rol de Policía y tu rango desde <#"+RANK_REQUEST_CHANNEL_ID+">.",color:14264415,footer:{text:"PRIME POLICE · Preselección UCOP"}}],components:[{type:1,components:[{type:2,style:1,label:"Presentar postulación",custom_id:"prime_apply"}]}]};
     const rankPanel={embeds:[{title:"📈 Solicitud de rango y rol de Policía · UCOP",description:"Este formulario es para personas con el rol **Preselección** que ya aprobaron su **entrevista IC**.\n\nCompleta el nombre del personaje, número de placa, rango solicitado y el nombre de quien aprobó la entrevista (**sin @**). UCOP revisará la solicitud en la web y, si la aprueba, asignará el rol de **Policía** junto con el rango solicitado.",color:14264415,footer:{text:"PRIME POLICE · Solicitudes UCOP"}}],components:[{type:1,components:[{type:2,style:2,label:"Solicitar rango",custom_id:"prime_rank_request"}]}]};
     await publishOrUpdatePanel(APPLICATION_ANNOUNCEMENTS_CHANNEL_ID,"prime_apply",applicationPanel);
     await publishOrUpdatePanel(RANK_REQUEST_CHANNEL_ID,"prime_rank_request",rankPanel);
     await editInteractionReply(i,"Paneles de postulación y solicitud de rango actualizados.");
    }catch(error){
     console.error("Could not publish application announcement:",String(error));
     try{await editInteractionReply(i,"No se pudo publicar el formulario. Comprueba los permisos del bot y vuelve a intentarlo.");}catch(replyError){console.error("Could not update deferred interaction:",String(replyError));}
    }
   })());
   return response(5,{data:{flags:64}});
  }
  if(name==="postulacion")return ephemeral("Para postularte a PRIME POLICE, busca el mensaje de reclutamiento y pulsa **Presentar postulación**. Si no aparece, avisa a un administrador.");
  if(name==="panel_codigo"){
   if(!canManage(i))return ephemeral("No tienes permiso para acceder al panel administrativo.");
   const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let code="";const random=new Uint8Array(10);crypto.getRandomValues(random);for(const n of random)code+=alphabet[n%alphabet.length];
   const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(code)));const hash=Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
   await db("police_panel_login_codes",{method:"POST",body:JSON.stringify({code_hash:hash,discord_user_id:userId,expires_at:new Date(Date.now()+5*60*1000).toISOString()})});
   return ephemeral("Código temporal del panel (caduca en 5 minutos y solo sirve una vez):\n\n**"+code+"**\n\nNo lo compartas.");
  }
  return ephemeral("Comando no reconocido.");
 }
 if(i.type===3){
  if(i.data?.custom_id==="prime_apply")return applicationInstructions();
  if(i.data?.custom_id==="prime_application_form")return modal();
  if(i.data?.custom_id==="prime_rank_request")return rankRequestModal();
  return ephemeral("Interacción no reconocida.");
 }
 if(i.type===5&&i.data?.custom_id==="prime_rank_request_submit"){
  const a=values(i);
  EdgeRuntime.waitUntil((async()=>{try{await processRankRequest(i,userId,username,a);}catch(error){console.error("Could not process rank request:",String(error));try{await editInteractionReply(i,"No se pudo completar la solicitud de rango. Contacta con UCOP antes de volver a enviarla.");}catch(replyError){console.error("Could not update rank request interaction:",String(replyError));}}})());
  return response(5,{data:{flags:64}});
 }
 if(i.type===5&&i.data?.custom_id==="prime_application_submit"){
  const a=values(i);const personal=a.character_info||"";
  if(!personal||!a.motivation||!a.detention_rights||!a.scene_resolution||!a.roleplay_response)return ephemeral("Completa todos los apartados antes de enviar.");
  EdgeRuntime.waitUntil((async()=>{try{await processApplicationSubmit(i,userId,username,a);}catch(error){console.error("Could not process application submit:",String(error));try{await editInteractionReply(i,"No se pudo completar el envío. Comprueba si quedó registrada en el panel y contacta con un administrador antes de volver a intentarlo.");}catch(replyError){console.error("Could not update application interaction:",String(replyError));}}})());
  return response(5,{data:{flags:64}});
 }
 return ephemeral("Interacción no compatible.");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method==="GET")return json({ok:true,service:"PRIME POLICE Discord applications",configured:{discord:Boolean(BOT_TOKEN),database:Boolean(SUPABASE_URL&&SERVICE_KEY),public_key:Boolean(DISCORD_PUBLIC_KEY)},application_id:APPLICATION_ID,guild_id:GUILD_ID,commands:["publicar_postulaciones","postulacion","panel_codigo"],message:DISCORD_PUBLIC_KEY?"Endpoint disponible.":"Falta configurar DISCORD_PUBLIC_KEY en los secretos de Supabase."});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const body=await req.text();if(!await validSignature(req,body))return json({error:"Invalid Discord signature or DISCORD_PUBLIC_KEY not configured"},401);
 let i:any;try{i=JSON.parse(body)}catch{return json({error:"Invalid JSON"},400)}
 try{return await handle(i)}catch(e){console.error("PRIME POLICE interaction:",String(e));if(i.type===2||i.type===3||i.type===5)return ephemeral("No se pudo completar la operación. Contacta con un administrador.");return json({error:"Internal error"},500)}
});
