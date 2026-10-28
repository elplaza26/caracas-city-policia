const GUILD_ID = "1539970134469378068";
const POLICE_ROLE_ID = "1539970134482092038";
const PRESELECTION_ROLE_ID = "1564685481457877012";
const CIC_ROLE_ID = "1539970134519578772";
const EXPELLED_ROLE_ID = "1539970134482092034";
const RANK_AUDIT_CHANNEL_ID = "1539970137246142604";
const POLICE_ONLY_RANK_LABEL = "Solo rol de Policía (sin rango configurado)";
const MANAGER_ROLE_IDS = new Set(["1539970134565982313", "1539970134544748562", "1539970134544748556", "1539970134544748557", "1539970134519578773", "1539970134519578774"]);
const PROTECTED_ROLE_IDS = new Set([
  POLICE_ROLE_ID, PRESELECTION_ROLE_ID, EXPELLED_ROLE_ID, CIC_ROLE_ID,
  "1539970134482092032", "1539970134469378077", "1539970134469378076",
  "1539970134469378075", "1539970134469378074", "1539970134469378073",
  ...MANAGER_ROLE_IDS,
]);
const BLOCKED_ROLE_PERMISSION_FLAGS = (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 5n) | (1n << 28n) | (1n << 29n) | (1n << 40n);
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const encoder = new TextEncoder();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "https://primepolicerp.github.io", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });

function personnelNickname(name: string, plate: string) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  const cleanPlate = plate.trim().replace(/\s+/g, " ");
  if (!cleanPlate) return cleanName.slice(0, 32);
  const suffix = " #" + cleanPlate;
  if (suffix.length >= 32) return "#" + cleanPlate.slice(0, 31);
  return cleanName.slice(0, 32 - suffix.length).trimEnd() + suffix;
}

async function updatePersonnelNickname(memberId: string, name: string, plate: string, reason: string) {
  return await discord("/guilds/" + GUILD_ID + "/members/" + enc(memberId), {
    method: "PATCH",
    headers: { "X-Audit-Log-Reason": encodeURIComponent(reason) },
    body: JSON.stringify({ nick: personnelNickname(name, plate) }),
  });
}

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

async function postRankAuditLog(title: string, color: number, fields: Array<{ name: string; value: string }>) {
  try {
    await discord("/channels/" + RANK_AUDIT_CHANNEL_ID + "/messages", {
      method: "POST",
      body: JSON.stringify({
        embeds: [{ title, color, fields: fields.map((field) => ({ name: field.name.slice(0, 256), value: field.value.slice(0, 1024), inline: true })), timestamp: new Date().toISOString(), footer: { text: "PRIME POLICE · Auditoría UCOP" } }],
        allowed_mentions: { parse: [] },
      }),
    });
  } catch (error) {
    console.error("Rank audit log could not be posted:", String(error));
  }
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
const explainRankConfigFailure = (error: unknown) => {
  const message = String(error);
  if (message.includes("Discord API 403")) return "El bot no puede leer los roles del servidor. Revisa que siga dentro del servidor y tenga permiso para ver/administrar roles.";
  if (message.includes("Database 400") || message.includes("minimum_days") || message.includes("police_rank_roles")) return "La base de datos no tiene la estructura de rangos actualizada. Aplica las migraciones pendientes de Supabase y vuelve a actualizar.";
  return "No se pudo consultar Discord o guardar la escala. Actualiza la función prime-police-panel y vuelve a intentarlo.";
};
const explainRankSaveFailure = (error: unknown) => {
  const message = String(error);
  if (message.includes("minimum_days") || message.includes("police_rank_roles")) {
    return "La estructura de police_rank_roles no coincide con la función publicada. Revisa la migración de rangos en Supabase. Detalle: " + message.slice(0, 320);
  }
  if (message.includes("Database 400") || message.includes("Database 409")) {
    return "Supabase rechazó la escala por una restricción o dato duplicado. Detalle: " + message.slice(0, 420);
  }
  if (message.includes("Database 401") || message.includes("Database 403")) {
    return "La función no tiene permisos para modificar police_rank_roles en Supabase. Revisa la clave de servicio configurada.";
  }
  if (message.includes("Discord API 403")) {
    return "Discord no permitió consultar los roles. Revisa que el bot siga en el servidor y pueda ver los roles.";
  }
  return "No se pudo guardar la escala de rangos. Detalle: " + message.slice(0, 320);
};
function isAssignableRankRole(role: any) {
  if (!role || role.managed || PROTECTED_ROLE_IDS.has(String(role.id))) return false;
  try { return (BigInt(String(role.permissions ?? "0")) & BLOCKED_ROLE_PERMISSION_FLAGS) === 0n; }
  catch { return false; }
}
async function allowed(req: Request) {
  const userId = await authorizedUser(req);
  if (!userId) return { error: json({ error: "No tienes permiso para gestionar el personal." }, 403) };
  return { userId };
}async function listPersonnel(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const records = await db("police_personnel?select=discord_user_id,discord_username,full_name,name_ooc,plate,unit,rank_name,rank_role_id,status,source_application_id,created_at,updated_at,last_rank_change_at&unit=eq.UCOP&order=full_name.asc&limit=500");
    return json({ ok: true, personnel: records ?? [] });
  } catch (error) { console.error("Personnel list error:", String(error)); return json({ error: "No se pudo cargar la base de personal." }, 500); }
}

