export async function attachRejectionHistory(rows:any[],table:string,read:(path:string)=>Promise<{rows:any[]}>){
 const repeated=rows.filter(row=>Number(row.attempt_number)>1);
 if(!repeated.length)return rows;
 const users=[...new Set(repeated.map(row=>String(row.discord_user_id)))].filter(id=>/^\d{17,20}$/.test(id));
 if(!users.length)return rows;
 try{
  const {rows:history}=await read(table+'?select=id,discord_user_id,attempt_number,decision_reason,reviewed_by_name,reviewed_by_discord_id,reviewed_at,created_at&status=eq.rejected&discord_user_id=in.('+users.join(',')+')&order=created_at.asc,id.asc&limit=1000');
  return rows.map(row=>Number(row.attempt_number)>1?{...row,previous_rejections:history.filter(old=>
   String(old.discord_user_id)===String(row.discord_user_id)&&old.id!==row.id&&
   Number(old.attempt_number)<Number(row.attempt_number)&&Date.parse(old.created_at)<Date.parse(row.created_at)
  )}:row);
 }catch{return rows.map(row=>Number(row.attempt_number)>1?{...row,rejection_history_unavailable:true}:row);}
}
