import assert from 'node:assert/strict';
import {listPagedRecords} from '../supabase/functions/prime-police-panel/paged-records.ts';
globalThis.Deno={env:{get:key=>key==='SUPABASE_URL'?'https://private.test':'server-only-test-key'}};
const originalFetch=globalThis.fetch;
let unavailable=false,reads=0;
globalThis.fetch=async(url,options)=>{
 assert.equal(options.method,undefined,'Analysis must never write decisions');reads++;
 const u=new URL(url),sample=u.searchParams.get('limit')==='200';
 if(sample&&unavailable)throw Error('Sample unavailable');
 const transfer=u.pathname.includes('transfer');
 const row={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',discord_user_id:'1',status:'pending',answers:{motivation:'ChatGPT: esta es mi respuesta.'},reason:'Como modelo de lenguaje no puedo trasladarme.'};
 assert.equal(options.headers.apikey,'server-only-test-key');
 return Response.json(sample?[row]:[row],{headers:{'content-range':'0-0/1'}});
};
try{
 for(const kind of ['applications','transfers']){
  const r=await listPagedRecords(new Request('https://panel.test?kind='+kind),Response.json);
  const data=await r.json();assert.equal(r.status,200);assert.equal(data.total,1);
  assert.equal(data.records[0].status,'pending');assert.equal(data.records[0].automatic_review.flags.length,1);
  assert(data.records[0].automatic_review.notice.includes('no determina'));
 }
 unavailable=true;
 const data=await(await listPagedRecords(new Request('https://panel.test?kind=transfers'),Response.json)).json();
 assert.equal(data.records.length,1);assert.equal(data.records[0].automatic_review.unavailable,true);
 assert.equal(reads,6);
 console.log('Automatic private application/transfer alerts, read-only analysis and graceful sample failure: PASS');
}finally{globalThis.fetch=originalFetch;}