async function listPreselections(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const rows = await db("police_preselections?select=discord_user_id,discord_username,full_name,source_application_id,status,accepted_at&status=eq.active&order=accepted_at.desc&limit=500");
    return json({ ok: true, preselections: rows ?? [] });
  } catch (error) {
    console.error("Preselection list error:", String(error));
    return json({ error: "No se pudo cargar la base de preseleccionados." }, 500);
  }
}

async function deletePersonnel(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const id = String(body?.discord_user_id ?? "").trim();
  if (!validDiscordId(id)) return json({ error: "El ID de Discord no es válido." }, 400);
  try {
    const removed = await db("police_personnel?discord_user_id=eq." + enc(id) + "&unit=eq.UCOP", { method: "DELETE" });
    if (!Array.isArray(removed) || !removed.length) return json({ error: "Ese agente ya no aparece en el registro de personal." }, 404);
    return json({ ok: true, message: "Agente eliminado del registro de personal." });
  } catch (error) {
    console.error("Personnel deletion error:", String(error));
    return json({ error: "No se pudo eliminar al agente del registro." }, 500);
  }
}
async function registerPersonnel(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const id = String(body?.discord_user_id ?? "").trim();
  const nameIc = String(body?.full_name ?? "").trim().slice(0, 100);
  const nameOoc = String(body?.name_ooc ?? "").trim().slice(0, 100);
  const plate = String(body?.plate ?? "").trim().slice(0, 30);
  const unit = "UCOP";
  const rankRoleId = String(body?.rank_role_id ?? "").trim();
  if (!validDiscordId(id) || !validDiscordId(rankRoleId) || !nameIc || !nameOoc || !plate || (body?.unit && String(body.unit).trim().toUpperCase() !== "UCOP")) return json({ error: "Completa placa, nombre IC, nombre OOC, Discord y rango para registrar personal UCOP." }, 400);
  let member: any; let oldRoles: string[] = []; let addedTargetRole = false; let nicknameChanged = false;
  try {
    const [guildMember, profiles, configuredRanks] = await Promise.all([
      discord("/guilds/" + GUILD_ID + "/members/" + enc(id)),
      db("police_personnel?select=discord_user_id,rank_name,rank_role_id,unit,source_application_id,created_at&discord_user_id=eq." + enc(id) + "&limit=1"),
      db("police_rank_roles?select=role_id,role_name&order=rank_order.asc"),
    ]);
    member = guildMember as any;
    const rank = (configuredRanks ?? []).find((item: any) => item.role_id === rankRoleId);
    if (!rank) return json({ error: "Configura primero la escala y elige un rango válido." }, 400);
    const memberRoles: string[] = member.roles ?? [];
    if (!memberRoles.includes(POLICE_ROLE_ID)) return json({ error: "El agente debe tener el rol base de Policía para registrarlo." }, 409);
    if (memberRoles.includes(CIC_ROLE_ID)) return json({ error: "Este panel solo gestiona personal UCOP; el miembro tiene el rol de CIC." }, 409);
    if (memberRoles.includes(EXPELLED_ROLE_ID)) return json({ error: "No se puede registrar a una persona con el rol de expulsado." }, 409);
    oldRoles = (configuredRanks ?? []).filter((item: any) => memberRoles.includes(String(item.role_id)) && item.role_id !== rankRoleId).map((item: any) => String(item.role_id));
    const existing = profiles?.[0] ?? {};
    if (existing.unit && existing.unit !== "UCOP") return json({ error: "Este perfil pertenece a otra unidad y no puede administrarse desde UCOP." }, 409);
    if (!memberRoles.includes(rankRoleId)) { await discord("/guilds/" + GUILD_ID + "/members/" + enc(id) + "/roles/" + rankRoleId, { method: "PUT", body: "{}" }); addedTargetRole = true; }
    for (const roleId of oldRoles) await discord("/guilds/" + GUILD_ID + "/members/" + enc(id) + "/roles/" + roleId, { method: "DELETE" });
    await updatePersonnelNickname(id, nameIc, plate, "PRIME POLICE UCOP: sincronización de nombre IC y placa al asignar rango"); nicknameChanged = true;
    const username = String(member.user?.global_name || member.user?.username || id);
    const now = new Date().toISOString();
    const rows = await db("police_personnel?on_conflict=discord_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ discord_user_id: id, discord_username: username, full_name: nameIc, name_ooc: nameOoc, plate, unit, rank_name: String(rank.role_name), rank_role_id: rankRoleId, source_application_id: existing.source_application_id ?? null, status: "active", updated_at: now, last_rank_change_at: now }) });
    return json({ ok: true, personnel: rows?.[0] ?? null, message: "Rango y apodo de Discord sincronizados como " + personnelNickname(nameIc, plate) + "." });
  } catch (error) {
    console.error("Personnel register error:", String(error));
    try {
      if (nicknameChanged) await discord("/guilds/" + GUILD_ID + "/members/" + enc(id), { method: "PATCH", body: JSON.stringify({ nick: member?.nick ?? null }) });
      if (addedTargetRole) await discord("/guilds/" + GUILD_ID + "/members/" + enc(id) + "/roles/" + rankRoleId, { method: "DELETE" });
      for (const roleId of oldRoles) await discord("/guilds/" + GUILD_ID + "/members/" + enc(id) + "/roles/" + roleId, { method: "PUT", body: "{}" });
    } catch (rollbackError) { console.error("Personnel registration rollback failed:", String(rollbackError)); }
    const message = String(error);
    if (message.includes("Discord API 403") || message.includes("50013")) return json({ error: "Discord denegó el cambio. El bot necesita Administrar roles y Gestionar apodos, y su rol debe estar por encima del rango." }, 502);
    if (message.includes("Discord API 404") || message.includes("10007")) return json({ error: "No se encontró al usuario en el servidor." }, 404);
    return json({ error: "No se pudo registrar al agente. Comprueba los datos y permisos." }, 502);
  }
}
async function rankConfig(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const [configured, guildRoles] = await Promise.all([
      db("police_rank_roles?select=role_id,role_name,rank_order,minimum_days&order=rank_order.asc"),
      discord("/guilds/" + GUILD_ID + "/roles") as Promise<any[]>,
    ]);
    const roles = (guildRoles ?? []).map((r: any) => ({ id: String(r.id), name: String(r.name), position: Number(r.position), managed: Boolean(r.managed), permissions: String(r.permissions ?? "0") }));
    const byId = new Map(roles.map((r: any) => [r.id, r]));
    const available = roles.filter((r: any) => r.id !== GUILD_ID && isAssignableRankRole(r)).sort((a: any, b: any) => a.position - b.position || a.name.localeCompare(b.name, "es"));
    if (!(configured ?? []).length && !available.length) return json({ error: "Discord respondió, pero no hay roles asignables. Comprueba los permisos del bot y vuelve a desplegar prime-police-panel." }, 409);
    const configuredIds = new Set((configured ?? []).map((rank: any) => String(rank.role_id)));
    if (available.some((role: any) => !configuredIds.has(role.id))) {
      const synced = await importAllRankRoles(req);
      const result = await synced.json().catch(() => ({}));
      if (!synced.ok) return json(result, synced.status);
      const ranks = (result.ranks ?? []).map((rank: any) => ({ ...rank, role_name: byId.get(String(rank.role_id))?.name ?? rank.role_name }));
      return json({ ok: true, ranks, available_roles: [], imported_count: Number(result.imported_count ?? 0), auto_synced: true });
    }
    const ranks = (configured ?? []).map((r: any) => ({ ...r, role_name: byId.get(r.role_id)?.name ?? r.role_name }));
    return json({ ok: true, ranks, available_roles: available });
  } catch (error) { console.error("Rank configuration read error:", String(error)); return json({ error: explainRankConfigFailure(error) }, 502); }
}

