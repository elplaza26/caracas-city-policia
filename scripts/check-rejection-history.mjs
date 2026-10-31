import assert from 'node:assert/strict';
import {attachRejectionHistory} from '../supabase/functions/prime-police-panel/rejection-history.ts';
const user='111111111111111111',other='222222222222222222';
const old={id:'old',discord_user_id:user,attempt_number:1,created_at:'2026-10-01T00:00:00Z',decision_reason:'Faltó explicar el procedimiento',reviewed_by_name:'Gestor de ejemplo',reviewed_by_discord_id:other,reviewed_at:'2026-10-01T01:00:00Z'};
const second={id:'second',discord_user_id:user,attempt_number:2,created_at:'2026-10-02T00:00:00Z'};
const third={id:'third',discord_user_id:user,attempt_number:3,created_at:'2026-10-03T00:00:00Z'};
let reads=0;
for(const table of ['police_applications','police_transfer_applications']){
 const result=await attachRejectionHistory([second,third],table,async path=>{
  reads++;assert(path.startsWith(table+'?'));assert(path.includes('status=eq.rejected'));assert(path.includes('discord_user_id=in.('+user+')'));
  return {rows:[old,{...second,decision_reason:'Segundo motivo'},{...old,id:'unrelated',discord_user_id:other},{...old,id:'future',created_at:'2026-10-04T00:00:00Z'}]};
 });
 assert.equal(result[0].previous_rejections.length,1);assert.equal(result[1].previous_rejections.length,2);
 assert.equal(result[0].previous_rejections[0].decision_reason,old.decision_reason);
 assert.equal(result[0].previous_rejections[0].reviewed_by_name,old.reviewed_by_name);
}
assert.equal(reads,2);
await attachRejectionHistory([old],'police_applications',async()=>{throw Error('First attempts must not query history');});
const failed=await attachRejectionHistory([second],'police_applications',async()=>{throw Error('Unavailable');});
assert.equal(failed[0].rejection_history_unavailable,true);assert.equal(failed[0].previous_rejections,undefined);
console.log('Previous rejection reasons on attempts 2/3, both record types, user isolation, earlier attempts only and failure state: PASS');
