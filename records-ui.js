const recordPages={};let directoryExpires=0,directoryTask=null;
const recordConfig={
 applications:{container:'candidateList',search:'search',status:()=>activeStatus==='rejected-ai'?'rejected':activeStatus,render:()=>renderApplications(),assign:rows=>{applications=rows;},stats:['countPending','countAccepted','countRejected']},
 transfers:{container:'transferList',search:'transferSearch',status:()=>activeTransferStatus,render:()=>renderTransfers(),assign:rows=>{transfers=rows;},stats:['transferPendingCount','transferAcceptedCount','transferRejectedCount']},
 intakes:{container:'rankRequestList',search:'rankRequestSearch',status:()=>activeRankRequestStatus,render:()=>renderRankRequests(),assign:rows=>{rankRequests=rows;},stats:['rankRequestPendingCount','rankRequestAcceptedCount','rankRequestRejectedCount']},
 personnel:{container:'personnelRows',search:'personnelSearch',status:()=>$('personnelStatusFilter').value,render:()=>renderPersonnel(),assign:rows=>{rosterPage=rows;}},
 sanctions:{container:'sanctionRows',search:'sanctionSearch',status:()=>$('sanctionStatusFilter').value==='all'?'':$('sanctionStatusFilter').value,render:()=>renderSanctions(),assign:rows=>{sanctions=rows;}},
 preselections:{container:'preselectionRows',search:'preselectionSearch',status:()=> 'active',render:()=>renderPreselections(),assign:rows=>{preselections=rows;}},
};
function recordState(kind){return recordPages[kind]||(recordPages[kind]={offset:0,sequence:0,timer:null});}
function activeRecordPage(kind){recordState(kind).offset=0;return loadRecordPage(kind);}
function scheduleRecordSearch(kind){const state=recordState(kind);clearTimeout(state.timer);state.sequence++;state.timer=setTimeout(()=>activeRecordPage(kind),350);}
function recordNavigation(kind,result){
 const config=recordConfig[kind],state=recordState(kind),id='recordPager-'+kind;
 let pager=$(id);if(!pager){pager=document.createElement('div');pager.id=id;pager.className='toolbar record-pager';const list=$(config.container);(list.tagName==='TBODY'?list.closest('.table-wrap')||list.closest('table'):list).after(pager);}
 pager.replaceChildren();const label=document.createElement('span');label.className='muted';label.textContent=(result.total?'Registros '+(state.offset+1)+'–'+Math.min(state.offset+25,result.total):'Sin resultados')+' · Total: '+result.total;pager.append(label);
 for(const [label,offset,disabled]of [['Anterior',Math.max(0,state.offset-25),state.offset===0],['Siguiente',result.next_offset,result.next_offset===null]]){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=label;button.disabled=disabled;button.addEventListener('click',()=>{state.offset=offset;loadRecordPage(kind);});pager.append(button);}
}
async function loadRecordPage(kind){
 const config=recordConfig[kind],state=recordState(kind),sequence=++state.sequence,session=token;
 const pager=$('recordPager-'+kind);if(pager)pager.querySelectorAll('button').forEach(b=>{b.disabled=true;});
 $(config.container).setAttribute('aria-busy','true');
 try{
  if(kind==='personnel')await loadPersonnelDirectory();
  const result=await request('records',{method:'GET',query:{kind,offset:state.offset,limit:25,status:config.status(),search:$(config.search)?.value||'',counts:kind==='personnel'||kind==='sanctions'||config.stats?'true':'false',...(kind==='applications'&&activeStatus==='rejected-ai'?{review:'ai'}:{}),...(kind==='personnel'?{rank:$('personnelRankFilter').value}:{})}});
  if(sequence!==state.sequence||token!==session)return;
  config.assign(result.records||[]);const searchInput=$(config.search),searchValue=searchInput?.value;if(searchInput)searchInput.value='';try{config.render();}finally{if(searchInput)searchInput.value=searchValue;}
  if(config.stats)config.stats.forEach((id,i)=>{$(id).textContent=result.counts[['pending','accepted','rejected'][i]]||0;});
  if(kind==='personnel'){const c=result.counts;$('personnelTotalStat').textContent=(c.active||0)+(c.inactive||0);$('personnelActiveStat').textContent=c.active||0;$('personnelInactiveStat').textContent=c.inactive||0;$('personnelCount').textContent='· '+result.total+' agentes';}
  if(kind==='sanctions'){$('sanctionTotalCount').textContent=Object.values(result.counts).reduce((a,b)=>a+b,0);$('activeSanctionCount').textContent=result.counts.active||0;$('sanctionTypeCounts').textContent+=' (esta página)';}
  if(kind==='preselections')$('preselectionTotalStat').textContent=result.total;
  recordNavigation(kind,result);
 }catch(error){if(sequence===state.sequence&&token===session)showToast(error.message);}
 finally{if(sequence===state.sequence)$(config.container).removeAttribute('aria-busy');}
}
async function loadPersonnelDirectory(){
 if(directoryExpires>Date.now())return;
 if(directoryTask)return directoryTask;
 const session=token;
 directoryTask=(async()=>{const all=[];let offset=0;do{const result=await request('records',{method:'GET',query:{kind:'personnel',directory:'true',limit:100,offset}});all.push(...result.records);offset=result.next_offset;}while(offset!==null);if(token===session){personnel=all;directoryExpires=Date.now()+60000;}})();
 try{await directoryTask;}finally{directoryTask=null;}
}
async function loadPersonSanctions(userId){const records=[];let offset=0;do{const result=await request('records',{method:'GET',query:{kind:'sanctions',discord_user_id:userId,limit:100,offset}});records.push(...result.records);offset=result.next_offset;}while(offset!==null);return{records};}
loadApplications=()=>loadRecordPage('applications');loadTransfers=()=>loadRecordPage('transfers');
loadRankRequests=()=>loadRecordPage('intakes');loadPreselections=()=>loadRecordPage('preselections');loadSanctions=()=>loadRecordPage('sanctions');
loadPersonnel=async()=>{try{await loadPersonnelDirectory();if(!$('personnelView').classList.contains('hidden'))await loadRecordPage('personnel');else renderPersonnel();}catch(error){showToast(error.message);}};
const transferSearch=document.createElement('input');transferSearch.type='search';transferSearch.id='transferSearch';transferSearch.className='search';transferSearch.placeholder='Buscar nombre, usuario o procedencia…';transferSearch.setAttribute('aria-label','Buscar traslados');$('refreshTransfers').before(transferSearch);transferSearch.addEventListener('input',()=>scheduleRecordSearch('transfers'));