async function importAllRankRoles(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const [existing, guildRoles] = await Promise.all([
      db("police_rank_roles?select=role_id,role_name,rank_order,minimum_days&order=rank_order.asc"),
      discord("/guilds/" + GUILD_ID + "/roles") as Promise<any[]>,
    ]);
    const eligible = (guildRoles ?? [])
      .filter((role: any) => String(role.id) !== GUILD_ID && isAssignableRankRole(role))
      .sort((a: any, b: any) => Number(a.position) - Number(b.position) || String(a.name).localeCompare(String(b.name), "es"));
    if (!eligible.length) return json({ error: "Discord no devolvió rangos asignables. Revisa los permisos del bot y la jerarquía de roles del servidor." }, 409);
    const roleById = new Map(eligible.map((role: any) => [String(role.id), role]));
    const retained = (existing ?? []).filter((rank: any) => roleById.has(String(rank.role_id)));
    const retainedIds = new Set(retained.map((rank: any) => String(rank.role_id)));
    const orderedIds = [
      ...retained.map((rank: any) => String(rank.role_id)),
      ...eligible.map((role: any) => String(role.id)).filter((id: string) => !retainedIds.has(id)),
    ];
    if (orderedIds.length > 250) return json({ error: "Discord devolvió más roles asignables de los que admite la escala." }, 400);
    const saveRequest = new Request("https://internal/?panel=rank-config-save", {
      method: "POST",
      headers: { authorization: req.headers.get("authorization") ?? "", "content-type": "application/json" },
      body: JSON.stringify({ role_ids: orderedIds }),
    });
    const saved = await saveRankConfig(saveRequest);
    const result = await saved.json().catch(() => ({}));
    if (!saved.ok) return json(result, saved.status);
    return json({ ok: true, ranks: result.ranks ?? [], imported_count: orderedIds.length - retained.length });
  } catch (error) {
    console.error("Import all Discord roles error:", String(error));
    return json({ error: explainRankConfigFailure(error) }, 502);
  }
}

