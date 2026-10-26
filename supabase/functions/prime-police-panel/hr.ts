import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GUILD_ID = "1539970134469378068";
const POLICE_ROLE_ID = "1539970134482092038";
const EXPELLED_ROLE_ID = "1539970134482092034";
const OWNER_IDS = new Set(["698630509143654541"]);
const MANAGER_ROLE_IDS = new Set(["1539970134565982313", "1539970134544748562", "1539970134544748556", "1539970134519578773", "1539970134519578774"]);
const PROTECTED_ROLE_IDS = new Set([
  POLICE_ROLE_ID, EXPELLED_ROLE_ID,
  "1539970134482092032", "1539970134469378077", "1539970134469378076",
  "1539970134469378075", "1539970134469378074", "1539970134469378073",
  ...MANAGER_ROLE_IDS,
]);
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const encoder = new TextEncoder();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" } });

async function db(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Base de datos no configurada");
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body: any;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error("Database " + response.status + ": " + JSON.stringify(body));
  return body;
}

async function discord(path: string, init: RequestInit = {}) {
  if (!BOT_TOKEN) throw new Error("Bot de Discord no configurado");
  const response = await fetch("https://discord.com/api/v10" + path, { ...init, headers: { Authorization: "Bot " + BOT_TOKEN, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = response.status === 204 ? "" : await response.text();
  let body: any;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error("Discord API " + response.status + ": " + JSON.stringify(body));
  return body;
}

function decodeBase64Url(value: string) {
  const base = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - base.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function authorizedUser(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !BOT_TOKEN) return null;
  const parts = auth.slice(7).trim().split(".");
  if (parts.length !== 2) return null;
  let userId: string;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(BOT_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, decodeBase64Url(parts[1]), encoder.encode(parts[0]))) return null;
    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    if (typeof session.sub !== "string" || !Number.isFinite(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) return null;
    userId = session.sub;
  } catch { return null; }
  if (OWNER_IDS.has(userId)) return userId;
  try {
    const member = await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(userId)) as any;
    return (member.roles ?? []).some((role: string) => MANAGER_ROLE_IDS.has(role)) ? userId : null;
  } catch (error) {
    console.error("HR permission check failed:", String(error));
    return null;
  }
}

const validDiscordId = (value: string) => /^\d{17,20}$/.test(value);
const enc = (value: string) => encodeURIComponent(value);
async function allowed(req: Request) {
  const userId = await authorizedUser(req);
  if (!userId) return { error: json({ error: "No tienes permiso para gestionar el personal." }, 403) };
  return { userId };
}async function listPersonnel(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const records = await db("police_personnel?select=discord_user_id,discord_username,full_name,name_ooc,plate,unit,rank_name,rank_role_id,status,source_application_id,created_at,updated_at,last_rank_change_at&order=full_name.asc&limit=500");
    const apps = await db("police_applications?select=id,discord_user_id,discord_username,full_name,created_at,role_assigned_at&status=eq.accepted&order=created_at.desc&limit=500");
    const byId = new Map<string, any>();
    for (const person of records ?? []) byId.set(String(person.discord_user_id), person);
    for (const app of apps ?? []) {
      const id = String(app.discord_user_id ?? "");
      if (!validDiscordId(id)) continue;
      const known = byId.get(id);
      if (!known) byId.set(id, { discord_user_id: id, discord_username: app.discord_username ?? "", full_name: app.full_name ?? "", name_ooc: app.discord_username ?? "", plate: "", unit: "UCOP", rank_name: "", rank_role_id: null, status: "active", source_application_id: app.id, created_at: app.created_at, updated_at: app.role_assigned_at ?? app.created_at, last_rank_change_at: null });
      else if (!known.full_name && app.full_name) known.full_name = app.full_name;
    }
    return json({ ok: true, personnel: Array.from(byId.values()).sort((a, b) => String(a.full_name || a.discord_username).localeCompare(String(b.full_name || b.discord_username), "es")) });
  } catch (error) { console.error("Personnel list error:", String(error)); return json({ error: "No se pudo cargar la base de personal." }, 500); }
}

