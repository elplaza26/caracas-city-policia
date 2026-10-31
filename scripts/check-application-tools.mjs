import assert from 'node:assert/strict';
import {reviewApplicationAnswers,reviewSubmissionAnswers} from '../supabase/functions/prime-police-panel/application-review.ts';
import {validateDecisionCorrection} from '../supabase/functions/prime-police-panel/decision-correction.ts';
import {identityModal,questionsModal,handleApplicationSteps} from '../supabase/functions/prime-police-discord/application-steps.ts';
const paragraph='Pertenezco a la Policía para servir a la ciudadanía y respetar las normas durante cualquier procedimiento, coordinando el apoyo y la seguridad de mis compañeros. '; 
let r=reviewApplicationAnswers({discord_user_id:'1',answers:{motivation:paragraph}},[{discord_user_id:'2',answers:{motivation:paragraph}}]);
assert(r.flags.some(f=>f.title.includes('Coincidencia exacta')));assert(r.notice.includes('no determina'));
assert.equal(reviewApplicationAnswers({discord_user_id:'1',answers:{motivation:paragraph}},[{discord_user_id:'1',answers:{motivation:paragraph}}]).flags.length,0);
assert.equal(reviewApplicationAnswers({answers:{motivation:'Debemos fomentar el respeto y actuar profesionalmente.'}},[]).flags.length,0);
assert(reviewApplicationAnswers({answers:{motivation:'Como modelo de lenguaje no puedo participar en actividades policiales.'}},[]).flags.length);
const longText=paragraph.repeat(2)+'Cumpliría los procedimientos establecidos y pediría refuerzos antes de intervenir para proteger a las personas presentes.';
assert(reviewApplicationAnswers({discord_user_id:'1',answers:{motivation:longText}},[{discord_user_id:'2',answers:{motivation:longText.replace('personas presentes','personas cercanas')}}]).flags.some(f=>f.title.includes('muy similar')));
assert.equal(reviewApplicationAnswers({discord_user_id:'1',answers:{motivation:longText}},[{discord_user_id:'1',answers:{motivation:longText.replace('personas presentes','personas cercanas')}}]).flags.length,0);
assert.equal(reviewApplicationAnswers({answers:{motivation:longText}},[{discord_user_id:'2',answers:{motivation:'Otra respuesta completamente diferente sobre hechos ajenos a la pregunta. '.repeat(5)}}]).flags.length,0);
assert(reviewSubmissionAnswers('transfers',{id:'one',discord_user_id:'1',reason:'ChatGPT: quiero trasladarme para continuar mi carrera.'},[]).flags.some(f=>f.question==='Motivo del traslado'));
assert(reviewSubmissionAnswers('transfers',{id:'one',discord_user_id:'1',reason:longText},[{id:'two',discord_user_id:'2',reason:longText}]).flags.some(f=>f.title.includes('exacta')));
assert.equal(reviewSubmissionAnswers('transfers',{id:'one',discord_user_id:'1',reason:longText},[{id:'one',discord_user_id:'1',reason:longText}]).flags.length,0);
const record={status:'rejected',created_at:'2026-10-01T00:00:00Z',discord_user_id:'222222222222222222'};
assert(await validateDecisionCorrection({action:'accept'},record,'police_applications',async()=>[]));
assert.equal(await validateDecisionCorrection({action:'accept',correct_rejection:true,reason:'Error al revisar'},record,'police_applications',async path=>{assert(path.includes('status=in.(pending,accepted)'));return[];}),'');
assert(await validateDecisionCorrection({action:'accept',correct_rejection:true,reason:'Error'},record,'police_applications',async()=>[{id:'newer'}]));
const response=(type,data)=>Response.json({type,data}),input=(id)=>({custom_id:id});
const identity=await identityModal(input,response).json(),questions=await questionsModal('id',input,response).json();assert.equal(identity.data.components.length,3);assert.equal(questions.data.components.length,4);assert.deepEqual(identity.data.components.map(c=>c.component.custom_id),['character_name','age_ic','age_ooc']);
const jobs=[];globalThis.EdgeRuntime={waitUntil:promise=>jobs.push(promise)};
const owner='222222222222222222',guild_id='1539970134469378068';let draft,submitted=0,payload;
const c={input,response,ephemeral:text=>Response.json({type:4,text}),values:i=>i.answers,edit:async()=>{},db:async(path,init)=>{
 if(init?.method==='POST'){draft=JSON.parse(init.body);return[];}
 if(init?.method==='PATCH'){draft.consumed_at='now';return[];}
 return draft&&!draft.consumed_at&&path.includes('discord_user_id=eq.'+owner)?[draft]:[];
},process:async(i,user,name,a)=>{submitted++;payload=a;return{ok:true};}};
const first={type:5,guild_id,data:{custom_id:'prime_application_identity_submit'},answers:{character_name:'Pedro Martinez',age_ic:'25',age_ooc:'18'}};
assert.equal((await (await handleApplicationSteps(first,owner,'User',c)).json()).type,5);await Promise.all(jobs.splice(0));assert.equal(submitted,0);assert.equal(draft.payload.age_ic,25);
let result=await handleApplicationSteps({type:3,guild_id,data:{custom_id:'prime_application_continue:'+draft.id}},'333333333333333333','Other',c);assert.equal((await result.json()).type,4);
result=await handleApplicationSteps({type:3,guild_id,data:{custom_id:'prime_application_continue:'+draft.id}},owner,'User',c);assert.equal((await result.json()).type,9);
const final={type:5,guild_id,data:{custom_id:'prime_application_answers:'+draft.id},answers:{motivation:'Motivo',detention_rights:'Órdenes',scene_resolution:'Falta',roleplay_response:'Situación'}};
await handleApplicationSteps(final,owner,'User',c);await Promise.all(jobs.splice(0));assert.equal(submitted,1);assert.equal(payload.character_name,'Pedro Martinez');assert.equal(payload.age_ooc,18);
await handleApplicationSteps(final,owner,'User',c);await Promise.all(jobs.splice(0));assert.equal(submitted,1);
console.log('Internal review signals, correction safeguards, separate ages, private bound drafts and completed-submit retry: PASS');
