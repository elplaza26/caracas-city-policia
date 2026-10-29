function setMobileMenu(open){$('sideNav').classList.toggle('mobile-open',open);$('menuToggle').setAttribute('aria-expanded',String(open));}
$('menuToggle').addEventListener('click',()=>setMobileMenu(!$('sideNav').classList.contains('mobile-open')));
document.querySelectorAll('.workspace-tab').forEach(button=>button.addEventListener('click',()=>{setMobileMenu(false);document.querySelectorAll('.record-pager').forEach(p=>{const config=recordConfig[p.id.replace('recordPager-','')];p.hidden=config?$(config.container).closest('.hidden')!==null:false;});}));
$('toast').setAttribute('role','status');$('toast').setAttribute('aria-live','polite');
const originalToast=showToast;
showToast=message=>{originalToast(message);$('operationStatus').textContent=message;$('operationStatus').hidden=false;};
$('dismissOperationStatus').addEventListener('click',()=>{$('operationStatus').hidden=true;});
async function openSessionManager(){
 $('sessionDialog').showModal();$('sessionList').textContent='Cargando sesiones…';$('sessionFeedback').textContent='';
 try{const result=await request('sessions',{method:'GET'});$('sessionList').replaceChildren();for(const item of result.sessions){const row=document.createElement('div');row.className='activity-row';const copy=document.createElement('div');const title=document.createElement('strong');title.textContent=item.device_label+(item.current?' · Esta sesión':'');const info=document.createElement('small');info.textContent='Última actividad: '+niceDate(item.last_seen_at);copy.append(title,info);row.append(copy);$('sessionList').append(row);}}
 catch(error){$('sessionList').textContent=error.message;}
}
$('openSessionManager').addEventListener('click',openSessionManager);$('closeSessionManager').addEventListener('click',()=>$('sessionDialog').close());
$('logoutOtherSessions').addEventListener('click',async()=>{const button=$('logoutOtherSessions');button.disabled=true;try{const result=await request('logout-others',{method:'POST'});await openSessionManager();$('sessionFeedback').textContent=result.message;}catch(error){$('sessionFeedback').textContent=error.message;}finally{button.disabled=false;}});
function labelMobileTables(){document.querySelectorAll('.table-wrap table').forEach(table=>{table.classList.add('mobile-record-table');const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());table.querySelectorAll('tbody tr').forEach(row=>{[...row.children].forEach((cell,i)=>{if(cell.colSpan===1)cell.dataset.label=headers[i]||'';});});});}
const mobileTableObserver=new MutationObserver(()=>{clearTimeout(mobileTableObserver.timer);mobileTableObserver.timer=setTimeout(labelMobileTables,50);});mobileTableObserver.observe($('appView'),{childList:true,subtree:true});labelMobileTables();
window.addEventListener('panel-data-changed',()=>{directoryExpires=0;rankReadCache=null;});
window.addEventListener('panel-session-ended',()=>{
 for(const state of Object.values(recordPages))state.sequence++;
 dutyShifts=[];dutyPeople=[];rosterPage=null;directoryExpires=0;rankReadCache=null;
 document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());closePersonnelProfile();
 $('sideNav').classList.remove('mobile-open');$('openSessionManager').hidden=true;
});
const originalShowApp=showApp;showApp=()=>{originalShowApp();$('openSessionManager').hidden=false;};
if(token)$('openSessionManager').hidden=false;
let rankReadCache=null;
const rawRequest=request;
request=async(action,options={})=>{
 const method=options.method||(['rank-config'].includes(action)?'GET':'');
 if(action==='rank-config'&&method==='GET'&&rankReadCache?.token===token&&rankReadCache.expires>Date.now())return structuredClone(rankReadCache.value);
 const session=token;const result=await rawRequest(action,options);
 if(action==='rank-config'&&method==='GET'&&session===token)rankReadCache={token,value:structuredClone(result),expires:Date.now()+30000};
 if(options.method==='POST'&&!['login','logout','logout-others'].includes(action)&&!result.pending_approval)window.dispatchEvent(new Event('panel-data-changed'));
 return result;
};