async function registerPersonnel(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const id = String(body?.discord_user_id ?? "").trim();
  const nameIc = String(body?.full_name ?? "").trim().slice(0, 100);
  const nameOoc = String(body?.name_ooc ?? "").trim().slice(0, 100);
  const plate = String(body?.plate ?? "").trim().slice(0, 30);
  const rankRoleId = String(body?.rank_role_id ?? "").trim();
  if (!validDiscordId(id) || !validDiscordId(rankRoleId) || !nameIc || !nameOoc || !plate) return json({ error: "Completa placa, nombre IC, nombre OOC, Discord y rango." }, 400);
  let member: any; let oldRoles: string[] = []; let addedTargetRole = false;
  try {
    const [guildMember, profiles, configuredRanks] = await Promise.all([
      discord("/guilds/" + GUILD_ID + "/members/" + enc(id)),
      db("police_personnel?select=discord_user_id,rank_name,rank_role_id,source_application_id,created_at&discord_user_id=eq." + enc(id) + "&limit=1"),
      db("police_rank_roles?select=role_id,role_name&order=rank_order.asc"),
    ]);
    member = guildMember as any;
    const rank = (configuredRanks ?? []).find((item: any) => item.role_id === rankRoleId);
    if (!rank) return json({ error: "Configura primero la escala y elige un rango de UCOP válido." }, 400);
    const memberRoles: string[] = member.roles ?? [];
    if (!memberRoles.includes(POLICE_ROLE_ID)) return json({ error: "El agente debe tener el rol base de Policía para registrarlo." }, 409);
    if (memberRoles.includes(EXPELLED_ROLE_ID)) return json({ error: "No se puede registrar a una persona con el rol de expulsado." }, 409);
    oldRoles = (configuredRanks ?? []).filter((item: any) => memberRoles.includes(String(item.role_id)) && item.role_id !== rankRoleId).map((item: any) => String(item.role_id));
    const existing = profiles?.[0] ?? {};
    if (!memberRoles.includes(rankRoleId)) { await discord("/guilds/" + GUILD_ID + "/members/" + enc(id) + "/roles/" + rankRoleId, { method: "PUT", body: "{}" }); addedTargetRole = true; }
    for (const roleId of oldRoles) await discord("/guilds/" + GUILD_ID + "/members/" + enc(id) + "/roles/" + roleId, { method: "DELETE" });
    const username = String(member.user?.global_name || member.user?.username || id);
    const now = new Date().toISOString();
    const rows = await db("police_personnel?on_conflict=discord_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ discord_user_id: id, discord_username: username, full_name: nameIc, name_ooc: nameOoc, plate, unit: "UCOP", rank_name: String(rank.role_name), rank_role_id: rankRoleId, source_application_id: existing.source_application_id ?? null, status: "active", updated_at: now, last_rank_change_at: now }) });
    return json({ ok: true, personnel: rows?.[0] ?? null });
  } catch (error) {
    console.error("Personnel register error:", String(error));
    try {
      if (addedTargetRole) await discord("/guilds/" + GUILD_ID + "/members/" + enc(id) + "/roles/" + rankRoleId, { method: "DELETE" });
      for (const roleId of oldRoles) await discord("/guilds/" + GUILD_ID + "/members/" + enc(id) + "/roles/" + roleId, { method: "PUT", body: "{}" });
    } catch (rollbackError) { console.error("Personnel registration rollback failed:", String(rollbackError)); }
    const message = String(error);
    if (message.includes("Discord API 403") || message.includes("50013")) return json({ error: "Discord denegó el cambio de rango. Comprueba que el bot pueda administrar roles y que su rol esté por encima del rango." }, 502);
    if (message.includes("Discord API 404") || message.includes("10007")) return json({ error: "No se encontró al usuario en el servidor." }, 404);
    return json({ error: "No se pudo registrar al agente. Comprueba los datos y permisos." }, 502);
  }
}
async function rankConfig(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const [configured, guildRoles] = await Promise.all([
      db("police_rank_roles?select=role_id,role_name,rank_order&order=rank_order.asc"),
      discord("/guilds/" + GUILD_ID + "/roles") as Promise<any[]>,
    ]);
    const roles = (guildRoles ?? []).map((r: any) => ({ id: String(r.id), name: String(r.name), position: Number(r.position), managed: Boolean(r.managed) }));
    const byId = new Map(roles.map((r: any) => [r.id, r]));
    const ranks = (configured ?? []).map((r: any) => ({ ...r, role_name: byId.get(r.role_id)?.name ?? r.role_name }));
    const available = roles.filter((r: any) => r.id !== GUILD_ID && !r.managed && !PROTECTED_ROLE_IDS.has(r.id));
    return json({ ok: true, ranks, available_roles: available });
  } catch (error) { console.error("Rank configuration read error:", String(error)); return json({ error: "No se pudieron cargar los rangos de Discord." }, 502); }
}

