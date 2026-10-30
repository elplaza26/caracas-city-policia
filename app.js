function parseApplicationIdentity(fullName         , answers      = {}) {
 const raw=String(answers.character_info||answers.personal||fullName||'').trim();
 const age=(value         )=>/^\d{1,3}$/.test(String(value??'').trim())&&Number(value)>=1&&Number(value)<=120?Number(value):null;
 const ooc=raw.match(/\b(?:edad\s*)?(?:ooc|occ|oc)\s*[:=\-]?\s*(\d{1,3})\b/i)||raw.match(/\b(\d{1,3})\s*(?:años?\s*)?(?:ooc|occ|oc)\b/i);
 const ic=raw.match(/\bedad\s*(?:ic\s*)?[:=\-]?\s*(\d{1,3})\b/i)||raw.match(/\bic\s*[:=\-]\s*(\d{1,3})\b/i)||raw.match(/\b(\d{1,3})\s*(?:años?\s*)?ic\b/i);
 const paired=raw.match(/^(.+?)\s+(\d{1,3})\s*[:;\/]\s*.*?\b(\d{1,3})\s*$/);
 const hasPairedAges=Boolean(paired&&age(paired[2])!==null&&age(paired[3])!==null);
 let ageIc=age(answers.age_ic)??age(ic?.[1]),ageOoc=age(answers.age_ooc)??age(ooc?.[1]);
 if(hasPairedAges){ageIc??=age(paired?.[2]);ageOoc??=age(paired?.[3]);}
 const first=raw.split(/\r?\n|\|/)[0].replace(/^nombre\s*(?:ic)?\s*[:=\-]\s*/i,'').trim();
 const hasAgeHint=hasPairedAges||/\bedad\b|\baños?\b|\b(?:ooc|occ|oc)\b|\b\d{1,3}\s+ic\b/i.test(raw);
 const numbers=[...raw.matchAll(/\b(\d{1,3})\b/g)];
 if(ageIc===null&&numbers.length&&hasAgeHint){
  const candidate=numbers.find(match=>!ooc||match.index!==(ooc.index??0)+ooc[0].indexOf(ooc[1]));
  ageIc=age(candidate?.[1]);
 }
 const parts=raw.split(/\||\r?\n/).map(s=>s.trim());
 if(parts.length>=3&&age(parts[1])!==null&&age(parts[2])!==null){ageIc??=age(parts[1]);ageOoc??=age(parts[2]);}
 const boundary=hasAgeHint?first.search(/\b\d{1,3}\b|\bedad\b|\baños?\b|\b(?:ooc|occ|oc)\b/i):-1;
 const name=(boundary>=0?first.slice(0,boundary):first).replace(/[\s,;:\-]+$/,'').trim();
 return {name:name||String(fullName||'').split(/\r?\n|\|/)[0].trim(),ageIc,ageOoc};
}

const API_BASE = "https://ngkmylqsdeevdtrjrgfn.supabase.co/functions/v1/prime-police-panel";
const TOKEN_KEY = "primePolicePanelSession";
let activeStatus = "pending";
let activeRankRequestStatus = "pending";
let activeTransferStatus = "pending";
let token = sessionStorage.getItem(TOKEN_KEY) || "";
let applications = [];
let rankRequests = [];
let transfers = [];
let preselections = [];
let sanctions = [];
let personnel = [];
let rosterPage=null;
let editingPersonnelId = null;
let rankRoles = [];
let availableRoles = [];
let rankConfigError = "";
let toastTimer;
let canAuthorizePromotions=false;
let canManageShiftsDirect=false;

const $ = (id) => document.getElementById(id);
function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 4500);
}
function showLogin() {
  token = "";
  canAuthorizePromotions=false;canManageShiftsDirect=false;
  $("sideNav").classList.add("hidden");
  $("accountCard").classList.add("hidden");
  $("logoutButton").classList.add("hidden");
  sessionStorage.removeItem(TOKEN_KEY);
  $("loginView").classList.remove("hidden");
  $("appView").classList.add("hidden");
}
function openDashboardWhenReady(){const open=()=>{if(token&&typeof loadDashboard==='function')document.querySelector('button[data-view="dashboard"]').click();};if(typeof loadDashboard==='function')open();else document.addEventListener('DOMContentLoaded',open,{once:true});}
function showApp() {
  $("menuToggle").hidden=false;
  $("sideNav").classList.remove("hidden");
  $("accountCard").classList.remove("hidden");
  $("logoutButton").classList.remove("hidden");
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");

}
const inFlightReads=new Map();
async function request(action,options={}){
 const method=options.method||(['data','me','personnel','preselections','rank-config','rank-history','rank-requests','sanctions','transfers','shifts','rank-authorizations'].includes(action)?'GET':'POST');
 const sessionAtStart=token,key=JSON.stringify([action,options.query||{},sessionAtStart]);
 if(method==='GET'&&inFlightReads.has(key))return inFlightReads.get(key);
 const task=performApiRequest(action,options,method,sessionAtStart);if(method==='GET')inFlightReads.set(key,task);
 try{return await task;}finally{if(method==='GET')inFlightReads.delete(key);}
}
async function performApiRequest(action,options,method,sessionAtStart){
 const headers={'Content-Type':'application/json'};if(sessionAtStart&&action!=='login')headers.Authorization='Bearer '+sessionAtStart;
 for(let attempt=0;attempt<(method==='GET'?2:1);attempt++){
  let response;
  try{response=await fetch(API_BASE+'?panel='+encodeURIComponent(action)+(options.query?'&'+new URLSearchParams(options.query):''),{method,headers,body:options.body?JSON.stringify(options.body):undefined,cache:'no-store',signal:AbortSignal.timeout(method==='GET'?18000:45000)});}
  catch(error){if(method==='GET'&&attempt===0){await new Promise(r=>setTimeout(r,500));continue;}throw Error(method==='GET'?'La conexión tardó demasiado o se interrumpió. Tu sesión sigue abierta; prueba Actualizar.':'No se pudo confirmar el resultado de la operación. Actualiza el registro y los pendientes antes de repetirla.');}
  const result=await response.json().catch(()=>({})),reference=response.headers.get('X-Request-ID');
  if(!response.ok){
   if(method==='GET'&&attempt===0&&[429,502,503,504].includes(response.status)){await new Promise(r=>setTimeout(r,600));continue;}
   if(token===sessionAtStart&&action!=='login'&&(response.status===401||(response.status===403&&/sesión|permiso|autorizado/i.test(result.error||''))))showLogin();
   const message=result.error||([502,503,504].includes(response.status)?'El servicio no pudo confirmar el resultado. Actualiza el registro antes de repetir.':'No se pudo completar la petición (HTTP '+response.status+').');
   throw Error(message+(reference?' · Ref. '+reference.slice(0,8):''));
  }
  if(result.pending_approval)window.dispatchEvent(new Event('pending-change-created'));
  return result;
 }
}
async function loadAccountProfile() {
  const fallbackAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
  try {
    const result = await request("me", {method:"GET"});
    const user = result.user || {};
    canAuthorizePromotions=Boolean(user.can_authorize_promotions);
    canManageShiftsDirect=Boolean(user.can_manage_shifts_direct);
    $('managementPolicy').textContent=canAuthorizePromotions?'Directiva: puedes aplicar cambios y revisar las propuestas del panel principal.':canManageShiftsDirect?'UCOP: puedes cerrar y eliminar bitácoras directamente. Los demás cambios requieren aprobación de Directiva.':'Puedes preparar cualquier cambio. Quedará pendiente en el panel principal hasta que Directiva lo apruebe.';
    $("accountName").textContent = user.display_name || user.username || "Cuenta Discord";
    $("accountId").textContent = (user.username ? "@" + user.username + " · " : "") + "ID " + (user.id || "—");
    const accessRoles = Array.isArray(user.access_roles) ? user.access_roles : [];
    $("accountRoles").textContent = accessRoles.join(" · ") || "Gestión autorizada";
    $("accountRoles").title = accessRoles.join(" · ") || "Gestión autorizada";
    const avatar = $("accountAvatar");
    avatar.onerror = () => { avatar.onerror = null; avatar.src = fallbackAvatar; };
    avatar.src = user.avatar_url || fallbackAvatar;
  } catch {
    $("accountName").textContent = "Cuenta Discord";
    $("accountId").textContent = "Sesión de gestión activa";
    $("accountRoles").textContent = "Roles autorizados";
    $("accountAvatar").src = fallbackAvatar;
  }
}
function unitLabel(unit){return unit==="POLICIA"||!unit?"Sin rama · Policía":unit;}
function niceDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-ES", {dateStyle:"medium",timeStyle:"short"});
}

