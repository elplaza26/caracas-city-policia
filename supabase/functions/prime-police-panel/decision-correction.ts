export async function validateDecisionCorrection(body:any,record:any,table:string,db:(path:string,init?:RequestInit)=>Promise<any>):Promise<string>{
 if(body.action!=='accept'||record.status!=='rejected')return '';
 if(body.correct_rejection!==true||String(body.reason||'').trim().length<3)return 'Indica el motivo de la corrección del rechazo (al menos 3 caracteres).';
 const newer=await db(table+'?select=id&discord_user_id=eq.'+encodeURIComponent(record.discord_user_id)+'&created_at=gt.'+encodeURIComponent(record.created_at)+'&status=in.(pending,accepted)&limit=1');
 return newer?.length?'Hay una solicitud más reciente pendiente o aceptada. Revisa esa solicitud para evitar duplicar el ingreso.':'';
}
