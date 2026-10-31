import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {attachPersonnelMembership} from '../supabase/functions/prime-police-panel/personnel-membership.ts';
const registered='111111111111111111',newcomer='222222222222222222';
const rows=[{discord_user_id:registered},{discord_user_id:newcomer}];
const result=await attachPersonnelMembership(rows,async path=>{
 assert(path.includes('select=discord_user_id'));assert(!path.includes('status='),'Inactive files also prevent duplicate admission');
 assert(path.includes('in.('+registered+','+newcomer+')'));return {rows:[{discord_user_id:registered}]};
});
assert.equal(result[0].personnel_registered,true);assert.equal(result[1].personnel_registered,false);
const failed=await attachPersonnelMembership(rows,async()=>{throw Error('Unavailable');});
assert.equal(failed[0].personnel_membership_unavailable,true);assert.equal(failed[1].personnel_registered,undefined);
const element=tag=>({tag,children:[],append(child){this.children.push(child);},addEventListener(_,fn){this.click=fn;}});
let opened;
const context=vm.createContext({document:{createElement:element},openPreselectionAdmission:(...args)=>{opened=args;}});
const source=readFileSync(new URL('../preselection-ingress.js',import.meta.url),'utf8');
vm.runInContext(source.slice(source.indexOf('function appendAdmissionAction'),source.indexOf('async function openPreselectionAdmission')),context);
for(const source of ['preselection','transfer']){
 const existing=element('td');context.appendAdmissionAction(existing,result[0],source);assert.equal(existing.children[0].tag,'span');
 const fresh=element('td');context.appendAdmissionAction(fresh,result[1],source);assert.equal(fresh.children[0].tag,'button');fresh.children[0].click();assert.equal(opened[1],source);
 const unavailable=element('td');context.appendAdmissionAction(unavailable,failed[0],source);assert.equal(unavailable.children[0].tag,'span');
}
console.log('Admission buttons only for confirmed nonmembers, existing/inactive files, transfers, preselection and failed lookup: PASS');