async function loadRankAuthorizations(){
 const box=$("rankAuthorizations");box.textContent="Cargando solicitudes de autorización…";
 try{
  const result=await request("rank-authorizations",{method:"GET"});canAuthorizePromotions=Boolean(result.can_authorize);box.replaceChildren();
  const rows=result.authorizations||[];rows.sort((a,b)=>Number(b.status==="pending")-Number(a.status==="pending"));
  if(!rows.length){box.textContent="No hay solicitudes de ascenso pendientes de Directiva.";return;}
  const labels={pending:"Pendiente de Directiva",processing:"En proceso",approved:"Autorizado y aplicado",rejected:"Rechazado",failed:"No aplicado; revisar motivo"};
  rows.forEach(item=>{
   const card=document.createElement("article"),title=document.createElement("h3"),info=document.createElement("p"),status=document.createElement("p");card.className="candidate";title.textContent=item.full_name+" → "+item.new_rank_name;info.className="muted";info.textContent="Propuesto por "+item.requested_by+" · "+niceDate(item.requested_at);status.textContent=labels[item.status]||item.status;
   card.append(title,info,status);
   if(item.reviewed_by){const review=document.createElement("p");review.className="muted";review.textContent="Revisado por "+item.reviewed_by+" · "+niceDate(item.reviewed_at)+(item.review_reason?" · "+item.review_reason:"");card.append(review);}
   if(item.status==="pending"&&canAuthorizePromotions){
    const actions=document.createElement("div");actions.className="candidate-actions";
    [["approve","Autorizar y aplicar","btn accept"],["reject","Rechazar","btn reject"]].forEach(([decision,label,cls])=>{
     const button=document.createElement("button");button.type="button";button.className=cls;button.textContent=label;
     button.addEventListener("click",async()=>{const reason=prompt(decision==="approve"?"Observación de Directiva (opcional)":"Motivo del rechazo");if(reason===null)return;if(!confirm(label+" para "+item.full_name+"?"))return;actions.querySelectorAll("button").forEach(b=>b.disabled=true);try{const r=await request("rank-authorization-review",{method:"POST",body:{id:item.id,decision,reason}});showToast((r.message||"Solicitud revisada.")+(r.warning||""));await Promise.all([loadRankAuthorizations(),loadPersonnel(),loadRankHistory()]);}catch(e){status.textContent=e.message;actions.querySelectorAll("button").forEach(b=>b.disabled=false);}});actions.append(button);
    });card.append(actions);
   }box.append(card);
  });
 }catch(e){box.textContent=e.message;}
}
function detail(label, value) {
  const box = document.createElement("div");
  box.className = "detail";
  const title = document.createElement("b");
  title.textContent = label;
  const content = document.createElement("span");
  content.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
  box.append(title, content);
  return box;
}
function badgeFor(app) {
  const badge = document.createElement("span");
  const retry = app.status === "accepted" && !app.role_assigned_at;
  badge.className = "badge " + (app.status === "pending" ? "pending" : app.status === "accepted" ? "accepted" : "rejected");
  badge.textContent = app.status === "pending" ? "Pendiente" : app.status === "accepted" ? (retry ? "Aceptada · Preselección pendiente" : "Aceptada · Preselección") : "Rechazada";
  return badge;
}
function decisionButton(label, action, className, app) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn " + className;
  button.textContent = label;
  button.addEventListener("click", () => decide(app, action, button));
  return button;
}
function renderApplications() {
  const list = $("candidateList");
  list.replaceChildren();
  const q = $("search").value.trim().toLocaleLowerCase("es");
  const visible = applications.filter(app => app.status === activeStatus && [
    app.full_name, app.discord_username, app.discord_user_id, JSON.stringify(app.answers || {})
  ].join(" ").toLocaleLowerCase("es").includes(q));
  $("listTitle").textContent = activeStatus === "pending" ? "Postulaciones pendientes" : activeStatus === "accepted" ? "Postulaciones aceptadas" : "Postulaciones rechazadas";
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.status === activeStatus));
  $("countPending").textContent = applications.filter(a => a.status === "pending").length;
  $("countAccepted").textContent = applications.filter(a => a.status === "accepted").length;
  $("countRejected").textContent = applications.filter(a => a.status === "rejected").length;
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = applications.some(a => a.status === activeStatus) ? "No hay resultados para esta búsqueda." : activeStatus === "pending" ? "No hay postulaciones pendientes." : activeStatus === "accepted" ? "Todavía no hay postulaciones aceptadas." : "Todavía no hay postulaciones rechazadas.";
    list.append(empty);
    return;
  }
  visible.forEach(app => {
    const card = document.createElement("article");
    card.className = "candidate";
    const head = document.createElement("div");
    head.className = "candidate-head";
    const identity = document.createElement("div");
    const name = document.createElement("h3");
    const candidateIdentity = parseApplicationIdentity(app.full_name, app.answers || {});
    name.textContent = candidateIdentity.name || "Candidato sin nombre";
    const discordName = document.createElement("div");
    discordName.className = "muted";
    discordName.textContent = (app.discord_username || "Usuario de Discord") + " · ID " + (app.discord_user_id || "—");
    identity.append(name, discordName);
    head.append(identity, badgeFor(app));
    const grid = document.createElement("div");
    grid.className = "details";
    const a = app.answers || {};
    const isRoleplayForm = Boolean(a.character_info);
    grid.append(
      detail("Fecha de solicitud", niceDate(app.created_at)),
      detail("Intento de postulación", String(app.attempt_number || 1) + " / 3"),
      detail("Nombre IC", candidateIdentity.name),
      detail("Edad IC", candidateIdentity.ageIc),
      detail("Edad OOC", candidateIdentity.ageOoc),
      detail(isRoleplayForm ? "Motivación y mejora personal" : "Experiencia previa y tiempo en RolePlay", a.motivation || a.experience_time || app.previous_experience),
      detail(isRoleplayForm ? "Responsabilidad y órdenes" : "Meta dentro de la Policía y preferencia PVP / RolePlay", a.detention_rights || a.control_scenario || a.goal_preference),
      detail(isRoleplayForm ? "Mala praxis o corrupción" : "Expectativas y motivo para unirse", a.scene_resolution || a.emergency_scenario || a.team_scenario || a.expectations_why || app.motivation),
      detail(isRoleplayForm ? "Situaciones policiales" : "Acepta las normativas de PRIME POLICE", a.roleplay_response || a.availability_rules || a.rules_accepted),
      detail("Motivo de decisión", app.decision_reason)
    );
    const actions = document.createElement("div");
    actions.className = "candidate-actions";
    const pending = app.status === "pending";
    const retryRole = app.status === "accepted" && !app.role_assigned_at;
    if (pending || retryRole) {
      actions.append(decisionButton(retryRole ? "Reintentar asignación de Preselección" : "Aceptar y asignar Preselección", "accept", "accept", app));
      if (pending) actions.append(decisionButton("Rechazar", "reject", "reject", app));
    } else {
      const done = document.createElement("span");
      done.className = "muted";
      done.textContent = app.status === "accepted" ? "Rol confirmado: " + niceDate(app.role_assigned_at) : "Revisada: " + niceDate(app.reviewed_at);
      actions.append(done);
    }
    const spacer = document.createElement("span");
    spacer.className = "spacer";
    const updated = document.createElement("span");
    updated.className = "muted";
    updated.textContent = app.reviewed_by_name ? "Revisado por " + app.reviewed_by_name : "";
    actions.append(spacer, updated);
    card.append(head, grid, actions);
    list.append(card);
  });
}
async function loadApplications() {
  $("refreshButton").disabled = true;
  $("refreshButton").textContent = "Actualizando…";
  try {
    const result = await request("data");
    applications = result.applications || [];
    $("appNotice").classList.add("hidden");
    renderApplications();
  } catch (error) {
    if (token) {
      $("appNotice").textContent = error.message;
      $("appNotice").classList.remove("hidden");
    } else {
      $("loginError").textContent = error.message;
    }
  } finally {
    $("refreshButton").disabled = false;
    $("refreshButton").textContent = "Actualizar";
  }
}
function renderTransfers() {
  const list = $("transferList");
  list.replaceChildren();
  const visible = transfers.filter(item => item.status === activeTransferStatus);
  $("transferListTitle").textContent = activeTransferStatus === "pending" ? "Traslados pendientes" : activeTransferStatus === "accepted" ? "Traslados aceptados" : "Traslados rechazados";
  $("transferPendingCount").textContent = transfers.filter(x => x.status === "pending").length;
  $("transferAcceptedCount").textContent = transfers.filter(x => x.status === "accepted").length;
  $("transferRejectedCount").textContent = transfers.filter(x => x.status === "rejected").length;
  document.querySelectorAll("[data-transfer-status]").forEach(b => b.classList.toggle("active", b.dataset.transferStatus === activeTransferStatus));
  if (!visible.length) { const empty=document.createElement("div");empty.className="empty";empty.textContent=transfers.some(x=>x.status===activeTransferStatus)?"No hay resultados.":activeTransferStatus==="pending"?"No hay traslados pendientes.":"Todavía no hay solicitudes en esta sección.";list.append(empty);return; }
  visible.forEach(item => {
    const card=document.createElement("article");card.className="candidate";
    const head=document.createElement("div");head.className="candidate-head";
    const identity=document.createElement("div"),name=document.createElement("h3"),discordName=document.createElement("div"),status=document.createElement("span");
    name.textContent=item.full_name||"Solicitud de traslado";discordName.className="muted";discordName.textContent=(item.discord_username||"Discord")+" · ID "+item.discord_user_id;identity.append(name,discordName);status.className="badge "+(item.status==="pending"?"pending":item.status==="accepted"?"accepted":"rejected");status.textContent=item.status==="pending"?"Pendiente":item.status==="accepted"?"Aceptada · Traslado":"Rechazada";head.append(identity,status);
    const grid=document.createElement("div");grid.className="details";
    grid.append(detail("Fecha de solicitud",niceDate(item.created_at)),detail("Intento",String(item.attempt_number||1)+" / 3"),detail("Edad IC",item.age_ic),detail("Edad OOC",item.age_ooc),detail("Ciudad de procedencia",item.source_city),detail("Facción policial",item.source_faction),detail("Rango actual",item.current_rank),detail("Unidad actual",item.current_unit),detail("Rango solicitado",item.requested_rank),detail("Motivo del traslado",item.reason),detail("Motivo de decisión",item.decision_reason));
    const actions=document.createElement("div");actions.className="candidate-actions";
    if(item.status==="pending"){
      const accept=document.createElement("button");accept.className="btn accept";accept.textContent="Aceptar y asignar rol Traslado";accept.onclick=()=>reviewTransfer(item,"accept",accept);
      const reject=document.createElement("button");reject.className="btn reject";reject.textContent="Rechazar";reject.onclick=()=>reviewTransfer(item,"reject",reject);actions.append(accept,reject);
    } else {const done=document.createElement("span");done.className="muted";done.textContent=(item.status==="accepted"?"Rol Traslado asignado · ":"Revisada · ")+niceDate(item.reviewed_at);actions.append(done);}
    const spacer=document.createElement("span");spacer.className="spacer";const reviewer=document.createElement("span");reviewer.className="muted";reviewer.textContent=item.reviewed_by_name?"Revisado por "+item.reviewed_by_name:"";actions.append(spacer,reviewer);card.append(head,grid,actions);list.append(card);
  });
}
async function loadTransfers(){
  const button=$("refreshTransfers");button.disabled=true;button.textContent="Actualizando…";
  try{const result=await request("transfers");transfers=result.transfers||[];renderTransfers();}
  catch(error){const list=$("transferList"),empty=document.createElement("div");empty.className="empty";empty.textContent=error.message;list.replaceChildren(empty);}
  finally{button.disabled=false;button.textContent="Actualizar";}
}
async function reviewTransfer(item,action,button){
  if(action==="accept"&&!confirm("¿Aceptar el traslado de "+item.full_name+" y asignarle el rol Traslado para coordinar una entrevista IC?"))return;
  if(action==="reject"&&!confirm("¿Rechazar la solicitud de traslado de "+item.full_name+"?"))return;
  const reason=action==="reject"?(prompt("Motivo de la decisión (opcional):","")||""):"";button.disabled=true;const old=button.textContent;button.textContent="Procesando…";
  try{const result=await request("transfer-decision",{method:"POST",body:{id:item.id,action,reason}});showToast(result.message||result.warning|| (action==="accept"?"Traslado aceptado y rol asignado.":"Traslado rechazado."));await loadTransfers();}
  catch(error){showToast(error.message);button.disabled=false;button.textContent=old;await loadTransfers();}
}
function renderPreselections() {
  const rows=$("preselectionRows"),query=$("preselectionSearch").value.trim().toLocaleLowerCase("es");
  const visible=preselections.filter(person=>[person.full_name,person.discord_username,person.discord_user_id].join(" ").toLocaleLowerCase("es").includes(query));
  $("preselectionTotalStat").textContent=String(preselections.length);
  $("preselectionCount").textContent="· "+visible.length+(visible.length===preselections.length?"":" de "+preselections.length)+" personas";
  rows.replaceChildren();
  if(!visible.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="muted";td.textContent=preselections.length?"No hay preseleccionados que coincidan con la búsqueda.":"No hay personas pendientes de pasar a Personal de Policía.";tr.append(td);rows.append(tr);return;}
  visible.forEach(person=>{const tr=document.createElement("tr");[person.full_name||"Sin nombre IC",(person.discord_username?"@"+person.discord_username+" · ":"")+person.discord_user_id,niceDate(person.accepted_at)].forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td);});const state=document.createElement("td"),badge=document.createElement("span");badge.className="badge pending";badge.textContent="Preseleccionado";state.append(badge);tr.append(state);const actions=document.createElement("td"),button=document.createElement("button");button.type="button";button.className="btn primary";button.textContent="Ingresar a la base";button.addEventListener("click",()=>openPreselectionAdmission(person));actions.append(button);tr.append(actions);rows.append(tr);});
}
async function loadPreselections(){
  const rows=$("preselectionRows");rows.innerHTML='<tr><td colspan="5" class="muted">Cargando preseleccionados…</td></tr>';
  try{const result=await request("preselections");preselections=result.preselections||[];renderPreselections();}
  catch(error){rows.replaceChildren();const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="muted";td.textContent=error.message;tr.append(td);rows.append(tr);}
}
function renderRankRequests() {
  const list=$("rankRequestList");list.replaceChildren();
  const query=$("rankRequestSearch").value.trim().toLocaleLowerCase("es");
  const visible=rankRequests.filter(item=>item.status===activeRankRequestStatus&&[item.character_name,item.steam_username,item.plate,item.requested_rank_name,item.approved_by_name,item.discord_username,item.discord_user_id].join(" ").toLocaleLowerCase("es").includes(query));
  $("rankRequestPendingCount").textContent=rankRequests.filter(x=>x.status==="pending").length;
  $("rankRequestAcceptedCount").textContent=rankRequests.filter(x=>x.status==="accepted").length;
  $("rankRequestRejectedCount").textContent=rankRequests.filter(x=>x.status==="rejected").length;
  $("rankRequestListTitle").textContent=activeRankRequestStatus==="pending"?"Solicitudes pendientes":activeRankRequestStatus==="accepted"?"Solicitudes aprobadas":"Solicitudes rechazadas";
  document.querySelectorAll("#rankRequestStatusTabs .tab").forEach(button=>button.classList.toggle("active",button.dataset.rankStatus===activeRankRequestStatus));
  if(!visible.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=rankRequests.some(x=>x.status===activeRankRequestStatus)?"No hay coincidencias para esa búsqueda.":activeRankRequestStatus==="pending"?"No hay solicitudes pendientes.":activeRankRequestStatus==="accepted"?"Todavía no hay solicitudes aprobadas.":"Todavía no hay solicitudes rechazadas.";list.append(empty);return;}
  visible.forEach(item=>{
    const card=document.createElement("article");card.className="candidate";
    const head=document.createElement("div");head.className="candidate-head";
    const identity=document.createElement("div"),title=document.createElement("h3"),sub=document.createElement("div");
    title.textContent=(item.character_name||"Agente")+" · Ingreso como Policía";
    sub.className="muted";sub.textContent=(item.discord_username||"Usuario de Discord")+" · Placa "+(item.plate||"—")+" · ID "+(item.discord_user_id||"—");
    identity.append(title,sub);
    const policeOnly=true;const badge=document.createElement("span");badge.className="badge "+(item.status==="pending"?"pending":item.status==="accepted"?"accepted":"rejected");badge.textContent=item.status==="pending"?"Pendiente":item.status==="accepted"?(policeOnly?"Aprobada · Rol Policía":"Aprobada · Policía y rango"):"Rechazada";
    head.append(identity,badge);
    const grid=document.createElement("div");grid.className="details";
    grid.append(detail("Usuario de Steam",item.steam_username||"No indicado"),detail("Aprobado por",item.approved_by_name),detail("Fecha de solicitud",niceDate(item.created_at)));
    if(item.reviewed_by_name)grid.append(detail("Revisado por UCOP",item.reviewed_by_name),detail("Fecha de revisión",niceDate(item.reviewed_at)));
    if(item.review_reason)grid.append(detail("Observación",item.review_reason));
    const actions=document.createElement("div");actions.className="candidate-actions";
    const edit=document.createElement("button");edit.type="button";edit.className="btn";edit.textContent="Editar datos";edit.addEventListener("click",()=>openIntakeEditor(item));actions.append(edit);
    if(item.status==="pending"){
      const accept=document.createElement("button");accept.type="button";accept.className="btn accept";accept.textContent=policeOnly?"Aprobar y asignar Policía":"Aprobar Policía + rango";accept.addEventListener("click",()=>reviewRankRequest(item,"accept",accept));
      const reject=document.createElement("button");reject.type="button";reject.className="btn reject";reject.textContent="Rechazar";reject.addEventListener("click",()=>reviewRankRequest(item,"reject",reject));actions.append(accept,reject);
    }else{
      const result=document.createElement("span");result.className="muted";result.textContent=item.status==="accepted"?(policeOnly?"Rol Policía aplicado; asigna rama y rango desde Personal.":"El rango solicitado fue aplicado en Discord y en la ficha UCOP."):"Solicitud revisada por UCOP.";actions.append(result);
    }
    if(item.status==="accepted"){
      const sync=document.createElement("button"),status=document.createElement("span");sync.type="button";sync.className="btn";sync.textContent="Sincronizar nombre y placa";status.className="muted";status.setAttribute("role","status");
      sync.addEventListener("click",async()=>{sync.disabled=true;status.textContent="Actualizando apodo en Discord…";try{const r=await request("nickname-sync",{method:"POST",body:{discord_user_id:item.discord_user_id}});status.textContent=r.message;}catch(e){status.textContent=e.message;}finally{sync.disabled=false;}});actions.append(sync,status);
    }
    card.append(head,grid,actions);list.append(card);
  });
}
async function loadRankRequests() {
  const list=$("rankRequestList");list.replaceChildren();const loading=document.createElement("div");loading.className="empty";loading.textContent="Cargando solicitudes de rango…";list.append(loading);
  try{const result=await request("rank-requests");rankRequests=result.requests||[];renderRankRequests();}
  catch(error){list.replaceChildren();const empty=document.createElement("div");empty.className="empty";empty.textContent=error.message;list.append(empty);}
}
async function reviewRankRequest(item,decision,button) {
  const policeOnly=true;const verb=decision==="accept"?(policeOnly?"aprobar y asignar solo el rol de Policía":"aprobar y asignar el rol de Policía y el rango"):"rechazar";
  if(!confirm("¿Confirmas "+verb+" a "+item.character_name+" ("+item.plate+")"+(policeOnly?" con solo el rol Policía":" con el rango "+item.requested_rank_name)+"? UCOP debe comprobar la entrevista IC y el nombre indicado en «Aprobado por»."))return;
  const reason=decision==="reject"?(prompt("Observación del rechazo (opcional):","")||""):"";
  button.disabled=true;button.textContent="Procesando…";
  try{const result=await request("rank-request-review",{method:"POST",body:{id:item.id,decision,reason}});showToast((result.message||"Solicitud revisada.")+(result.warning||""));await Promise.all([loadRankRequests(),loadPersonnel(),loadPreselections()]);}
  catch(error){showToast(error.message);button.disabled=false;button.textContent=decision==="accept"?(policeOnly?"Aprobar y asignar Policía":"Aprobar Policía + rango"):"Rechazar";}
}
async function decide(app, action, button) {
  if (action === "accept" && !confirm("¿Aceptar a " + app.full_name + " y asignarle el rol Preselección en Discord? El rol de Policía se asignará después de la entrevista, al aprobar su solicitud de rango.")) return;
  let reason = "";
  if (action === "reject") {
    if (!confirm("¿Rechazar la candidatura de " + app.full_name + "?")) return;
    reason = prompt("Motivo del rechazo (opcional):", "") || "";
  }
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = "Procesando…";
  try {
    const result = await request("decision", {method:"POST",body:{id:app.id,action,reason}});
    if (result.pending_approval) showToast(result.message);
    else if (result.warning) showToast(result.warning);
    else showToast(action === "accept" ? "Candidatura aceptada y rol Preselección asignado." : "Candidatura rechazada y reflejada en Discord.");
    await loadApplications();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
    button.textContent = previous;
    await loadApplications();
  }
}
async function loadSanctions() {
  const rows = $("sanctionRows");
  rows.replaceChildren();
  try {
    const result = await request("sanctions");
    sanctions = result.sanctions || [];
    renderSanctions();
  } catch(error) { const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=9;cell.className="muted";cell.textContent=error.message;row.append(cell);rows.append(row); }
}
function renderSanctions(){
  const rows=$("sanctionRows"),query=$("sanctionSearch").value.trim().toLocaleLowerCase("es"),filter=$("sanctionStatusFilter").value;
  const active=sanctions.filter(x=>x.status==="active"&&x.active).length,warns=sanctions.filter(x=>x.action_type==="warning"&&x.status==="active").length,strikes=sanctions.filter(x=>x.action_type==="strike"&&x.status==="active").length;
  $("sanctionTotalCount").textContent=String(sanctions.length);$("activeSanctionCount").textContent=String(active);$("sanctionTypeCounts").textContent=warns+" · "+strikes;
  const visible=sanctions.filter(item=>(filter==="all"||item.status===filter)&&[item.plate,item.target_name,item.discord_username,item.discord_user_id,item.reason,item.issuer_name,item.action_type].join(" ").toLocaleLowerCase("es").includes(query));
  $("sanctionTableCount").textContent="· "+visible.length+(visible.length===sanctions.length?"":" de "+sanctions.length);
  rows.replaceChildren();
  if(!visible.length){const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=9;cell.className="muted";cell.textContent=sanctions.length?"No hay sanciones que coincidan con el filtro.":"Todavía no hay sanciones registradas.";rows.append(row);row.append(cell);return;}
  visible.forEach(item=>{
    const row=document.createElement("tr"),plate=document.createElement("td"),name=document.createElement("td"),type=document.createElement("td"),reason=document.createElement("td"),date=document.createElement("td"),issuer=document.createElement("td"),evidence=document.createElement("td"),state=document.createElement("td"),actions=document.createElement("td");
    plate.textContent=item.plate?"#"+item.plate:"—";
    const personName=document.createElement("strong"),personId=document.createElement("small");personName.textContent=item.target_name||item.discord_username||"Agente";personId.textContent="ID "+(item.discord_user_id||"—");name.className="sanction-person";name.append(personName,personId);
    const typeBadge=document.createElement("span");typeBadge.className="sanction-type "+(item.action_type==="warning"?"warning":"strike");typeBadge.textContent=(item.action_type==="warning"?"Warn ":"Strike ")+(item.level||"");type.append(typeBadge);
    reason.className="sanction-reason";reason.title=item.reason||"";reason.textContent=item.reason||"—";date.textContent=niceDate(item.created_at);issuer.textContent=(item.issuer_name||"—").replace(/^<@!?([0-9]+)>$/,"$1");
    if(item.evidence_url){const link=document.createElement("a");link.className="evidence-link";link.href=item.evidence_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Ver prueba ↗";evidence.append(link);}else evidence.textContent="Sin evidencia";
    state.className="sanction-state "+(item.status||"pending");state.textContent=item.status==="active"?"Activa":item.status==="failed"?"Fallida":"Pendiente";
    const remove=document.createElement("button");remove.type="button";remove.className="btn reject";remove.textContent="Eliminar";remove.addEventListener("click",()=>deleteSanctionRecord(item,remove));actions.className="sanction-actions";actions.append(remove);
    [plate,name,type,reason,date,issuer,evidence,state,actions].forEach(cell=>row.append(cell));rows.append(row);
  });
}
async function deleteSanctionRecord(item,button){const label=(item.action_type==="warning"?"Warn ":"Strike ")+(item.level||"");if(!confirm("¿Eliminar definitivamente "+label+" de "+(item.target_name||item.discord_username||item.discord_user_id)+"?\n\nSe actualizarán los roles Warn/Strike en Discord. Si es un Strike 3, también se retirará Expulsado y se restaurará Policía."))return;button.disabled=true;button.textContent="Eliminando…";try{const result=await request("sanction-delete",{method:"POST",body:{id:item.id}});showToast(result.message||"Sanción eliminada.");await loadSanctions();}catch(error){showToast(error.message);button.disabled=false;button.textContent="Eliminar";}}
function renderPersonnel(){
  const rows=$("personnelRows"),query=$("personnelSearch").value.trim().toLocaleLowerCase("es"),rankFilter=$("personnelRankFilter").value,statusFilter=$("personnelStatusFilter").value;rows.replaceChildren();
  const visible=(rosterPage||personnel).filter(p=>[p.plate,p.full_name,p.name_ooc,p.discord_username,p.discord_user_id,p.rank_name].join(" ").toLocaleLowerCase("es").includes(query)&&(!rankFilter||p.rank_name===rankFilter)&&(!statusFilter||p.status===statusFilter));
  $("personnelTotalStat").textContent=String(personnel.length);$("personnelActiveStat").textContent=String(personnel.filter(p=>p.status==="active").length);$("personnelInactiveStat").textContent=String(personnel.filter(p=>p.status!=="active").length);
  $("personnelCount").textContent="· "+visible.length+(visible.length===personnel.length?"":" de "+personnel.length)+" agentes";
  const rankSelect=$("personnelRankFilter"),rankValue=rankSelect.value,rankNames=[...new Set(personnel.map(p=>p.rank_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));rankSelect.replaceChildren(new Option("Todos los rangos",""));rankNames.forEach(name=>rankSelect.add(new Option(name,name)));if(rankNames.includes(rankValue))rankSelect.value=rankValue;
  if(!visible.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=9;td.className="muted";td.textContent=personnel.length?"No hay personal que coincida con los filtros.":"No hay personal UCOP registrado.";tr.append(td);rows.append(tr);}
  visible.forEach(p=>{const tr=document.createElement("tr");tr.dataset.personId=p.discord_user_id;const values=[p.plate||"—",p.full_name||"—",p.name_ooc||p.discord_username||"—",p.discord_username?"@"+p.discord_username+" · "+p.discord_user_id:p.discord_user_id,p.rank_name||"Sin rango",unitLabel(p.unit),p.status==="active"?"Activo":"Inactivo",niceDate(p.last_rank_change_at||p.updated_at)];values.forEach((v,i)=>{const td=document.createElement("td");if(i===5){const chip=document.createElement("span");chip.className="unit-chip";chip.textContent=v;td.append(chip);}else if(i===6){const chip=document.createElement("span");chip.className="personnel-status "+(p.status==="active"?"is-active":"is-inactive");chip.textContent=v;td.append(chip);}else td.textContent=v;tr.append(td);});const actionCell=document.createElement("td"),actions=document.createElement("div"),editButton=document.createElement("button"),profileButton=document.createElement("button"),deleteButton=document.createElement("button");actions.className="personnel-actions";editButton.type="button";editButton.className="btn";editButton.textContent="Editar";editButton.addEventListener("click",()=>openPersonnelForm(p));profileButton.type="button";profileButton.className="btn ghost";profileButton.textContent="Ver ficha";profileButton.addEventListener("click",()=>openPersonnelProfile(p));deleteButton.type="button";deleteButton.className="btn reject";deleteButton.textContent="Eliminar";deleteButton.addEventListener("click",()=>deletePersonnelRecord(p));actions.append(editButton,profileButton,deleteButton);actionCell.append(actions);tr.append(actionCell);rows.append(tr);});
  const select=$("rankMember"),current=select.value;select.replaceChildren(new Option("Selecciona un oficial",""));personnel.forEach(p=>select.add(new Option((p.plate?"Placa "+p.plate+" · ":"")+(p.full_name||p.discord_username||"Agente")+" · "+(p.rank_name||"Sin rango"),p.discord_user_id)));if(personnel.some(p=>p.discord_user_id===current))select.value=current;renderSanctionPersonnelSelector();renderEligiblePromotions();
}
function openPersonnelForm(person=null){$("personnelFeedback").classList.add("hidden");editingPersonnelId=person?String(person.discord_user_id):null;const form=$("personnelForm");form.reset();$("personUnit").value=person?.unit||"POLICIA";if(person){$("personPlate").value=person.plate||"";$("personName").value=person.full_name||"";$("personOoc").value=person.name_ooc||person.discord_username||"";$("personDiscordId").value=person.discord_user_id||"";if(person.rank_role_id&&!Array.from($("personRank").options).some(o=>o.value===person.rank_role_id))$("personRank").add(new Option(person.rank_name||"Rango actual",person.rank_role_id));$("personRank").value=person.rank_role_id||"";$("personDiscordId").readOnly=true;}else{$("personDiscordId").readOnly=false;}$("personFormTitle").textContent=person?"Editar ficha de agente":"Registrar agente";$("personnelButton").textContent=person?"Guardar cambios":"Registrar agente";$("personRegisterPanel").classList.remove("hidden");$("personRegisterPanel").scrollIntoView({behavior:"smooth",block:"start"});}
function closePersonnelForm(){editingPersonnelId=null;$("personnelForm").reset();$("personDiscordId").readOnly=false;$("personFormTitle").textContent="Registrar agente";$("personnelButton").textContent="Registrar agente";$("personRegisterPanel").classList.add("hidden");}
function renderSanctionPersonnelSelector(){const select=$("sanctionDiscordId");if(!select)return;const current=select.value;select.replaceChildren(new Option("Selecciona un agente UCOP activo",""));personnel.filter(p=>p.status==="active").forEach(p=>select.add(new Option((p.full_name||p.discord_username||"Agente")+" · Placa "+(p.plate||"—")+" · "+(p.discord_username?"@"+p.discord_username:p.discord_user_id),p.discord_user_id)));if(personnel.some(p=>p.status==="active"&&p.discord_user_id===current))select.value=current;}
async function openPersonnelProfile(person){
  const modal=$("personnelProfileModal");modal.classList.remove("hidden");document.body.style.overflow="hidden";
  $("profileAvatar").textContent=(person.full_name||"UC").split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();$("profileName").textContent=person.full_name||"Agente UCOP";$("profileDiscord").textContent=(person.discord_username?"@"+person.discord_username+" · ":"")+"ID "+(person.discord_user_id||"—");$("profileIc").textContent=person.full_name||"—";$("profileOoc").textContent=person.name_ooc||person.discord_username||"—";$("profilePlate").textContent=person.plate||"—";$("profileRank").textContent=person.rank_name||"Sin rango";$("profileUnit").textContent=unitLabel(person.unit);$("profileStatus").textContent=person.status==="active"?"Activo":"Inactivo";$("profileUpdated").textContent=niceDate(person.updated_at||person.created_at);$("profileWarnings").textContent="0";$("profileStrikes").textContent="0";$("profileSanctions").innerHTML='<div class="profile-empty">Cargando expediente…</div>';
  try{const r=await loadPersonSanctions(person.discord_user_id),items=(r.records||[]).filter(s=>String(s.discord_user_id)===String(person.discord_user_id));const warnings=items.filter(s=>s.action_type==="warning"&&s.active).length,strikes=items.filter(s=>s.action_type==="strike"&&s.active).length;$("profileWarnings").textContent=String(warnings);$("profileStrikes").textContent=String(strikes);const list=$("profileSanctions");list.replaceChildren();if(!items.length){const empty=document.createElement("div");empty.className="profile-empty";empty.textContent="Este agente no tiene sanciones registradas.";list.append(empty);}else items.forEach(s=>{const row=document.createElement("div"),badge=document.createElement("span"),copy=document.createElement("div"),reason=document.createElement("p"),date=document.createElement("time");row.className="profile-sanction";badge.className="badge "+(s.action_type==="warning"?"pending":"rejected");badge.textContent=(s.action_type==="warning"?"Warn":"Strike")+" "+(s.level||"");copy.append(document.createTextNode(s.status==="active"?"Activa":"Registro "+(s.status||"")));reason.textContent=s.reason||"Sin motivo detallado";copy.append(reason);date.textContent=niceDate(s.created_at);row.append(badge,copy,date);list.append(row);});}catch(error){$("profileSanctions").textContent="No se pudo cargar el expediente disciplinario.";}
}
function closePersonnelProfile(){$("personnelProfileModal").classList.add("hidden");document.body.style.overflow="";}
$("profileClose").addEventListener("click",closePersonnelProfile);$("personnelProfileModal").addEventListener("click",event=>{if(event.target.id==="personnelProfileModal")closePersonnelProfile();});document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("personnelProfileModal").classList.contains("hidden"))closePersonnelProfile();});
async function deletePersonnelRecord(person){const id=String(person.discord_user_id||"");const name=person.full_name||person.discord_username||id;if(!confirm("¿Eliminar a "+name+" del registro de personal UCOP?\n\nSe borrará su ficha de personal. Se conservarán sus postulaciones y el historial administrativo. Esta acción no quita roles de Discord."))return;try{const result=await request("personnel-delete",{method:"POST",body:{discord_user_id:id}});showToast(result.message||"Agente eliminado del registro.");await loadPersonnel();}catch(error){showToast(error.message);}}
async function loadPersonnel(){const rows=$("personnelRows");rows.innerHTML='<tr><td colspan="9" class="muted">Cargando personal UCOP…</td></tr>';try{const r=await request("personnel");personnel=(r.personnel||[]).filter(p=>!p.unit||["POLICIA","UCOP","CIC"].includes(p.unit));renderPersonnel();}catch(e){rows.replaceChildren();const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=9;td.className="muted";td.textContent=e.message;tr.append(td);rows.append(tr);}}
function rankToday(){const d=new Date(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return d.getFullYear()+"-"+m+"-"+day;}
function renderRankTargetOptions(){
  const target=$("rankTarget"),selectedId=$("rankMember").value,person=personnel.find(p=>p.discord_user_id===selectedId),action=$("rankAction").value;
  const current=person&&(rankRoles.find(r=>r.role_id===person.rank_role_id)||rankRoles.find(r=>r.role_name===person.rank_name));
  const eligible=rankRoles.filter(r=>current?action==="promotion"&&Number(r.rank_order)>Number(current.rank_order)||action==="demotion"&&Number(r.rank_order)<Number(current.rank_order):action==="assignment");
  const old=target.value;target.replaceChildren(new Option(person?eligible.length?"Selecciona rango de destino":"No hay rangos válidos para este movimiento":"Busca y selecciona un oficial", ""));
  eligible.forEach(r=>target.add(new Option(r.role_name,r.role_id)));
  if(eligible.some(r=>r.role_id===old))target.value=old;
}
function renderRankRoles(){
  const list=$("rankList");list.replaceChildren();
  if(!rankRoles.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=rankConfigError?"No se pudieron cargar los rangos: "+rankConfigError:"Sin roles configurados. Usa «Actualizar rangos desde Discord» o «Sincronizar roles ahora».";list.append(empty);}
  rankRoles.forEach((rank,index)=>{
    const entry=document.createElement("div");entry.className="rank-entry";
    const label=document.createElement("strong");label.textContent=(index+1)+". "+rank.role_name;
    const dayWrap=document.createElement("label");dayWrap.className="rank-days-control";dayWrap.textContent="Días mínimos";
    const days=document.createElement("input");days.type="number";days.min="0";days.max="3650";days.step="1";days.value=String(Number(rank.minimum_days)||0);days.setAttribute("aria-label","Días mínimos en "+rank.role_name);
    days.addEventListener("input",()=>{rank.minimum_days=Math.max(0,Math.min(3650,Number.parseInt(days.value,10)||0));renderEligiblePromotions();});dayWrap.append(days);
    const controls=document.createElement("span");
    [["↑",index-1,"Subir"],["↓",index+1,"Bajar"],["Quitar",-1,"Quitar"]].forEach(([text,destination,title])=>{const button=document.createElement("button");button.type="button";button.className="btn ghost";button.textContent=text;button.title=title;button.disabled=title==="Subir"?index===0:title==="Bajar"?index===rankRoles.length-1:false;button.addEventListener("click",()=>{if(title==="Quitar")rankRoles.splice(index,1);else[rankRoles[index],rankRoles[destination]]=[rankRoles[destination],rankRoles[index]];renderRankRoles();});controls.append(button);});
    entry.append(label,dayWrap,controls);list.append(entry);
  });
  renderRankTargetOptions();renderEligiblePromotions();
  const personRank=$("personRank"),rankValue=personRank.value;personRank.replaceChildren(new Option(rankRoles.length?"Selecciona un rango":rankConfigError?"Error al cargar rangos":"No hay rangos sincronizados",""));rankRoles.forEach(r=>personRank.add(new Option(r.role_name,r.role_id)));if(rankRoles.some(r=>r.role_id===rankValue))personRank.value=rankValue;
}
function renderEligiblePromotions(){
  const list=$("rankEligibleList"),count=$("rankEligibleCount");if(!list||!count)return;list.replaceChildren();
  const ranked=personnel.filter(p=>p.status==="active").map(person=>{
    const index=rankRoles.findIndex(r=>r.role_id===person.rank_role_id);if(index<0||index>=rankRoles.length-1)return null;
    const current=rankRoles[index],next=rankRoles[index+1],start=Date.parse(person.last_rank_change_at||person.created_at||"");
    const days=Number.isFinite(start)?Math.max(0,Math.floor((Date.now()-start)/86400000)):0,required=Math.max(0,Number(current.minimum_days)||0);
    return {person,current,next,days,required,remaining:Math.max(0,required-days)};
  }).filter(Boolean).sort((a,b)=>a.remaining-b.remaining||String(a.person.plate).localeCompare(String(b.person.plate),"es"));
  const eligible=ranked.filter(x=>x.remaining===0);count.textContent=eligible.length+" elegibles · "+ranked.length+" con siguiente rango configurado";
  if(!ranked.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="Asigna rangos configurados al personal activo para calcular su elegibilidad.";list.append(empty);return;}
  ranked.forEach(item=>{const card=document.createElement("article");card.className="candidate";const head=document.createElement("div");head.className="candidate-head";const identity=document.createElement("div"),name=document.createElement("h3"),meta=document.createElement("div");name.textContent=(item.person.full_name||item.person.discord_username||"Agente")+" · Placa "+(item.person.plate||"—");meta.className="muted";meta.textContent=item.current.role_name+" → "+item.next.role_name;identity.append(name,meta);const badge=document.createElement("span");badge.className="badge "+(item.remaining?"pending":"accepted");badge.textContent=item.remaining?"Faltan "+item.remaining+" días":"Elegible";head.append(identity,badge);card.append(head);
    if(item.remaining===0){const button=document.createElement("button");button.type="button";button.className="btn accept";button.textContent="Preparar ascenso manual";button.addEventListener("click",()=>{selectRankPerson(item.person);$("rankAction").value="promotion";renderRankTargetOptions();$("rankTarget").value=item.next.role_id;$("rankEffectiveDate").value=rankToday();$("rankChangeForm").scrollIntoView({behavior:"smooth",block:"center"});});card.append(button);}list.append(card);});
}
function selectRankPerson(person){$("rankMember").value=person.discord_user_id;$("rankPlateSearch").value=person.plate||"";$("rankSelectedOfficer").textContent=(person.full_name||person.discord_username||"Oficial")+" · Placa "+(person.plate||"—")+" · "+(person.rank_name||"Sin rango");renderRankTargetOptions();}
async function loadRankConfig(){const status=$("personRankStatus");if(status)status.textContent="Consultando Discord y la base de datos…";try{const result=await request("rank-config");rankRoles=result.ranks||[];availableRoles=result.available_roles||[];const missingRoles=availableRoles.filter(role=>!rankRoles.some(rank=>rank.role_id===role.id));if(missingRoles.length){const sync=await request("rank-config-import-all",{method:"POST",body:{}});rankRoles=sync.ranks||rankRoles;if(Number(sync.imported_count)>0)showToast("Se sincronizaron "+sync.imported_count+" roles nuevos de Discord.");}rankConfigError="";availableRoles=availableRoles.filter(role=>!rankRoles.some(rank=>rank.role_id===role.id));const select=$("availableRankRoles");if(select){const old=select.value;select.replaceChildren(new Option("Selecciona un rol",""));availableRoles.forEach(role=>select.add(new Option(role.name+" · "+role.id,role.id)));if(availableRoles.some(role=>role.id===old))select.value=old;}renderRankRoles();if(status)status.textContent=rankRoles.length?rankRoles.length+" rangos listos.":"Discord respondió, pero no hay rangos configurados. Pulsa actualizar para reintentar la sincronización.";}catch(error){rankConfigError=error.message||"Error desconocido";if(status)status.textContent="No se cargaron los rangos: "+rankConfigError;renderRankRoles();showToast("No se cargaron los rangos: "+rankConfigError);}}
async function loadRankHistory(){const rows=$("rankHistoryRows");rows.innerHTML='<tr><td colspan="6" class="muted">Cargando historial…</td></tr>';try{const r=await request("rank-history");rows.replaceChildren();if(!(r.history||[]).length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.className="muted";td.textContent="Aún no hay movimientos registrados.";tr.append(td);rows.append(tr);return;}r.history.forEach(x=>{const tr=document.createElement("tr"),v=[x.full_name||x.discord_username||x.discord_user_id,x.action_type==="promotion"?"Ascenso":x.action_type==="demotion"?"Descenso":"Asignación",(x.previous_rank_name||"Sin rango")+" → "+x.new_rank_name,x.reason,x.changed_by_name,niceDate(x.created_at)];v.forEach(y=>{const td=document.createElement("td");td.textContent=y||"—";tr.append(td);});rows.append(tr);});}catch(e){rows.replaceChildren();const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.className="muted";td.textContent=e.message;tr.append(td);rows.append(tr);}}
function showPersonnelFeedback(message,type='info'){
 const box=$('personnelFeedback');box.textContent=message;box.classList.remove('hidden');box.classList.toggle('admin-error',type==='error');box.setAttribute('role',type==='error'?'alert':'status');box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('personnelForm').addEventListener('invalid',event=>{const field=event.target,label=field.labels?.[0]?.textContent||'el campo obligatorio';showPersonnelFeedback(field.id==='personDiscordId'&&field.value?'El ID de Discord debe contener entre 17 y 20 cifras. Copia el ID del usuario, no su nombre.':'Completa '+label+' antes de guardar.','error');},true);
$('personnelForm').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('personnelButton'),wasEditing=Boolean(editingPersonnelId);
 const body={discord_user_id:$('personDiscordId').value.trim(),full_name:$('personName').value.trim(),name_ooc:$('personOoc').value.trim(),plate:$('personPlate').value.trim(),unit:$('personUnit').value,rank_role_id:$('personRank').value,record_action:wasEditing?'update':'create'};
 if(!body.full_name||!body.name_ooc||!body.plate||!body.rank_role_id){showPersonnelFeedback('Completa nombre IC, nombre OOC, placa y rango.','error');return;}
 if(!/^\d{17,20}$/.test(body.discord_user_id)){showPersonnelFeedback('Copia el ID numérico del usuario de Discord (17 a 20 cifras).','error');return;}
 button.disabled=true;button.textContent=wasEditing?'Guardando…':'Registrando…';showPersonnelFeedback('Procesando la ficha de '+body.full_name+'…');
 try{
  const registration=await request('personnel-register',{method:'POST',body});
  const pending=registration.pending_approval||registration.pending_authorization;
  if(!registration.ok||(!pending&&String(registration.personnel?.discord_user_id||'')!==body.discord_user_id))throw Error('El servidor no devolvió la ficha guardada. Actualiza Personal para comprobar el resultado antes de repetir.');
  const message=pending?'Propuesta de '+body.full_name+' enviada a Directiva. '+(wasEditing?'La ficha actual se mantiene hasta la aprobación.':'El agente no se añadirá hasta la aprobación.')+' Revisa Panel principal → Pendientes.':(wasEditing?'Ficha actualizada':'Agente registrado')+': '+body.full_name+' · Placa '+body.plate+' · '+unitLabel(body.unit)+'.';
  closePersonnelForm();showPersonnelFeedback(message+(registration.warning?' '+registration.warning:''));showToast(message);
  if(registration.pending_authorization)loadRankAuthorizations();await loadPersonnel();
 }catch(error){showPersonnelFeedback(error.message,'error');showToast(error.message);}
 finally{button.disabled=false;button.textContent=editingPersonnelId?'Guardar cambios':'Registrar agente';}
});
$("newPersonnelButton").addEventListener("click",()=>openPersonnelForm());$("cancelPersonnelForm").addEventListener("click",closePersonnelForm);$("refreshPersonnel").addEventListener("click",loadPersonnel);$("personnelSearch").addEventListener("input",()=>scheduleRecordSearch("personnel"));$("personnelRankFilter").addEventListener("change",()=>activeRecordPage("personnel"));$("personnelStatusFilter").addEventListener("change",()=>activeRecordPage("personnel"));$("addRankButton").addEventListener("click",()=>{const id=$("availableRankRoles").value,r=availableRoles.find(x=>x.id===id);if(!r)return;if(rankRoles.some(x=>x.role_id===id)){showToast("Ese rango ya está en la escala.");return;}rankRoles.push({role_id:id,role_name:r.name,rank_order:rankRoles.length+1,minimum_days:0});renderRankRoles();});$("importAllRolesButton").addEventListener("click",async()=>{const button=$("importAllRolesButton");button.disabled=true;button.textContent="Sincronizando…";try{const r=await request("rank-config-import-all",{method:"POST",body:{}});if(r.pending_approval){showToast(r.message);return;}rankRoles=r.ranks||[];availableRoles=availableRoles.filter(role=>!rankRoles.some(rank=>rank.role_id===role.id));renderRankRoles();const s=$("availableRankRoles"),v=s.value;s.replaceChildren(new Option("Selecciona un rol",""));availableRoles.forEach(x=>s.add(new Option(x.name+" · "+x.id,x.id)));if(availableRoles.some(x=>x.id===v))s.value=v;showToast("Roles de Discord sincronizados con la escala.");}catch(e){showToast(e.message);}finally{button.disabled=false;button.textContent="Sincronizar roles ahora";}});$("saveRanksButton").addEventListener("click",async()=>{if(!confirm("¿Guardar la escala y los días mínimos? Los rangos con oficiales asignados no se pueden quitar."))return;try{const r=await request("rank-config-save",{method:"POST",body:{role_ids:rankRoles.map(x=>x.role_id),minimum_days_by_role:Object.fromEntries(rankRoles.map(x=>[x.role_id,Number(x.minimum_days)||0]))}});rankRoles=r.ranks||rankRoles;renderRankRoles();showToast(r.message||"Escala y días mínimos guardados.");if(r.pending_approval)await loadRankConfig();}catch(e){showToast(e.message);}});$("refreshRolesButton").addEventListener("click",loadRankConfig);$("refreshPersonnelRanks").addEventListener("click",loadRankConfig);$("refreshRankHistory").addEventListener("click",loadRankHistory);
$("rankEffectiveDate").value=rankToday();
$("rankLookupButton").addEventListener("click",()=>{const plate=$("rankPlateSearch").value.trim().toLocaleLowerCase("es");if(!plate){showToast("Escribe la placa del oficial.");return;}const matches=personnel.filter(p=>String(p.plate||"").trim().toLocaleLowerCase("es")===plate);if(matches.length!==1){$("rankSelectedOfficer").textContent=matches.length?"Hay varias fichas con esa placa; corrige el registro.":"No se encontró un oficial con esa placa.";$("rankMember").value="";renderRankTargetOptions();return;}selectRankPerson(matches[0]);});
$("rankPlateSearch").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();$("rankLookupButton").click();}});
$("rankAction").addEventListener("change",renderRankTargetOptions);
$("refreshRankEligibility").addEventListener("click",()=>Promise.all([loadRankConfig(),loadPersonnel()]));
document.querySelectorAll("[data-rank-tab]").forEach(button=>button.addEventListener("click",()=>{const history=button.dataset.rankTab==="history";$("rankPromotionsTab").classList.toggle("hidden",history);$("rankHistoryTab").classList.toggle("hidden",!history);document.querySelectorAll("[data-rank-tab]").forEach(tab=>tab.classList.toggle("active",tab===button));if(history)loadRankHistory();}));
$("rankChangeForm").addEventListener("submit",async e=>{e.preventDefault();const selected=personnel.find(p=>p.discord_user_id===$("rankMember").value);if(!selected){showToast("Busca y selecciona primero al oficial por placa.");return;}const body={discord_user_id:selected.discord_user_id,action_type:$("rankAction").value,rank_role_id:$("rankTarget").value,reason:$("rankReason").value.trim(),effective_date:$("rankEffectiveDate").value,full_name:selected.full_name,name_ooc:selected.name_ooc,plate:selected.plate};if(!body.rank_role_id){showToast("Selecciona un rango de destino válido.");return;}const target=rankRoles.find(r=>r.role_id===body.rank_role_id);if(!confirm("¿Confirmas el cambio de "+(selected.rank_name||"rango actual")+" a "+(target?.role_name||"rango seleccionado")+" para "+selected.full_name+"? También se sincronizará su apodo de Discord con nombre IC y placa."))return;const b=$("rankChangeButton");b.disabled=true;b.textContent="Aplicando…";try{const r=await request("rank-change",{method:"POST",body});showToast(r.message||"Rango y apodo de Discord sincronizados.");loadRankAuthorizations();e.target.reset();$("rankMember").value="";$("rankSelectedOfficer").textContent="Ingresa una placa para buscar."; $("rankEffectiveDate").value=rankToday();await Promise.all([loadPersonnel(),loadRankHistory()]);renderRankTargetOptions();}catch(x){showToast(x.message);}finally{b.disabled=false;b.textContent="Ejecutar ascenso manual";}});
$("sanctionForm").addEventListener("submit", async event => {
  event.preventDefault();
  const discordId=$("sanctionDiscordId").value.trim();
  const type=$("sanctionType").value;
  const confirmText=type === "strike" ? "Registrar un strike" : "Registrar una amonestación";
  if (!confirm(confirmText+" para "+($("sanctionTargetName").value||discordId)+"? Se actualizarán sus roles y se publicará el aviso en el canal de sanciones.")) return;
  const button=$("sanctionButton"); button.disabled=true; button.textContent="Aplicando…";
  try {
    const result=await request("sanction",{method:"POST",body:{discord_user_id:discordId,action_type:type,target_name:$("sanctionTargetName").value.trim(),plate:$("sanctionPlate").value.trim(),reason:$("sanctionReason").value.trim(),evidence_url:$("sanctionEvidence").value.trim()}});
    showToast(result.message || result.warning || (result.expelled ? "Tercer strike: rol expulsado asignado y rol Policía retirado." : "Sanción aplicada y registrada."));
    $("sanctionForm").reset(); await loadSanctions();
  } catch(error) { showToast(error.message); }
  finally { button.disabled=false; button.textContent="Registrar sanción"; }
});
$("refreshSanctions").addEventListener("click",loadSanctions);
$("sanctionSearch").addEventListener("input",()=>scheduleRecordSearch("sanctions"));$("sanctionStatusFilter").addEventListener("change",()=>activeRecordPage("sanctions"));
$("sanctionDiscordId").addEventListener("change",()=>{const agent=personnel.find(p=>p.discord_user_id===$("sanctionDiscordId").value);$("sanctionTargetName").value=agent?.full_name||"";$("sanctionPlate").value=agent?.plate||"";});
$("refreshPreselections").addEventListener("click",loadPreselections);$("preselectionSearch").addEventListener("input",()=>scheduleRecordSearch("preselections"));
document.querySelectorAll("#rankRequestStatusTabs .tab").forEach(button=>button.addEventListener("click",()=>{activeRankRequestStatus=button.dataset.rankStatus;activeRecordPage('intakes');}));
document.querySelectorAll("#applicationStatusTabs .tab").forEach(button=>button.addEventListener("click",()=>{activeStatus=button.dataset.status;activeRecordPage('applications');}));
$("rankRequestSearch").addEventListener("input",()=>scheduleRecordSearch("intakes"));
$("refreshRankRequests").addEventListener("click",loadRankRequests);
document.querySelectorAll(".workspace-tab").forEach(button=>button.addEventListener("click",()=>{const view=button.dataset.view;$("dashboardView").classList.toggle("hidden",view!=="dashboard");$("shiftsView").classList.toggle("hidden",view!=="shifts");if(view==="dashboard")loadDashboard();if(view==="shifts")loadShifts();const apps=view==="applications",rankReq=view==="rank-requests",preselection=view==="preselections",sanctions=view==="sanctions",staff=view==="personnel",ranks=view==="ranks",transfer=view==="transfers";$("sanctionsView").classList.toggle("hidden",!sanctions);$("rankRequestsView").classList.toggle("hidden",!rankReq);$("preselectionsView").classList.toggle("hidden",!preselection);$("personnelView").classList.toggle("hidden",!staff);$("rankView").classList.toggle("hidden",!ranks);$("transfersView").classList.toggle("hidden",!transfer);["applicationsIntro","applicationStats","applicationsToolbar","applicationStatusTabs"].forEach(id=>$(id).classList.toggle("hidden",!apps));$("candidateList").classList.toggle("hidden",!apps);document.querySelectorAll(".workspace-tab").forEach(b=>b.classList.toggle("active",b===button));$("workspaceTitle").textContent=button.dataset.title||button.textContent.trim();if(apps)loadApplications();if(rankReq)loadRankRequests();if(preselection)loadPreselections();if(transfer)loadTransfers();if(sanctions){loadPersonnel();loadSanctions();}if(staff){loadPersonnel();loadRankConfig();}if(ranks){loadRankConfig();loadPersonnel();loadRankHistory();loadRankAuthorizations();}}));$("refreshButton").addEventListener("click", loadApplications);
$("refreshTransfers").addEventListener("click",loadTransfers);
document.querySelectorAll("[data-transfer-status]").forEach(button=>button.addEventListener("click",()=>{activeTransferStatus=button.dataset.transferStatus;activeRecordPage('transfers');}));
$("logoutButton").addEventListener("click", async () => {const button=$("logoutButton");button.disabled=true;try{await request('logout',{method:'POST'});showLogin();$("loginError").textContent="";showToast("Sesión cerrada en el servidor.");}catch(error){showToast("No se pudo confirmar el cierre en el servidor. "+error.message);}finally{button.disabled=false;}});
$("search").addEventListener("input", () => scheduleRecordSearch("applications"));

