import assert from 'node:assert/strict';
import {applicationReview,saveApplicationReview} from '../supabase/functions/prime-police-panel/application-review.ts';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const appId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',reviewId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',actor='111111111111111111';
const rows=[];let inserts=0;
const db=async(path,init)=>{if(path.startsWith('police_applications'))return[{id:appId,status:'pending'}];if(init){assert.equal(path,'police_application_reviews');assert.equal(init.method,'POST');const row=JSON.parse(init.body);inserts++;rows.push(row);return[row];}return rows.filter(row=>path.includes('id=eq.'+row.id));};
const json=(body,status=200)=>Response.json(body,{status});
const body={id:appId,review_id:reviewId,verdict:'suspected_ai',note:'Revisar en entrevista IC',reviewed_by_discord_id:'spoof',reviewed_by_name:'spoof'};
const req=value=>new Request('https://test.local',{method:'POST',body:JSON.stringify(value)});
let r=await saveApplicationReview(req(body),db,json,actor,'UCOP de ejemplo');assert.equal(r.status,200);assert.equal(rows[0].reviewed_by_discord_id,actor);assert.equal(rows[0].reviewed_by_name,'UCOP de ejemplo');
r=await saveApplicationReview(req(body),db,json,actor,'UCOP de ejemplo');assert.equal(r.status,200);assert.equal(inserts,1);
r=await saveApplicationReview(req({...body,note:'Otra nota'}),db,json,actor,'UCOP');assert.equal(r.status,409);assert.equal(inserts,1);
r=await saveApplicationReview(req({...body,note:'x'}),db,json,actor,'UCOP');assert.equal(r.status,400);
// Exercise the real UI's load event against the real read handler. An omitted
// method defaults to POST in the client and must reproduce the original 405.
let reviewCall;
const element=()=>({style:{},append(){},replaceChildren(){},addEventListener(type,listener){this[type]=listener;}});
const context=vm.createContext({document:{createElement:element},request:async(action,options)=>{
 reviewCall={action,...options};
 const response=await applicationReview(new Request('https://test.local?id='+options.query.id,{method:options.method||'POST'}),async path=>path.startsWith('police_applications?select=id,')?[{id:appId,discord_user_id:actor,answers:{}}]:[],json);
 assert.equal(response.status,200,'Opening internal review must use GET');
 return response.json();
}});
vm.runInContext(readFileSync(new URL('../application-review-ui.js',import.meta.url),'utf8'),context);
const panel=context.applicationReviewPanel({id:appId});panel.open=true;panel.toggle();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(reviewCall.action,'application-review');assert.equal(reviewCall.method,'GET');assert.equal(reviewCall.query.id,appId);
assert.equal((await applicationReview(req({}),db,json)).status,405);
console.log('Manual review: trusted author, append-only writes, idempotent retry, conflict protection, validation and no application decision: PASS');
