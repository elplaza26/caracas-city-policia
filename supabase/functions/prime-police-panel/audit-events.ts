export async function writeAudit(action:string,fields:unknown){
 try{
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/police_audit_events',{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({action,fields}),signal:AbortSignal.timeout(5000)});
  if(!r.ok)console.error('Audit database write failed:',r.status);
 }catch(e){console.error('Audit database unavailable:',String(e));}
}
