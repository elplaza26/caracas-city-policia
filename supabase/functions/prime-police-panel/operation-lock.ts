export async function withOperationLock(key:string,run:()=>Promise<Response>):Promise<Response>{
 const url=Deno.env.get('SUPABASE_URL')+'/rest/v1/police_operation_locks';
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const headers={apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'};
 const fail=(error:string,status:number)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'https://primepolicerp.github.io','Cache-Control':'no-store'}});
 const filter='?key=eq.'+encodeURIComponent(key),lease=crypto.randomUUID();
 try{
  const expired=await fetch(url+filter+'&expires_at=lt.'+encodeURIComponent(new Date().toISOString()),{method:'DELETE',headers,signal:AbortSignal.timeout(8000)});
  if(!expired.ok)return fail('No se pudo verificar la operación. Aplica la migración de autorizaciones y bloqueos.',503);
  const acquired=await fetch(url,{method:'POST',headers,body:JSON.stringify({key,lease_id:lease,expires_at:new Date(Date.now()+300000).toISOString()}),signal:AbortSignal.timeout(8000)});
  if(acquired.status===409)return fail('Otro gestor está procesando una operación para este agente. Espera y actualiza antes de repetir.',409);
  if(!acquired.ok)return fail('No se pudo reservar la operación. Reintenta más tarde.',503);
  try{return await run();}finally{await fetch(url+filter+'&lease_id=eq.'+lease,{method:'DELETE',headers,signal:AbortSignal.timeout(8000)}).catch(e=>console.error('Operation lease cleanup:',String(e)));}
 }catch(error){console.error('Operation lock:',String(error));return fail('No se pudo contactar con la base de datos. Actualiza el registro antes de repetir la operación.',503);}
}
