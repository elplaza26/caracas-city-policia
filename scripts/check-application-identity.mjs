import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';

const serverSource=fs.readFileSync('supabase/functions/_shared/application-identity.ts','utf8');
const browserSource=fs.readFileSync('app.js','utf8').split('const API_BASE =')[0];
const cases=[
 ['shakul bandido 29 edad oc 18',{}, {name:'shakul bandido',ageIc:29,ageOoc:18}],
 ['Nombre IC: Pedro Martínez | Edad IC: 29 | Edad OOC: 18',{}, {name:'Pedro Martínez',ageIc:29,ageOoc:18}],
 ['María de la Cruz 29 años IC y 18 años ooc',{}, {name:'María de la Cruz',ageIc:29,ageOoc:18}],
 ['Nombre IC: Álex Ruiz\nEdad IC: 25\nEdad OCC: 20',{}, {name:'Álex Ruiz',ageIc:25,ageOoc:20}],
 ['Ana López | 25 | 18',{}, {name:'Ana López',ageIc:25,ageOoc:18}],
 ['Ana López',{}, {name:'Ana López',ageIc:null,ageOoc:null}],
 ['2Pac Morales',{}, {name:'2Pac Morales',ageIc:null,ageOoc:null}],
 ['Ana López',{age_ic:30,age_ooc:19}, {name:'Ana López',ageIc:30,ageOoc:19}],
 ['Nombre antiguo',{character_info:'Nombre IC: Ana López | Edad IC: 24 | Edad OOC: 17'}, {name:'Ana López',ageIc:24,ageOoc:17}],
 ['Ana López',{age_ic:500,age_ooc:0}, {name:'Ana López',ageIc:null,ageOoc:null}],
];
for(const [label,source] of [['server',stripTypeScriptTypes(serverSource.replace('export ',''))],['browser',browserSource]]){
 const context=vm.createContext({});vm.runInContext(source,context);
 for(const [name,answers,expected] of cases) assert.deepEqual(JSON.parse(JSON.stringify(context.parseApplicationIdentity(name,answers))),expected,label+': '+name);
}
console.log('Application identities: browser/server parity, screenshot format, labeled ages, OOC typos, structured and missing ages: PASS');
