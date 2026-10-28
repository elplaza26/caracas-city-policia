const reads=new Map<string,Promise<any>>();
const routeWaits=new Map<string,number>();
let globalWait=0;
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export class DiscordFailure extends Error{
 status:number;retryAfter:number;
 constructor(status:number,retryAfter=0){super(status?'Discord API '+status:'Discord network timeout or connection failure');this.status=status;this.retryAfter=retryAfter;}
}
export function discordFailure(error:unknown):{status:number,body:any}|null{
 if(!(error instanceof DiscordFailure))return null;
 if(error.status===403)return{status:409,body:{error:'Discord denegó la operación. Revisa los permisos del bot y la posición de su rol respecto al agente.',code:'discord_permissions'}};
 if(error.status===404)return{status:404,body:{error:'Discord no encontró al miembro o recurso solicitado.',code:'discord_not_found'}};
 if(error.status===401)return{status:503,body:{error:'Discord rechazó la credencial del bot. El administrador debe revisar DISCORD_BOT_TOKEN.',code:'discord_bot_auth'}};
 if(error.status===429)return{status:503,body:{error:'Discord ha pedido una pausa temporal. Espera unos segundos y actualiza el registro antes de repetir.',code:'discord_rate_limit',retry_after:error.retryAfter}};
 if(!error.status||error.status>=500)return{status:503,body:{error:'La conexión con Discord falló temporalmente. Actualiza el registro para comprobar si el cambio se aplicó antes de repetirlo.',code:'discord_unavailable'}};
 return null;
}
export async function discordRequest(path:string,init:RequestInit={}):Promise<any>{
 const method=(init.method||'GET').toUpperCase(),key=method+':'+path;
 if(method==='GET'&&reads.has(key))return reads.get(key);
 const job=(async()=>{
  const token=Deno.env.get('DISCORD_BOT_TOKEN')||'';if(!token)throw new DiscordFailure(401);
  for(let attempt=0;attempt<2;attempt++){
   const wait=Math.max(globalWait,routeWaits.get(key)||0)-Date.now();if(wait>3500)throw new DiscordFailure(429,Math.ceil(wait/1000));if(wait>0)await pause(wait);
   let response:Response;
   try{response=await fetch('https://discord.com/api/v10'+path,{...init,headers:{Authorization:'Bot '+token,'Content-Type':'application/json',...(init.headers||{})},signal:AbortSignal.timeout(10000)});}
   catch{if(method==='GET'&&attempt===0){await pause(200);continue;}throw new DiscordFailure(0);}
   const body=response.status===204?null:await response.json().catch(()=>null);
   if(response.ok){if(response.headers.get('x-ratelimit-remaining')==='0'){const delay=Number(response.headers.get('x-ratelimit-reset-after'));if(Number.isFinite(delay)&&delay>0)routeWaits.set(key,Date.now()+delay*1000);}return body;}
   if(response.status===429){const raw=Number(body?.retry_after??response.headers.get('retry-after')??1),delay=Number.isFinite(raw)&&raw>0?raw:1;const until=Date.now()+Math.ceil(delay*1000)+50;if(body?.global||response.headers.get('x-ratelimit-global')==='true')globalWait=until;else routeWaits.set(key,until);if(attempt===0&&delay<=3.4)continue;throw new DiscordFailure(429,delay);}
   if(method==='GET'&&response.status>=500&&attempt===0){await pause(250);continue;}
   throw new DiscordFailure(response.status);
  }throw new DiscordFailure(0);
 })();
 if(method==='GET')reads.set(key,job);
 try{return await job;}finally{if(method==='GET')reads.delete(key);if(routeWaits.size>500)for(const[k,until]of routeWaits)if(until<Date.now())routeWaits.delete(k);}
}
