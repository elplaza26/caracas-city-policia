import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GUILD_ID = "1539970134469378068";
const POLICE_ROLE_ID = "1539970134482092038";
const APPLICATION_CHANNEL_ID = "1539970136683847857";
const APPLICATION_ANNOUNCEMENTS_CHANNEL_ID = "1539970135375478860";
const APPLICATION_ID = "1540484542354428025";
const ADMIN_IDS = new Set(["698630509143654541"]);
const MANAGER_ROLE_IDS = new Set(["1539970134565982313", "1539970134544748562", "1539970134544748556", "1539970134519578773", "1539970134519578774"]);
const canManage = (i:any, userId:string) => ADMIN_IDS.has(userId) || (i.member?.roles || []).some((role:string) => MANAGER_ROLE_IDS.has(role));
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
const input=(id:string,label:string,placeholder:string,required=true,style=2)=>({type:4,custom_id:id,label,style,placeholder,min_length:1,max_length:style===1?100:1000,required});
function modal(){return response(9,{custom_id:"prime_application_submit",title:"Postulación · PRIME POLICE",components:[
 {type:1,components:[input("character_info","Historia del personaje","Nombre IC: ... | Edad IC: ... | Historia breve: ...")]},
 {type:1,components:[input("motivation","Motivación y aporte","¿Por qué quieres entrar a PRIME POLICE y qué aportaría tu personaje al cuerpo?")]},
 {type:1,components:[input("control_scenario","Situación policial","En un control, el conductor huye. ¿Cómo actúa paso a paso siguiendo el protocolo?")]},
 {type:1,components:[input("team_scenario","Trabajo en equipo","Un compañero se salta el protocolo. ¿Cómo reaccionas en rol y cómo lo reportas luego?")]},
 {type:1,components:[input("availability_rules","Disponibilidad y normativa","¿Qué disponibilidad semanal tienes? ¿Leíste y aceptas las normas policiales y de rol?")]}
]})}
function values(interaction:any){const out:any={};for(const row of interaction.data?.components||[])for(const c of row.components||[])out[c.custom_id]=String(c.value||"").trim();return out}
async function handle(i:any){
 if(i.type===1)return response(1,{});
 const user=i.member?.user||i.user;const userId=String(user?.id||"");const username=String(user?.global_name||user?.username||"Usuario Discord");
 if(i.type===2){
  const name=i.data?.name;
  if(name==="publicar_postulaciones"){
   if(!canManage(i,userId))return ephemeral("No tienes permiso para publicar las postulaciones.");
   await discord("/channels/"+APPLICATION_ANNOUNCEMENTS_CHANNEL_ID+"/messages",{method:"POST",body:JSON.stringify({embeds:[{title:"👮 PRIME POLICE · Postulaciones abiertas",description:"¿Quieres formar parte del cuerpo policial? Pulsa el botón para completar la postulación. Responde con sinceridad y revisa la normativa de PRIME POLICE antes de enviar. Cada persona dispone de un máximo de **3 intentos**.",color:14264415,footer:{text:"PRIME POLICE · Reclutamiento"}}],components:[{type:1,components:[{type:2,style:1,label:"Presentar postulación",custom_id:"prime_apply"}]}]})});
   return ephemeral("Formulario publicado en <#"+APPLICATION_ANNOUNCEMENTS_CHANNEL_ID+">.");
  }
  if(name==="postulacion")return ephemeral("Para postularte a PRIME POLICE, busca el mensaje de reclutamiento y pulsa **Presentar postulación**. Si no aparece, avisa a un administrador.");
  if(name==="panel_codigo"){
   if(!canManage(i,userId))return ephemeral("No tienes permiso para acceder al panel administrativo.");
   const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let code="";const random=new Uint8Array(10);crypto.getRandomValues(random);for(const n of random)code+=alphabet[n%alphabet.length];
   const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(code)));const hash=Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
   await db("police_panel_login_codes",{method:"POST",body:JSON.stringify({code_hash:hash,discord_user_id:userId,expires_at:new Date(Date.now()+5*60*1000).toISOString()})});
   return ephemeral("Código temporal del panel (caduca en 5 minutos y solo sirve una vez):\n\n**"+code+"**\n\nNo lo compartas.");
  }
  return ephemeral("Comando no reconocido.");
 }
 if(i.type===3){
  if(i.data?.custom_id==="prime_apply")return modal();
  return ephemeral("Interacción no reconocida.");
 }
 if(i.type===5&&i.data?.custom_id==="prime_application_submit"){
  const a=values(i);const personal=a.character_info||"";const characterName=(personal.split(/\r?\n|\|/)[0].replace(/^Nombre IC:\s*/i,"").trim()||personal).slice(0,100);
  if(!personal||!a.motivation||!a.control_scenario||!a.team_scenario||!a.availability_rules)return ephemeral("Completa todos los apartados antes de enviar.");
  const answer={character_info:personal,motivation:a.motivation,control_scenario:a.control_scenario,team_scenario:a.team_scenario,availability_rules:a.availability_rules};
  const submitted=await db("rpc/submit_police_application",{method:"POST",body:JSON.stringify({p_discord_user_id:userId,p_discord_username:username,p_full_name:characterName,p_previous_experience:a.motivation,p_motivation:a.motivation,p_answers:answer})});
  if(!submitted?.ok)return ephemeral(String(submitted?.message||"No se pudo aceptar la postulación."));
  const app=submitted.application;

  const embed={title:"📋 Nueva postulación · PRIME POLICE",description:"**Solicitante:** <@"+userId+">\n**Intento:** "+submitted.attempt_number+" de 3",fields:[{name:"Historia del personaje",value:personal.slice(0,1000)},{name:"Motivación y aporte",value:a.motivation.slice(0,1000)},{name:"Situación policial",value:a.control_scenario.slice(0,1000)},{name:"Trabajo en equipo",value:a.team_scenario.slice(0,1000)},{name:"Disponibilidad y normativa",value:a.availability_rules.slice(0,1000)}],color:14264415,footer:{text:"ID: "+String(app.id)+" · Intento "+submitted.attempt_number+"/3 · Revisar desde el panel web"}};
  try{const posted=await discord("/channels/"+APPLICATION_CHANNEL_ID+"/messages",{method:"POST",body:JSON.stringify({embeds:[embed]})}) as any;if(posted?.id)await db("police_applications?id=eq."+encodeURIComponent(String(app.id)),{method:"PATCH",body:JSON.stringify({discord_message_id:String(posted.id)})});}
  catch(error){console.error("Could not publish application intake message:",String(error));return ephemeral("Tu postulación quedó guardada, pero no se pudo publicar el aviso en el canal. Contacta con un administrador para confirmar su recepción.");}
  return ephemeral("¡Postulación recibida! Este es tu intento "+submitted.attempt_number+" de 3. El equipo de PRIME POLICE la revisará y comunicará el resultado en el canal correspondiente.");
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