async function saveRankConfig(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const ids = body?.role_ids;
  if (!Array.isArray(ids) || ids.length > 250 || ids.some((x: unknown) => typeof x !== "string" || !validDiscordId(x)) || new Set(ids).size !== ids.length) return json({ error: "La escala debe incluir hasta 250 roles únicos." }, 400);
  try {
    const guildRoles = await discord("/guilds/" + GUILD_ID + "/roles") as any[];
    const byId = new Map((guildRoles ?? []).map((r: any) => [String(r.id), r]));
    for (const id of ids) { const role: any = byId.get(id); if (!isAssignableRankRole(role)) return json({ error: "La lista incluye un rol protegido, privilegiado o que no existe en el servidor." }, 400); }
    const existing = await db("police_rank_roles?select=role_id,role_name,rank_order,minimum_days&order=rank_order.asc");
    const suppliedDays = body?.minimum_days_by_role && typeof body.minimum_days_by_role === "object" && !Array.isArray(body.minimum_days_by_role) ? body.minimum_days_by_role : {};
    for (const value of Object.values(suppliedDays) as any[]) if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 3650) return json({ error: "Los días mínimos deben ser un número entero entre 0 y 3650." }, 400);
    const existingDays = new Map((existing ?? []).map((row: any) => [String(row.role_id), Number(row.minimum_days ?? 0)]));
    const removed = (existing ?? []).filter((r: any) => !ids.includes(r.role_id));
    if (removed.length) {
      const inUse = await db("police_personnel?select=discord_user_id,rank_role_id&rank_role_id=in.(" + removed.map((r: any) => r.role_id).join(",") + ")&limit=1");
      if (inUse?.length) return json({ error: "No quites un rango que todavía tiene oficiales asignados. Cambia primero sus rangos." }, 409);
    }
    const mapped = ids.map((id: string, index: number) => ({ role_id: id, role_name: String(byId.get(id).name), rank_order: index + 1, minimum_days: Number(Object.prototype.hasOwnProperty.call(suppliedDays, id) ? suppliedDays[id] : existingDays.get(id) ?? 0), updated_at: new Date().toISOString() }));
    try {
      await db("police_rank_roles?role_id=not.is.null", { method: "DELETE" });
      if (mapped.length) await db("police_rank_roles", { method: "POST", body: JSON.stringify(mapped) });
    } catch (error) {
      if (existing?.length) { try { await db("police_rank_roles", { method: "POST", body: JSON.stringify(existing) }); } catch (restoreError) { console.error("Rank config restore failed:", String(restoreError)); } }
      throw error;
    }
    return json({ ok: true, ranks: mapped });
  } catch (error) { console.error("Rank configuration save error:", String(error)); return json({ error: explainRankSaveFailure(error) }, 500); }
}async function rankHistory(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const personnel = await db("police_personnel?select=discord_user_id&unit=eq.UCOP&limit=500");
    const ids = (personnel ?? []).map((row: any) => String(row.discord_user_id)).filter((id: string) => validDiscordId(id));
    if (!ids.length) return json({ ok: true, history: [] });
    const rows = await db("police_rank_history?select=discord_user_id,discord_username,full_name,action_type,previous_rank_name,new_rank_name,reason,changed_by_discord_id,changed_by_name,created_at&discord_user_id=in.(" + ids.join(",") + ")&order=created_at.desc&limit=200");
    return json({ ok: true, history: rows ?? [] });
  } catch (error) { console.error("Rank history read error:", String(error)); return json({ error: "No se pudo cargar el historial de rangos." }, 500); }
}

async function listRankRequests(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  try {
    const rows = await db("police_rank_requests?select=*&order=created_at.desc&limit=500");
    return json({ ok: true, requests: rows ?? [] });
  } catch (error) {
    console.error("Rank request list error:", String(error));
    return json({ error: "No se pudieron cargar las solicitudes de rango." }, 500);
  }
}

