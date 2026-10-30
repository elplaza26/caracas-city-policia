const encoder=new TextEncoder();
export const SESSION_LIFETIME_SECONDS=7*24*60*60;
const SESSION_IDLE_MS=24*60*60*1000;
type Session={sub:string,sid:string,exp:number};
const checks=new WeakMap<Request,Promise<Session|null>>();
const encode=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function storage(path:string,init:RequestInit={}){
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+path,{...init,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...init.headers},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Session storage unavailable');return r.status===204?null:await r.json();
}
async function signingKey(usage:KeyUsage[]){const secret=Deno.env.get('PANEL_SESSION_SIGNING_KEY');if(!secret||secret.length<32)throw Error('Panel session signing key unavailable');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,usage);}
export async function createPanelSession(userId:string,req:Request){
 const session:Session={sub:userId,sid:crypto.randomUUID(),exp:Math.floor(Date.now()/1000)+SESSION_LIFETIME_SECONDS};
 const payload=encode(encoder.encode(JSON.stringify(session)));
 const signature=encode(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(['sign']),encoder.encode(payload))));
 const ua=req.headers.get('user-agent')||'';
 const device=(/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iPhone / iPad':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'Mac':'Navegador')+' · '+(/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Web');
 await storage('police_panel_sessions',{method:'POST',body:JSON.stringify({id:session.sid,discord_user_id:userId,device_label:device,expires_at:new Date(session.exp*1000).toISOString()})});
 // Remove expired sessions for this account; never store a usable token.
 await storage('police_panel_sessions?discord_user_id=eq.'+userId+'&expires_at=lt.'+encodeURIComponent(new Date().toISOString()),{method:'DELETE'}).catch(()=>{});
 return payload+'.'+signature;
}
async function check(req:Request):Promise<Session|null>{
 const auth=req.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))return null;
 const raw=auth.slice(7);if(raw.length>2048)return null;
 const parts=raw.split('.');if(parts.length!==2)return null;
 let session:Session;
 try{if(!await crypto.subtle.verify('HMAC',await signingKey(['verify']),decode(parts[1]),encoder.encode(parts[0])))return null;
  session=JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if(!/^\d{17,20}$/.test(session.sub)||!/^[a-f0-9-]{36}$/i.test(session.sid)||!Number.isFinite(session.exp)||session.exp<=Date.now()/1000)return null;
 }catch{return null;}
 const valid=await storage('rpc/panel_touch_session',{method:'POST',body:JSON.stringify({p_id:session.sid,p_user:session.sub})});
 return valid===true?session:null;
}
export async function panelSession(req:Request){if(!checks.has(req))checks.set(req,check(req));return checks.get(req)!;}
export async function authenticatePanelSession(req:Request){return (await panelSession(req))?.sub||null;}
export async function sessionRoutes(req:Request,action:string,json:(v:unknown,status?:number)=>Response){
 if(!['sessions','logout','logout-others'].includes(action))return null;
 if((action==='sessions'&&req.method!=='GET')||(action!=='sessions'&&req.method!=='POST'))return json({error:'Método no permitido.'},405);
 const session=await panelSession(req);if(!session)return json({error:'La sesión caducó. Entra nuevamente con Discord.'},401);
 const filter='discord_user_id=eq.'+session.sub;
 if(action==='sessions'){
  const rows=await storage('police_panel_sessions?select=id,device_label,created_at,last_seen_at&'+filter+'&revoked_at=is.null&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&last_seen_at=gt.'+encodeURIComponent(new Date(Date.now()-SESSION_IDLE_MS).toISOString())+'&order=created_at.desc&limit=50');
  return json({ok:true,sessions:rows.map((r:any)=>({...r,current:r.id===session.sid}))});
 }
 await storage('police_panel_sessions?'+filter+(action==='logout'?'&id=eq.':'&id=neq.')+session.sid+'&revoked_at=is.null',{method:'PATCH',body:JSON.stringify({revoked_at:new Date().toISOString()})});
 return json({ok:true,message:action==='logout'?'Sesión cerrada.':'Las demás sesiones se han cerrado.'});
}
export async function rateLimitRequest(req:Request,action:string){
 if(req.method==='OPTIONS'||(!action&&req.method==='GET'))return true;
 const publicAction=['login','oauth-start','oauth-callback'].includes(action);
 const session=publicAction?null:await panelSession(req);
 if(!publicAction&&!session)return true; // Normal authentication returns 401/403.
 const identity=session?.sub||(req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'unknown').split(',')[0].trim();
 const hash=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(identity))));
 const group=publicAction?'login':req.method==='GET'?'read':'write';
 return await storage('rpc/panel_consume_limit',{method:'POST',body:JSON.stringify({p_key:group+':'+hash,p_limit:publicAction?20:group==='read'?300:60,p_seconds:publicAction?600:60})})===true;
}
