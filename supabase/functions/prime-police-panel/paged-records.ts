import {createReviewCache,reviewSubmissionAnswers} from './application-review.ts';
import {attachRejectionHistory} from './rejection-history.ts';
const kinds:Record<string,{table:string,search:string[],date:string,statuses:string[]}>={
 absences:{table:'police_absence_requests',search:['full_name','discord_username','discord_user_id','plate'],date:'created_at',statuses:['pending','approved','rejected','cancelled']},
 applications:{table:'police_applications',search:['full_name','discord_username','discord_user_id','answers->>character_info'],date:'created_at',statuses:['pending','accepted','rejected']},
 transfers:{table:'police_transfer_applications',search:['full_name','discord_username','discord_user_id','source_city','source_faction'],date:'created_at',statuses:['pending','accepted','rejected']},
 intakes:{table:'police_rank_requests',search:['character_name','discord_username','discord_user_id','plate','steam_username','requested_rank_name','approved_by_name'],date:'created_at',statuses:['pending','accepted','rejected']},
 personnel:{table:'police_personnel',search:['full_name','discord_username','discord_user_id','plate','rank_name','name_ooc'],date:'created_at',statuses:['active','inactive']},
 sanctions:{table:'police_sanctions',search:['target_name','discord_username','discord_user_id','plate','reason','issuer_name'],date:'created_at',statuses:['active','failed','pending']},
 preselections:{table:'police_preselections',search:['full_name','discord_username','discord_user_id'],date:'accepted_at',statuses:['active','converted','withdrawn']},
};
async function query(path:string){
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+path,{headers:{apikey:secret,Authorization:'Bearer '+secret,Prefer:'count=exact'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Could not read paginated records');
 return{rows:await r.json(),count:Number(r.headers.get('content-range')?.split('/')[1]||0)};
}
export async function listPagedRecords(req:Request,json:(v:unknown,status?:number)=>Response){
 if(req.method!=='GET')return json({error:'Método no permitido.'},405);
 const p=new URL(req.url).searchParams,kind=p.get('kind')||'',config=kinds[kind];if(!config)return json({error:'Lista inválida.'},400);
 const offset=Number(p.get('offset')||0),limit=Number(p.get('limit')||25);
 const review=p.get('review')||'';if(review&&(kind!=='applications'||review!=='ai'))return json({error:'Filtro de revisión inválido.'},400);
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return json({error:'Página inválida.'},400);
 let filter='';const status=p.get('status')||'';if(status){if(!config.statuses.includes(status))return json({error:'Estado inválido.'},400);filter+='&status=eq.'+status;}
 const search=(p.get('search')||'').replace(/[^\p{L}\p{N}\s]/gu,'').trim().slice(0,100);
 if(search)filter+='&or=('+config.search.map(column=>column+'.ilike.*'+encodeURIComponent(search)+'*').join(',')+')';
 const target=p.get('discord_user_id');if(target){if(!/^\d{17,20}$/.test(target))return json({error:'Usuario inválido.'},400);filter+='&discord_user_id=eq.'+target;}
 const rank=p.get('rank');if(rank&&kind==='personnel')filter+='&rank_name=eq.'+encodeURIComponent(rank.slice(0,100));
 const projection=kind==='personnel'&&p.get('directory')==='true'?'discord_user_id,discord_username,full_name,name_ooc,plate,rank_name,rank_role_id,unit,status,last_rank_change_at,updated_at':'*';
 const ordering=kind==='personnel'?'plate_number.asc.nullslast,plate.asc,discord_user_id.asc':config.date+'.desc,'+(kind==='preselections'?'discord_user_id':'id')+'.desc';
 const table=review==='ai'?'police_rejected_ai_applications':config.table;
 const result=await query(table+'?select='+projection+'&order='+ordering+'&limit='+limit+'&offset='+offset+filter);
 if(['applications','transfers'].includes(kind))result.rows=await attachRejectionHistory(result.rows,config.table,query);
 if(['applications','transfers'].includes(kind)&&result.rows.length){
  try{
   const sample=await query(config.table+'?select=id,discord_user_id,'+(kind==='applications'?'answers':'reason')+'&order=created_at.desc,id.desc&limit=200');
   const cache=createReviewCache(); // Only this request; no applicant text persists in a shared cache.
   result.rows=result.rows.map((row:any)=>({...row,automatic_review:reviewSubmissionAnswers(kind,row,sample.rows,cache)}));
  }catch{result.rows=result.rows.map((row:any)=>({...row,automatic_review:{unavailable:true}}));}
 }
 const counts:Record<string,number>={};
 if(p.get('counts')==='true')await Promise.all(config.statuses.map(async s=>{counts[s]=(await query(config.table+'?select='+config.date+'&status=eq.'+s+'&limit=1')).count;}));
 return json({ok:true,records:result.rows,total:result.count,counts,next_offset:offset+result.rows.length<result.count?offset+limit:null});
}