async function saveRankConfig(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const ids = body?.role_ids;
  if (!Array.isArray(ids) || ids.length > 40 || ids.some((x: unknown) => typeof x !== "string" || !validDiscordId(x)) || new Set(ids).size !== ids.length) return json({ error: "La escala debe incluir hasta 40 roles de rango únicos." }, 400);
  try {
    const guildRoles = await discord("/guilds/" + GUILD_ID + "/roles") as any[];
    const byId = new Map((guildRoles ?? []).map((r: any) => [String(r.id), r]));
    for (const id of ids) { const role: any = byId.get(id); if (!role || role.managed || PROTECTED_ROLE_IDS.has(id)) return json({ error: "La lista incluye un rol protegido o que no existe en el servidor." }, 400); }
    const existing = await db("police_rank_roles?select=role_id,role_name,rank_order&order=rank_order.asc");
    const removed = (existing ?? []).filter((r: any) => !ids.includes(r.role_id));
    if (removed.length) {
      const inUse = await db("police_personnel?select=discord_user_id,rank_role_id&rank_role_id=in.(" + removed.map((r: any) => r.role_id).join(",") + ")&limit=1");
      if (inUse?.length) return json({ error: "No quites un rango que todavía tiene oficiales asignados. Cambia primero sus rangos." }, 409);
    }
    const mapped = ids.map((id: string, index: number) => ({ role_id: id, role_name: String(byId.get(id).name), rank_order: index + 1, updated_at: new Date().toISOString() }));
    try {
      await db("police_rank_roles", { method: "DELETE" });
      if (mapped.length) await db("police_rank_roles", { method: "POST", body: JSON.stringify(mapped) });
    } catch (error) {
      if (existing?.length) { try { await db("police_rank_roles", { method: "POST", body: JSON.stringify(existing) }); } catch (restoreError) { console.error("Rank config restore failed:", String(restoreError)); } }
      throw error;
    }
    return json({ ok: true, ranks: mapped });
  } catch (error) { console.error("Rank configuration save error:", String(error)); return json({ error: "No se pudo guardar la escala de rangos." }, 500); }
}async function rankHistory(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const rows = await db("police_rank_history?select=discord_user_id,discord_username,full_name,action_type,previous_rank_name,new_rank_name,reason,changed_by_discord_id,changed_by_name,created_at&order=created_at.desc&limit=200");
    return json({ ok: true, history: rows ?? [] });
  } catch (error) { console.error("Rank history read error:", String(error)); return json({ error: "No se pudo cargar el historial de rangos." }, 500); }
}