const pageUrl = new URL(window.location.href);
const oauthCodeFromUrl = pageUrl.searchParams.get("oauth_code");
const oauthErrorFromUrl = pageUrl.searchParams.get("auth_error");
if (oauthCodeFromUrl || oauthErrorFromUrl) {
  pageUrl.searchParams.delete("oauth_code");
  pageUrl.searchParams.delete("auth_error");
  history.replaceState(null, "", pageUrl.pathname + pageUrl.search + pageUrl.hash);
}
async function checkConnection() {
  try {
    const response = await fetch(API_BASE,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    const result = await response.json();
    if (!response.ok || !result.ok) {
      $("connection").textContent = "● API sin verificar";
      $("connection").style.color = "#ffcf7b";
      return;
    }
    if (result.configured && (!result.configured.discord || !result.configured.database)) {
      $("connection").textContent = "● Faltan credenciales";
      $("connection").style.color = "#ffb2b9";
    } else if (result.configured && result.configured.discord_oauth === false) {
      $("connection").textContent = "● Falta OAuth de Discord";
      $("connection").style.color = "#ffcf7b";
    } else if (result.commands_status==='managed_separately') {
      $('connection').textContent='● API conectada';$('connection').style.color='#8de4bd';
    } else if (result.commands_registered) {
      $("connection").textContent = "● API y comandos listos";
      $("connection").style.color = "#8de4bd";
    } else {
      $("connection").textContent = "● API activa · comandos pendientes";
      $("connection").style.color = "#ffcf7b";
    }
  } catch {
    $("connection").textContent = "● Sin conexión con la API";
    $("connection").style.color = "#ffb2b9";
  }
}
checkConnection();
if (oauthErrorFromUrl) {
  const oauthMessages = {
    oauth_not_configured: "Falta completar la configuración de inicio de sesión con Discord.",
    oauth_cancelled: "Cancelaste el inicio de sesión con Discord.",
    oauth_issuer_invalid: "Discord no pudo verificar la respuesta de inicio de sesión.",
    oauth_state_invalid: "La sesión de inicio expiró o no coincide. Vuelve a intentarlo.",
    oauth_exchange_failed: "Discord no pudo completar el inicio de sesión. Vuelve a intentarlo.",
    oauth_identity_failed: "No se pudo verificar tu cuenta de Discord.",
    role_not_authorized: "Tu cuenta no tiene un rol autorizado de UCOP, Directiva, Gobierno, Staff o Dev Discord.",
    oauth_login_failed: "No se pudo iniciar sesión. Comprueba que estás en el servidor PRIME POLICE y vuelve a intentarlo."
  };
  showLogin();
  $("loginError").textContent = oauthMessages[oauthErrorFromUrl] || "No se pudo completar el inicio de sesión con Discord.";
} else if (oauthCodeFromUrl) {
  showLogin();
  $("discordLoginButton").disabled = true;
  $("discordLoginButton").textContent = "Verificando Discord…";
  $("loginError").textContent = "Comprobando tu cuenta y tus roles…";
  request("login", {method:"POST",body:{code:oauthCodeFromUrl}}).then(async result => {
    token = result.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    $("loginError").textContent = "";
    showApp();
    await loadAccountProfile();
    openDashboardWhenReady();
  }).catch(error => {
    showLogin();
    $("loginError").textContent = error.message || "El acceso expiró. Vuelve a entrar con Discord.";
  }).finally(() => {
    $("discordLoginButton").disabled = false;
    $("discordLoginButton").textContent = "Entrar con Discord";
  });
} else if (token) {
  showApp();
  loadAccountProfile().then(()=>{openDashboardWhenReady();});
} else {
  showLogin();
}
$("refreshAuthorizations").addEventListener("click",loadRankAuthorizations);
