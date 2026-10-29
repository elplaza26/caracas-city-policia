export const ABSENCE_CHANNEL_ID='1539970136050499668';
const GUILD_ID='1539970134469378068',POLICE_ROLE='1539970134482092038',EXPELLED_ROLE='1539970134482092034';
export const absencePanel={embeds:[{title:'📋 SOLICITUD DE AUSENCIA · POLICÍA',description:'¿Necesitas ausentarte? Pulsa **Solicitar ausencia** e indica las fechas y el motivo en privado.\n\nLa ausencia quedará registrada en la web sin necesidad de aprobación. Podrás consultar su estado en **Mis ausencias**.\n\nEl período indicado se tendrá en cuenta en el control de actividad.',color:0xe7b45b,footer:{text:'PRIME POLICE · Gestión de personal · Respuesta privada'}}],components:[{type:1,components:[{type:2,style:1,label:'Solicitar ausencia',custom_id:'prime_absence'},{type:2,style:2,label:'Mis ausencias',custom_id:'prime_absence_mine'}]}],allowed_mentions:{parse:[]}};
export function absenceDate(value:unknown){const raw=String(value||'').trim();const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);const iso=match?match[3]+'-'+match[2]+'-'+match[1]:raw;if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;const date=new Date(iso+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;}
type Context={db:(path:string,init?:RequestInit)=>Promise<any>,discord:(path:string)=>Promise<any>,response:(type:number,data:any)=>Response,ephemeral:(text:string)=>Response,values:(i:any)=>any,reply:(i:any,text:string)=>Promise<any>};
export async function handleAbsenceInteraction(i:any,c:Context):Promise<Response|null>{
 const custom=i.data?.custom_id;if(!['prime_absence','prime_absence_mine','prime_absence_submit'].includes(custom))return null;
 if(i.guild_id!==GUILD_ID)return c.ephemeral('Usa este formulario dentro del servidor de PRIME POLICE.');
 const user=i.member?.user||i.user,userId=String(user?.id||''),roles=i.member?.roles||[];
 if(!roles.includes(POLICE_ROLE)||roles.includes(EXPELLED_ROLE))return c.ephemeral('Debes tener el rol Policía para solicitar o consultar ausencias.');
 if(i.type===3&&custom==='prime_absence')return c.response(9,{custom_id:'prime_absence_submit',title:'Solicitud de ausencia · Policía',components:[
  {type:18,label:'Primer día de ausencia',description:'Formato DD/MM/AAAA. Las fechas siguen el horario del servidor.',component:{type:4,custom_id:'start_date',style:1,required:true,max_length:10,placeholder:'Ej. 30/10/2026'}},
  {type:18,label:'Último día de ausencia',description:'Este día también se incluye. Volverás a estar disponible al día siguiente.',component:{type:4,custom_id:'end_date',style:1,required:true,max_length:10,placeholder:'Ej. 02/11/2026'}},
  {type:18,label:'Motivo de la ausencia',component:{type:4,custom_id:'reason',style:2,required:true,min_length:3,max_length:4000,placeholder:'Explica el motivo. Solo lo verá el personal autorizado.'}}
 ]});
 if((i.type===3&&custom==='prime_absence_mine')||(i.type===5&&custom==='prime_absence_submit')){
  const input=c.values(i),start=absenceDate(input.start_date),end=absenceDate(input.end_date);
  if(custom==='prime_absence_submit'&&(!start||!end||end<start||String(input.reason||'').trim().length<3))return c.ephemeral('Revisa las fechas (DD/MM/AAAA): el último día no puede ser anterior al primero. Añade un motivo de al menos 3 caracteres.');
  EdgeRuntime.waitUntil((async()=>{await new Promise(resolve=>setTimeout(resolve,25));try{
   const member=await c.discord('/guilds/'+GUILD_ID+'/members/'+encodeURIComponent(userId));
   if(!(member.roles||[]).includes(POLICE_ROLE)||(member.roles||[]).includes(EXPELLED_ROLE)){await c.reply(i,'Tu cuenta ya no tiene el rol Policía autorizado.');return;}
   if(custom==='prime_absence_mine'){
    const rows=await c.db('police_absence_requests?select=start_date,end_date,status,review_reason&discord_user_id=eq.'+userId+'&order=created_at.desc&limit=10');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const labels:Record<string,string>={pending:'Pendiente de revisión',approved:'Registrada',rejected:'Rechazada',cancelled:'Cancelada'};
    await c.reply(i,rows.length?'📋 Tus últimas solicitudes\n\n'+rows.map((r:any)=>'**'+r.start_date+' → '+r.end_date+'** · '+(r.status==='approved'?(r.start_date>today?'Programada':r.end_date<today?'Finalizada':'Ausencia vigente'):labels[r.status])+(r.review_reason?'\nObservación: '+String(r.review_reason).slice(0,100):'')).join('\n\n'):'Todavía no tienes solicitudes de ausencia registradas.');return;
   }
   const result=await c.db('rpc/submit_police_absence',{method:'POST',body:JSON.stringify({p_user:userId,p_username:String(user.global_name||user.username||'Discord'),p_request_key:String(i.id),p_start:start,p_end:end,p_reason:input.reason})});
   await c.reply(i,result.ok?'✅ Ausencia registrada en privado.\n**'+start+' → '+end+'** (ambos días incluidos).\nNo necesita aprobación. Se aplicará durante las fechas indicadas. Puedes consultar su estado en Mis ausencias.':result.error||'No se pudo registrar la ausencia.');
  }catch(error){console.error('Absence interaction:',String(error));await c.reply(i,'No se pudo confirmar el registro. Consulta Mis ausencias antes de repetir o contacta con UCOP.');}})());
  return c.ephemeral(custom==='prime_absence_mine'?'Consultando tus ausencias…':'Registrando tu solicitud de ausencia…');
 }
 return c.ephemeral('Interacción de ausencia no compatible.');
}
