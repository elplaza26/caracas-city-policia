// Short read cache; sensitive operations always revalidate roles with Discord.
const cached=new Map<string,{expires:number,member:any}>();
const inflight=new Map<string,Promise<any>>();
export async function accessMember(id:string,fresh=false){
 const found=cached.get(id);if(!fresh&&found&&found.expires>Date.now())return found.member;
 if(inflight.has(id))return inflight.get(id);
 const job=(async()=>{
  const token=Deno.env.get('DISCORD_BOT_TOKEN')||'';
  const r=await fetch('https://discord.com/api/v10/guilds/1539970134469378068/members/'+encodeURIComponent(id),{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(8000)});
  if(!r.ok){cached.delete(id);throw Error('Discord access lookup '+r.status);}
  const member=await r.json();cached.set(id,{member,expires:Date.now()+10000});
  if(cached.size>500)for(const [key,value]of cached)if(value.expires<Date.now())cached.delete(key);
  return member;
 })();inflight.set(id,job);try{return await job;}finally{inflight.delete(id);}
}
