export async function attachPersonnelMembership(rows:any[],read:(path:string)=>Promise<{rows:any[]}>){
 const ids=[...new Set(rows.map(row=>String(row.discord_user_id)))].filter(id=>/^\d{17,20}$/.test(id));
 if(!ids.length)return rows;
 try{
  // Any existing file counts, including inactive personnel and manually added agents.
  const members=await read('police_personnel?select=discord_user_id&discord_user_id=in.('+ids.join(',')+')&limit=100');
  const known=new Set(members.rows.map(row=>String(row.discord_user_id)));
  return rows.map(row=>({...row,personnel_registered:known.has(String(row.discord_user_id))}));
 }catch{return rows.map(row=>({...row,personnel_membership_unavailable:true}));}
}