async function reviewRankRequest(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const id = String(body?.id ?? "").trim();
  const decision = String(body?.decision ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["accept", "reject"].includes(decision)) return json({ error: "Revisa la solicitud y la decisión." }, 400);
  try {
    const rows = await db("police_rank_requests?select=*&id=eq." + enc(id) + "&limit=1");
    const rankRequest = rows?.[0];
    if (!rankRequest) return json({ error: "No se encontró la solicitud de rango." }, 404);
    if (rankRequest.status !== "pending") return json({ error: "Esta solicitud ya fue revisada." }, 409);
    const reviewer = await discord("/guilds/" + GUILD_ID + "/members/" + enc(auth.userId)) as any;
    const reviewerName = String(reviewer.nick || reviewer.user?.global_name || reviewer.user?.username || auth.userId);

    if (decision === "accept") {
      const rankRows = await db("police_rank_roles?select=role_id,role_name,rank_order&order=rank_order.asc");
      const policeOnly = String(rankRequest.requested_rank_name) === POLICE_ONLY_RANK_LABEL;
      const targetRank = policeOnly ? null : (rankRows ?? []).find((rank: any) => String(rank.role_name).trim().toLocaleLowerCase("es") === String(rankRequest.requested_rank_name).trim().toLocaleLowerCase("es"));
      if (!policeOnly && !targetRank) return json({ error: "El rango solicitado ya no está configurado. Actualiza la escala antes de aprobar." }, 409);
      const profiles = await db("police_personnel?select=discord_user_id,unit,plate,rank_role_id,rank_name&discord_user_id=eq." + enc(String(rankRequest.discord_user_id)) + "&limit=1");
      const profile = profiles?.[0];
      if (profile?.unit && profile.unit !== "UCOP") return json({ error: "El miembro ya pertenece a otra unidad; no se modificó su ficha." }, 409);
      const member = await discord("/guilds/" + GUILD_ID + "/members/" + enc(String(rankRequest.discord_user_id))) as any;
      const memberRoles: string[] = member.roles ?? [];
      if ((!memberRoles.includes(PRESELECTION_ROLE_ID) && !memberRoles.includes(POLICE_ROLE_ID)) || memberRoles.includes(CIC_ROLE_ID) || memberRoles.includes(EXPELLED_ROLE_ID)) return json({ error: "La persona no tiene un rol válido de ingreso UCOP para aprobar esta solicitud." }, 409);
      const addedPoliceRole = !memberRoles.includes(POLICE_ROLE_ID);
      if (addedPoliceRole) await discord("/guilds/" + GUILD_ID + "/members/" + enc(String(rankRequest.discord_user_id)) + "/roles/" + POLICE_ROLE_ID, { method: "PUT", body: "{}" });
      const headers = { authorization: req.headers.get("authorization") ?? "", "content-type": "application/json" };
      if (!profile || !profile.unit) {
        if (policeOnly) {
          try {
            await db("police_personnel?on_conflict=discord_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ discord_user_id: rankRequest.discord_user_id, discord_username: rankRequest.discord_username, full_name: rankRequest.character_name, name_ooc: rankRequest.discord_username, plate: rankRequest.plate, unit: "UCOP", rank_name: "Rango pendiente de configuración", rank_role_id: null, status: "active", updated_at: new Date().toISOString() }) });
          } catch (error) {
            if (addedPoliceRole) { try { await discord("/guilds/" + GUILD_ID + "/members/" + enc(String(rankRequest.discord_user_id)) + "/roles/" + POLICE_ROLE_ID, { method: "DELETE" }); } catch (rollbackError) { console.error("Police role rollback failed:", String(rollbackError)); } }
            throw error;
          }
        } else {
          const registerRequest = new Request("https://internal/?panel=personnel-register", { method: "POST", headers, body: JSON.stringify({ discord_user_id: rankRequest.discord_user_id, full_name: rankRequest.character_name, name_ooc: rankRequest.discord_username, plate: rankRequest.plate, unit: "UCOP", rank_role_id: targetRank!.role_id }) });
          const registered = await registerPersonnel(registerRequest);
          const result = await registered.json().catch(() => ({}));
          if (!registered.ok) {
            if (addedPoliceRole) { try { await discord("/guilds/" + GUILD_ID + "/members/" + enc(String(rankRequest.discord_user_id)) + "/roles/" + POLICE_ROLE_ID, { method: "DELETE" }); } catch (rollbackError) { console.error("Police role rollback failed:", String(rollbackError)); } }
            return json({ error: result.error || "No se pudo registrar al agente al aprobar el rango." }, registered.status);
          }
          try {
            await db("police_rank_history", { method: "POST", body: JSON.stringify({ discord_user_id: rankRequest.discord_user_id, discord_username: rankRequest.discord_username, full_name: rankRequest.character_name, action_type: "assignment", previous_role_id: null, previous_rank_name: "", new_role_id: targetRank!.role_id, new_rank_name: String(targetRank!.role_name), reason: "Solicitud aprobada por " + rankRequest.approved_by_name, changed_by_discord_id: auth.userId, changed_by_name: reviewerName, created_at: new Date().toISOString() }) });
          } catch (historyError) { console.error("Initial rank request history write failed:", String(historyError)); }
        }
      } else if (policeOnly) {
        try {
          await db("police_personnel?discord_user_id=eq." + enc(String(rankRequest.discord_user_id)) + "&unit=eq.UCOP", { method: "PATCH", body: JSON.stringify({ full_name: rankRequest.character_name, plate: rankRequest.plate, status: "active", updated_at: new Date().toISOString() }) });
        } catch (error) {
          if (addedPoliceRole) { try { await discord("/guilds/" + GUILD_ID + "/members/" + enc(String(rankRequest.discord_user_id)) + "/roles/" + POLICE_ROLE_ID, { method: "DELETE" }); } catch (rollbackError) { console.error("Police role rollback failed:", String(rollbackError)); } }
          throw error;
        }
      } else {
        const currentRank = (rankRows ?? []).find((rank: any) => rank.role_id === profile.rank_role_id);
        if (currentRank?.role_id === targetRank!.role_id) {
          await db("police_personnel?discord_user_id=eq." + enc(String(rankRequest.discord_user_id)) + "&unit=eq.UCOP", { method: "PATCH", body: JSON.stringify({ full_name: rankRequest.character_name, plate: rankRequest.plate, updated_at: new Date().toISOString() }) });
        } else {
          const actionType = !currentRank ? "assignment" : Number(targetRank!.rank_order) > Number(currentRank.rank_order) ? "promotion" : "demotion";
          const changeRequest = new Request("https://internal/?panel=rank-change", { method: "POST", headers, body: JSON.stringify({ discord_user_id: rankRequest.discord_user_id, action_type: actionType, rank_role_id: targetRank!.role_id, full_name: rankRequest.character_name, name_ooc: rankRequest.discord_username, plate: rankRequest.plate, reason: "Solicitud aprobada por " + rankRequest.approved_by_name }) });
          const changed = await changeRank(changeRequest);
          const result = await changed.json().catch(() => ({}));
          if (!changed.ok) {
            if (addedPoliceRole) { try { await discord("/guilds/" + GUILD_ID + "/members/" + enc(String(rankRequest.discord_user_id)) + "/roles/" + POLICE_ROLE_ID, { method: "DELETE" }); } catch (rollbackError) { console.error("Police role rollback failed:", String(rollbackError)); } }
            return json({ error: result.error || "No se pudo aplicar el rango solicitado." }, changed.status);
          }
        }
      }
      if (memberRoles.includes(PRESELECTION_ROLE_ID)) {
        const convertedAt = new Date().toISOString();
        await db("police_preselections?discord_user_id=eq." + enc(String(rankRequest.discord_user_id)) + "&status=eq.active", {
          method: "PATCH",
          body: JSON.stringify({ status: "converted", converted_at: convertedAt, updated_at: convertedAt }),
        });
        try { await discord("/guilds/" + GUILD_ID + "/members/" + enc(String(rankRequest.discord_user_id)) + "/roles/" + PRESELECTION_ROLE_ID, { method: "DELETE" }); } catch (error) { console.error("Could not remove preselection role after rank approval:", String(error)); }
      }
    }

    const now = new Date().toISOString();
    const status = decision === "accept" ? "accepted" : "rejected";
    const updated = await db("police_rank_requests?id=eq." + enc(id) + "&status=eq.pending", {
      method: "PATCH",
      body: JSON.stringify({ status, reviewed_by_discord_id: auth.userId, reviewed_by_name: reviewerName, updated_at: now, reviewed_at: now, review_reason: String(body?.reason ?? "").trim().slice(0, 500) || null }),
    });
    if (!updated?.length) return json({ error: "La solicitud cambió mientras se revisaba; actualiza la cola." }, 409);
    if (rankRequest.discord_message_id) {
      try {
        await discord("/channels/1539970135375478859/messages/" + enc(String(rankRequest.discord_message_id)), {
          method: "PATCH",
          body: JSON.stringify({ embeds: [{ title: decision === "accept" ? "✅ Solicitud de ingreso UCOP · Aprobada" : "❌ Solicitud de rango · Rechazada", description: "Solicitud de <@" + rankRequest.discord_user_id + "> · " + rankRequest.character_name, fields: [{ name: "Asignación solicitada", value: rankRequest.requested_rank_name }, { name: "Aprobado por", value: rankRequest.approved_by_name }, { name: "Revisado por UCOP", value: reviewerName }, ...(decision === "accept" ? [{ name: "Asignado", value: rankRequest.requested_rank_name === POLICE_ONLY_RANK_LABEL ? "Rol Policía · rango pendiente de configuración" : "Rol Policía + rango" }] : [])], color: decision === "accept" ? 0x45b879 : 0xe87979, footer: { text: "Solicitud " + id } }], allowed_mentions: { parse: [] } }),
        });
      } catch (error) { console.error("Could not update rank request message:", String(error)); }
    }
    await postRankAuditLog(
      decision === "accept" ? "✅ Solicitud aprobada por UCOP" : "❌ Solicitud rechazada por UCOP",
      decision === "accept" ? 0x45b879 : 0xe87979,
      [
        { name: "Persona", value: String(rankRequest.character_name || "Sin nombre") },
        { name: "Discord ID", value: String(rankRequest.discord_user_id) },
        { name: "Placa", value: String(rankRequest.plate || "Sin placa") },
        { name: "Rango solicitado", value: String(rankRequest.requested_rank_name || "Sin rango") },
        { name: decision === "accept" ? "Aprobó" : "Rechazó", value: reviewerName },
        { name: "Entrevistador indicado", value: String(rankRequest.approved_by_name || "No indicado") },
        ...(String(body?.reason ?? "").trim() ? [{ name: "Motivo", value: String(body.reason).trim().slice(0, 1000) }] : []),
      ],
    );
    const policeOnlyRequest = decision === "accept" && rankRequest.requested_rank_name === POLICE_ONLY_RANK_LABEL;
    return json({ ok: true, message: decision !== "accept" ? "Solicitud rechazada." : policeOnlyRequest ? "Solicitud aprobada; rol de Policía asignado. El rango se configurará más adelante." : "Solicitud aprobada; rol de Policía y rango asignados." });
  } catch (error) {
    console.error("Rank request review error:", String(error));
    return json({ error: "No se pudo revisar la solicitud de rango." }, 500);
  }
}

async function changeRank(req: Request) {
  const auth = await allowed(req); if (auth.error) return auth.error;
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const targetId = String(body?.discord_user_id ?? "").trim();
  const targetRoleId = String(body?.rank_role_id ?? "").trim();
  const actionType = String(body?.action_type ?? "");
  const reason = String(body?.reason ?? "").trim().slice(0, 500);
  const requestedName = String(body?.full_name ?? "").trim().slice(0, 100);
  const requestedOoc = String(body?.name_ooc ?? "").trim().slice(0, 100);
  const requestedPlate = String(body?.plate ?? "").trim().slice(0, 30);
  const effectiveDateText = String(body?.effective_date ?? "").trim();
  const effectiveDate = effectiveDateText ? new Date(effectiveDateText + "T00:00:00.000Z") : new Date();
  if (effectiveDateText && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDateText) || !Number.isFinite(effectiveDate.getTime()) || effectiveDateText > new Date().toISOString().slice(0, 10))) return json({ error: "La fecha del movimiento no puede estar en el futuro." }, 400);
  if (!validDiscordId(targetId) || !validDiscordId(targetRoleId) || !["promotion", "demotion", "assignment"].includes(actionType) || reason.length < 3) return json({ error: "Revisa el oficial, el rango y el motivo (mínimo 3 caracteres)." }, 400);
  let oldRoles: string[] = [];
  let didChangeDiscord = false;
  let addedTargetRole = false;
  let nicknameChanged = false;
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
      db("police_personnel?select=*&discord_user_id=eq." + enc(targetId) + "&unit=eq.UCOP&limit=1"),
    ]);
    member = guildMember;
    target = member;
    priorProfile = profiles?.[0] ?? null;
    if (!priorProfile) return json({ error: "El oficial no está registrado como personal UCOP." }, 404);
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
    const username = String(member.user?.global_name || member.user?.username || targetId);
    const fullName = requestedName || String(priorProfile?.full_name || username);
    const actor = await discord("/guilds/" + GUILD_ID + "/members/" + enc(auth.userId)) as any;
    const actorName = String(actor.nick || actor.user?.global_name || actor.user?.username || auth.userId);
    if (!memberRoles.includes(targetRoleId)) { await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId) + "/roles/" + targetRoleId, { method: "PUT", body: "{}" }); addedTargetRole = true; }
    didChangeDiscord = true;
    for (const roleId of oldRoles) await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId) + "/roles/" + roleId, { method: "DELETE" });
    await updatePersonnelNickname(targetId, fullName, requestedPlate || String(priorProfile.plate || ""), "PRIME POLICE UCOP: sincronización de nombre IC y placa al cambiar rango"); nicknameChanged = true;
    const now = new Date().toISOString();
    const effectiveAt = effectiveDate.toISOString();
    const updated = {
      discord_user_id: targetId, discord_username: username, full_name: fullName,
      plate: requestedPlate || priorProfile.plate || "", unit: "UCOP", name_ooc: requestedOoc || priorProfile.name_ooc || "", rank_name: String(targetRank.role_name), rank_role_id: targetRoleId,
      status: "active", source_application_id: priorProfile?.source_application_id ?? null,
      created_at: priorProfile?.created_at ?? now, updated_at: now, last_rank_change_at: effectiveAt,
    };
    await db("police_personnel?on_conflict=discord_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(updated) });
    const previousRank = currentRank ?? (priorProfile?.rank_name ? { role_id: priorProfile.rank_role_id, role_name: priorProfile.rank_name } : null);
    await db("police_rank_history", { method: "POST", body: JSON.stringify({
      discord_user_id: targetId, discord_username: username, full_name: fullName, action_type: actionType,
      previous_role_id: previousRank?.role_id ?? null, previous_rank_name: previousRank?.role_name ?? priorProfile?.rank_name ?? "",
      new_role_id: targetRoleId, new_rank_name: String(targetRank.role_name), reason,
      changed_by_discord_id: auth.userId, changed_by_name: actorName, created_at: effectiveAt,
    }) });
    await postRankAuditLog(
      actionType === "promotion" ? "⬆️ Ascenso de rango" : actionType === "demotion" ? "⬇️ Descenso de rango" : "🏷️ Asignación de rango",
      actionType === "demotion" ? 0xe87979 : 0x45b879,
      [
        { name: "Agente", value: fullName },
        { name: "Discord ID", value: targetId },
        { name: "Placa", value: requestedPlate || String(priorProfile.plate || "Sin placa") },
        { name: "Rango anterior", value: String(currentRank?.role_name || priorProfile.rank_name || "Sin rango") },
        { name: "Rango nuevo", value: String(targetRank.role_name) },
        { name: "Fecha efectiva", value: effectiveAt.slice(0, 10) },
        { name: "Autorizó", value: actorName },
        { name: "Motivo", value: reason },
      ],
    );
    return json({ ok: true, message: (actionType === "promotion" ? "Ascenso" : actionType === "demotion" ? "Descenso" : "Rango asignado") + " aplicado. Apodo de Discord sincronizado como " + personnelNickname(fullName, requestedPlate || String(priorProfile.plate || "")) + "." });
  } catch (error) {
    console.error("Rank change failed:", String(error));
    if (didChangeDiscord && target) {
      try {
        if (nicknameChanged) await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId), { method: "PATCH", body: JSON.stringify({ nick: member?.nick ?? null }) });
        if (addedTargetRole) await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId) + "/roles/" + targetRoleId, { method: "DELETE" });
        for (const roleId of oldRoles) await discord("/guilds/" + GUILD_ID + "/members/" + enc(targetId) + "/roles/" + roleId, { method: "PUT", body: "{}" });
        if (priorProfile) await db("police_personnel?discord_user_id=eq." + enc(targetId), { method: "PATCH", body: JSON.stringify(priorProfile) });
        else await db("police_personnel?discord_user_id=eq." + enc(targetId), { method: "DELETE" });
      } catch (rollbackError) { console.error("Rank change rollback failed:", String(rollbackError)); }
    }
    const message = String(error);
    if (message.includes("Discord API 403") || message.includes("50013")) return json({ error: "Discord denegó el cambio. El bot necesita Administrar roles y Gestionar apodos, y su rol debe estar por encima del rango." }, 502);
    if (message.includes("Discord API 404") || message.includes("10007")) return json({ error: "No se encontró al oficial en el servidor." }, 404);
    return json({ error: "No se pudo completar el cambio de rango; revisa los permisos del bot y la base de datos." }, 502);
  }
}

export async function handleHr(req: Request, action: string): Promise<Response | null> {
  if (action === "personnel" && req.method === "GET") return await listPersonnel(req);
  if (action === "preselections" && req.method === "GET") return await listPreselections(req);
  if (action === "personnel-register" && req.method === "POST") return await registerPersonnel(req);
  if (action === "personnel-delete" && req.method === "POST") return await deletePersonnel(req);
  if (action === "rank-config" && req.method === "GET") return await rankConfig(req);
  if (action === "rank-config-save" && req.method === "POST") return await saveRankConfig(req);
  if (action === "rank-config-import-all" && req.method === "POST") return await importAllRankRoles(req);
  if (action === "rank-history" && req.method === "GET") return await rankHistory(req);
  if (action === "rank-requests" && req.method === "GET") return await listRankRequests(req);
  if (action === "rank-request-review" && req.method === "POST") return await reviewRankRequest(req);
  if (action === "rank-change" && req.method === "POST") return await changeRank(req);
  return null;
}