async function changeRank(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const targetId = String(body?.discord_user_id ?? "").trim();
  const targetRoleId = String(body?.rank_role_id ?? "").trim();
  const actionType = String(body?.action_type ?? "");
  const reason = String(body?.reason ?? "").trim().slice(0, 500);
  if (!validDiscordId(targetId) || !validDiscordId(targetRoleId) || !["promotion", "demotion", "assignment"].includes(actionType) || reason.length < 3) return json({ error: "Revisa el oficial, el rango y el motivo (mínimo 3 caracteres)." }, 400);
  let oldRoles: string[] = [];
  let didChangeDiscord = false;
  let addedTargetRole = false;
  let priorProfile: any = null;
  let target: any;
  let member: any;
  let ranks: any[] = [];
  try {
    ranks = await db("police_rank_roles?select=role_id,role_name,rank_order&order=rank_order.asc");
    const targetRank = (ranks ?? []).find((r: any) => r.role_id === targetRoleId);
    if (!targetRank) return json({ error: "El rango elegido no está en la escala autorizada." }, 400);
    const [guildMember, profiles] = await Promise.all([
      discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId)),
      db("police_personnel?select=*&discord_user_id=eq." + enc(targetId) + "&limit=1"),
    ]);
    member = guildMember;
    target = member;
    const memberRoles: string[] = member.roles ?? [];
    if (!memberRoles.includes(POLICE_ROLE_ID)) return json({ error: "El oficial debe conservar el rol de Policía para cambiar de rango." }, 409);
    if (memberRoles.includes(EXPELLED_ROLE_ID)) return json({ error: "La persona tiene el rol de expulsado." }, 409);
    const currentRanks = (ranks ?? []).filter((r: any) => memberRoles.includes(r.role_id)).sort((a: any, b: any) => Number(b.rank_order) - Number(a.rank_order));
    const currentRank = currentRanks[0] ?? null;
    if (currentRank?.role_id === targetRoleId) return json({ error: "Ese rango ya está asignado." }, 409);
    if (!currentRank && actionType !== "assignment") return json({ error: "Este oficial no tiene un rango configurado; usa Asignación inicial." }, 409);
    if (currentRank && actionType === "assignment") return json({ error: "El oficial ya tiene un rango; elige Ascenso o Descenso." }, 409);
    if (currentRank && actionType === "promotion" && Number(targetRank.rank_order) <= Number(currentRank.rank_order)) return json({ error: "Para ascender, el nuevo rango debe estar por encima del actual en la escala." }, 409);
    if (currentRank && actionType === "demotion" && Number(targetRank.rank_order) >= Number(currentRank.rank_order)) return json({ error: "Para descender, el nuevo rango debe estar por debajo del actual en la escala." }, 409);
    oldRoles = currentRanks.map((r: any) => String(r.role_id)).filter((roleId: string) => roleId !== targetRoleId);
    priorProfile = profiles?.[0] ?? null;
    const username = String(member.user?.global_name || member.user?.username || targetId);
    const fullName = String(priorProfile?.full_name || username);
    const actor = await discord("/guilds/" + GUILD_ID + "/members/" + enc(auth.userId)) as any;
    const actorName = String(actor.nick || actor.user?.global_name || actor.user?.username || auth.userId);
    if (!memberRoles.includes(targetRoleId)) { await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId) + "/roles/" + targetRoleId, { method: "PUT", body: "{}" }); addedTargetRole = true; }
    didChangeDiscord = true;
    for (const roleId of oldRoles) await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId) + "/roles/" + roleId, { method: "DELETE" });
    const now = new Date().toISOString();
    const updated = {
      discord_user_id: targetId, discord_username: username, full_name: fullName,
      plate: priorProfile?.plate ?? "", rank_name: String(targetRank.role_name), rank_role_id: targetRoleId,
      status: "active", source_application_id: priorProfile?.source_application_id ?? null,
      created_at: priorProfile?.created_at ?? now, updated_at: now, last_rank_change_at: now,
    };
    await db("police_personnel?on_conflict=discord_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(updated) });
    const previousRank = currentRank ?? (priorProfile?.rank_name ? { role_id: priorProfile.rank_role_id, role_name: priorProfile.rank_name } : null);
    await db("police_rank_history", { method: "POST", body: JSON.stringify({
      discord_user_id: targetId, discord_username: username, full_name: fullName, action_type: actionType,
      previous_role_id: previousRank?.role_id ?? null, previous_rank_name: previousRank?.role_name ?? priorProfile?.rank_name ?? "",
      new_role_id: targetRoleId, new_rank_name: String(targetRank.role_name), reason,
      changed_by_discord_id: auth.userId, changed_by_name: actorName, created_at: now,
    }) });
    return json({ ok: true, message: (actionType === "promotion" ? "Ascenso" : actionType === "demotion" ? "Descenso" : "Rango asignado") + " aplicado a " + fullName + "." });
  } catch (error) {
    console.error("Rank change failed:", String(error));
    if (didChangeDiscord && target) {
      try {
        if (addedTargetRole) await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId) + "/roles/" + targetRoleId, { method: "DELETE" });
        for (const roleId of oldRoles) await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId) + "/roles/" + roleId, { method: "PUT", body: "{}" });
        if (priorProfile) await db("police_personnel?discord_user_id=eq." + enc(targetId), { method: "PATCH", body: JSON.stringify(priorProfile) });
        else await db("police_personnel?discord_user_id=eq." + enc(targetId), { method: "DELETE" });
      } catch (rollbackError) { console.error("Rank change rollback failed:", String(rollbackError)); }
    }
    const message = String(error);
    if (message.includes("Discord API 403") || message.includes("50013")) return json({ error: "Discord denegó el cambio. El bot necesita Administrar roles y su rol debe estar por encima del rango." }, 502);
    if (message.includes("Discord API 404") || message.includes("10007")) return json({ error: "No se encontró al oficial en el servidor." }, 404);
    return json({ error: "No se pudo completar el cambio de rango; revisa los permisos del bot y la base de datos." }, 502);
  }
}

export async function handleHr(req: Request, action: string): Promise<Response | null> {
  if (action === "personnel" && req.method === "GET") return await listPersonnel(req);
  if (action === "personnel-register" && req.method === "POST") return await registerPersonnel(req);
  if (action === "rank-config" && req.method === "GET") return await rankConfig(req);
  if (action === "rank-config-save" && req.method === "POST") return await saveRankConfig(req);
  if (action === "rank-history" && req.method === "GET") return await rankHistory(req);
  if (action === "rank-change" && req.method === "POST") return await changeRank(req);
  return null;
}