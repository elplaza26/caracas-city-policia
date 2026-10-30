type Db=(path:string,init?:RequestInit)=>Promise<any>;
const actions=new Set(['preselection-admit','transfer-admit','personnel-register']);
const failure=(error:string,status:number)=>Response.json({error},{status,headers:{'Access-Control-Allow-Origin':'https://primepolicerp.github.io','Cache-Control':'no-store','Vary':'Origin'}});
export async function preparePlate(req:Request,action:string,db:Db,authorized:(req:Request)=>Promise<string|null>):Promise<Request|Response>{
 if(req.method!=='POST'||!actions.has(action))return req;
 const body=await req.clone().json();
 if(action==='personnel-register'&&body.record_action!=='create')return req;
 const operation=String(body.operation_id||body.plate_operation_id||'');
 if(!operation&&body.auto_plate!==true)return req; // Older clients keep their explicit plate.
 if(!await authorized(req))return failure('No tienes permiso para asignar placas.',403);
 if(!/^[a-f0-9-]{36}$/i.test(operation)||!/^\d{17,20}$/.test(String(body.discord_user_id||'')))return failure('Referencia de ingreso o usuario inválida.',400);
 if(!String(body.full_name||'').trim()||(action!=='personnel-register'&&(body.interview_confirmed!==true||!String(body.steam_username||'').trim()||!String(body.approved_by_name||'').trim())))return failure('Completa los datos del ingreso antes de asignar la placa.',400);
 const result=await db('rpc/reserve_police_plate',{method:'POST',body:JSON.stringify({p_operation:operation,p_user:String(body.discord_user_id),p_manual:body.auto_plate===true?null:String(body.plate||'').trim()})});
 if(!result?.ok)return failure(result?.error||'No se pudo asignar la siguiente placa.',409);
 return new Request(req,{body:JSON.stringify({...body,plate:result.plate})});
}
