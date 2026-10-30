import { parseApplicationIdentity } from "../_shared/application-identity.ts";
import { scheduleAcceptedPublicList } from "./public-accepted.ts";
import { preparePlate } from "./plates.ts";
import { manageAbsences } from "./absences.ts";
import { listPagedRecords } from "./paged-records.ts";
import { createPanelSession, authenticatePanelSession, sessionRoutes, rateLimitRequest } from "./panel-sessions.ts";
import { discordRequest, discordFailure } from "./discord-client.ts";
import { interceptChanges } from "./change-requests.ts";
import { writeAudit } from "./audit-events.ts";
import { withOperationLock } from "./operation-lock.ts";
import { accessMember } from "./access-member.ts";
import { handleHr } from "./hr.ts";

const GUILD_ID = "1539970134469378068";
const LEGACY_APPLICATION_CHANNEL_ID = "1539970136683847857";
const RANK_AUDIT_CHANNEL_ID = "1539970137246142604";
const POLICE_ROLE_ID = "1539970134482092038";
const PRESELECTION_ROLE_ID = "1564685481457877012";
const TRANSFER_ROLE_ID = "1564907324638888017";
const APPLICATION_ID = "1540484542354428025";
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_OAUTH_CLIENT_SECRET = Deno.env.get("DISCORD_OAUTH_CLIENT_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DISCORD_OAUTH_CALLBACK = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/prime-police-panel?panel=oauth-callback";
const PANEL_SITE_URL = "https://primepolicerp.github.io/PRIME-POLICE/";
const PANEL_ORIGIN = "https://primepolicerp.github.io";
const PANEL_SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": PANEL_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};
const encoder = new TextEncoder();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });

const db = async (path: string, init: RequestInit = {}) => {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Server database credentials unavailable");
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    signal:init.signal??AbortSignal.timeout(12000),
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error("Database " + res.status + ": " + JSON.stringify(body));
  return body;
};

const discord = discordRequest;

async function sendPrivateDiscordMessage(userId: string, payload: Record<string, unknown>) {
  const channel = await discord("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: userId }),
  }) as any;
  if (!channel?.id) throw new Error("Discord did not create a private channel");
  return await discord("/channels/" + encodeURIComponent(String(channel.id)) + "/messages", {
    method: "POST",
    body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
  });
}

async function postAuditLog(title: string, color: number, fields: Array<{ name: string; value: string; inline?: boolean }>, footer = "PRIME POLICE · Auditoría UCOP") {
  await writeAudit(title,fields);
  try {
    await discord("/channels/" + RANK_AUDIT_CHANNEL_ID + "/messages", {
      method: "POST",
      body: JSON.stringify({
        embeds: [{ title, color, fields: fields.map((field) => ({ name: field.name.slice(0, 256), value: field.value.slice(0, 1024), inline: field.inline ?? true })), timestamp: new Date().toISOString(), footer: { text: footer } }],
        allowed_mentions: { parse: [] },
      }),
    });
  } catch (error) {
    console.error("Audit log could not be posted:", String(error));
  }
}

async function ensureSlashCommands() {
  const path = "/applications/" + APPLICATION_ID + "/guilds/" + GUILD_ID + "/commands";
  const desired = [
    { name: "postulacion", description: "Abrir el formulario privado para postularte a PRIME POLICE" },
    { name: "traslado", description: "Abrir el formulario privado de traslado a PRIME POLICE" },
    { name: "publicar_postulaciones", description: "Actualizar paneles de postulación y rango UCOP" },
  ];
  const existing = await discord(path) as any[];
  for (const command of existing ?? []) {
    if (command.name === "panel_codigo") {
      await discord(path + "/" + command.id, { method: "DELETE" });
    }
  }
  for (const command of desired) {
    const found = (existing ?? []).find((item: any) => item.name === command.name);
    if (found) {
      if (found.description !== command.description) {
        await discord(path + "/" + found.id, { method: "PATCH", body: JSON.stringify(command) });
      }
    } else {
      await discord(path, { method: "POST", body: JSON.stringify(command) });
    }
  }
}

function base64urlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64urlDecode(value: string) {
  const base = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - base.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function signSession(userId: string, req: Request) { return createPanelSession(userId,req); }
async function authenticate(req: Request): Promise<string|null> { return authenticatePanelSession(req); }

async function login(req: Request) {
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "El servidor no tiene configuradas todas las credenciales necesarias." }, 503);
  }
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) {
    return json({ error: "Código inválido o caducado. Genera uno nuevo en Discord." }, 401);
  }
  try {
    const hash = await sha256Hex(code);
    const rows = await db(
      "police_panel_login_codes?select=id,discord_user_id,expires_at,used_at&code_hash=eq." +
      hash + "&used_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()) + "&limit=1",
    );
    const row = rows?.[0];
    // El código solo lo emite prime-police-discord tras validar al usuario/rol de staff en Discord.
    // El código solo inicia sesión; cada acción del panel vuelve a comprobar los roles gestores.
    if (!row) {
      return json({ error: "Código inválido, usado o caducado. Genera uno nuevo en Discord." }, 401);
    }
    const consumed = await db(
      "police_panel_login_codes?id=eq." + encodeURIComponent(row.id) + "&used_at=is.null",
      { method: "PATCH", body: JSON.stringify({ used_at: new Date().toISOString() }) },
    );
    if (!consumed?.length) return json({ error: "Ese código ya se utilizó. Genera uno nuevo en Discord." }, 409);
    return json({ token: await signSession(row.discord_user_id,req), expires_in: 43200 });
  } catch (e) {
    console.error("Panel login error:", String(e));
    return json({ error: "No se pudo iniciar sesión. Revisa la configuración del servidor." }, 500);
  }
}

function siteRedirect(params: Record<string, string>, clearStateCookie = false) {
  const destination = new URL(PANEL_SITE_URL);
  for (const [key, value] of Object.entries(params)) destination.searchParams.set(key, value);
  const headers = new Headers({ Location: destination.toString(), "Cache-Control": "no-store" });
  if (clearStateCookie) headers.append("Set-Cookie", "prime_police_oauth_state=; Path=/functions/v1/prime-police-panel; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  return new Response(null, { status: 302, headers });
}

function cookieValue(req: Request, name: string) {
  const cookie = req.headers.get("cookie") ?? "";
  const entry = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
  if (!entry) return "";
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return ""; }
}

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

function randomLoginCode() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => PANEL_SESSION_CODE_ALPHABET[byte % PANEL_SESSION_CODE_ALPHABET.length]).join("");
}

function startDiscordOAuth() {
  if (!DISCORD_OAUTH_CLIENT_SECRET || !BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
    return siteRedirect({ auth_error: "oauth_not_configured" });
  }
  const state = randomState();
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", APPLICATION_ID);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("redirect_uri", DISCORD_OAUTH_CALLBACK);
  authorize.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": "prime_police_oauth_state=" + encodeURIComponent(state) + "; Path=/functions/v1/prime-police-panel; Max-Age=600; HttpOnly; Secure; SameSite=Lax",
    },
  });
}

async function finishDiscordOAuth(req: Request) {
  const params = new URL(req.url).searchParams;
  if (params.get("error")) return siteRedirect({ auth_error: "oauth_cancelled" }, true);
  const issuer = params.get("iss");
  if (issuer && issuer !== "https://discord.com") return siteRedirect({ auth_error: "oauth_issuer_invalid" }, true);
  const state = params.get("state") ?? "";
  if (!state || state !== cookieValue(req, "prime_police_oauth_state")) {
    return siteRedirect({ auth_error: "oauth_state_invalid" }, true);
  }
  const code = params.get("code") ?? "";
  if (!code || !DISCORD_OAUTH_CLIENT_SECRET) return siteRedirect({ auth_error: "oauth_not_configured" }, true);

  try {
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APPLICATION_ID,
        client_secret: DISCORD_OAUTH_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_OAUTH_CALLBACK,
      }),
    });
    const tokenData = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenData?.access_token) {
      console.error("Discord OAuth token exchange failed:", tokenResponse.status);
      return siteRedirect({ auth_error: "oauth_exchange_failed" }, true);
    }

    const identityResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const identity = await identityResponse.json().catch(() => null);
    if (!identityResponse.ok || !/^\d{17,20}$/.test(String(identity?.id ?? ""))) {
      return siteRedirect({ auth_error: "oauth_identity_failed" }, true);
    }

    const member = await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(String(identity.id))) as any;
    const roles: string[] = member?.roles ?? [];
    if (!roles.some((role) => MANAGER_ROLE_IDS.has(role))) {
      return siteRedirect({ auth_error: "role_not_authorized" }, true);
    }

    const oneTimeCode = randomLoginCode();
    await db("police_panel_login_codes", {
      method: "POST",
      body: JSON.stringify({
        code_hash: await sha256Hex(oneTimeCode),
        discord_user_id: String(identity.id),
        expires_at: new Date(Date.now() + 90 * 1000).toISOString(),
      }),
    });
    return siteRedirect({ oauth_code: oneTimeCode }, true);
  } catch (error) {
    console.error("Discord OAuth login failed:", String(error));
    return siteRedirect({ auth_error: "oauth_login_failed" }, true);
  }
}

async function listApplications(req: Request) {
  const userId = await authorizedUser(req);
  if (!userId) return json({ error: "Sesión caducada o sin permisos de gestión." }, 403);
  try {
    const applications = await db(
      "police_applications?select=id,discord_user_id,discord_username,full_name,age,previous_experience,motivation,availability,status,decision_reason,reviewed_by_name,created_at,reviewed_at,role_assigned_at,discord_message_id,attempt_number,answers&order=created_at.desc&limit=100",
    );
    return json({ ok: true, applications: applications ?? [] });
  } catch (e) {
    console.error("Panel list error:", String(e));
    return json({ error: "No se pudieron cargar las candidaturas." }, 500);
  }
}

async function listTransfers(req: Request) {
  const userId = await authorizedUser(req);
  if (!userId) return json({ error: "Sesión caducada o sin permisos de gestión." }, 403);
  try {
    const transfers = await db("police_transfer_applications?select=*&order=created_at.desc&limit=100");
    return json({ ok: true, transfers: transfers ?? [] });
  } catch (e) {
    console.error("Transfer list error:", String(e));
    return json({ error: "No se pudieron cargar las solicitudes de traslado." }, 500);
  }
}

async function setCandidateNickname(userId: string, fullName: unknown): Promise<string> {
  const name = String(fullName ?? "").split(/\r?\n|\|/)[0]
    .replace(/^nombre\s*(?:ic)?\s*:\s*/i, "").replace(/\s+/g, " ").trim();
  if (!name) return "La solicitud se aceptó, pero no tiene un nombre IC válido para cambiar el apodo.";
  try {
    await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(userId), {
      method: "PATCH", body: JSON.stringify({ nick: Array.from(name).slice(0, 32).join("") }),
      headers: { "X-Audit-Log-Reason": "PRIME POLICE: nombre IC al aceptar candidatura o traslado" },
    });
    return "";
  } catch (error) {
    console.error("Candidate nickname update failed:", userId, String(error));
    return "La solicitud se aceptó, pero no se pudo cambiar el apodo en Discord. Comprueba que el bot tenga Gestionar apodos y un rol superior al de la persona. El propietario del servidor debe cambiar su apodo manualmente.";
  }
}

async function decideTransfer(req: Request) {
  const reviewerId = await authorizedUser(req);
  if (!reviewerId) return json({ error: "Sesión caducada o sin permisos de gestión." }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const id = String(body?.id ?? "");
  const action = String(body?.action ?? "");
  const reason = String(body?.reason ?? "").trim().slice(0, 500);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !["accept", "reject"].includes(action)) return json({ error: "Solicitud o decisión inválida." }, 400);
  try {
    const rows = await db("police_transfer_applications?select=*&id=eq." + encodeURIComponent(id) + "&limit=1");
    const item = rows?.[0];
    if (!item) return json({ error: "No se encontró esa solicitud de traslado." }, 404);
    if (item.status !== "pending") return json({ error: "Esta solicitud ya fue revisada." }, 409);
    if (action === "accept") {
      try { await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(item.discord_user_id) + "/roles/" + TRANSFER_ROLE_ID, { method: "PUT", body: JSON.stringify({}) }); }
      catch (e) {
        const detail = String(e);
        if (detail.includes("403") || detail.includes("50013")) return json({ error: "Discord denegó el rol. El bot necesita Administrar roles y estar por encima del rol Traslado." }, 502);
        if (detail.includes("404") || detail.includes("10007")) return json({ error: "No se encontró a esta persona en el servidor." }, 502);
        return json({ error: "No se pudo asignar el rol Traslado." }, 502);
      }
    }
    let reviewerName = reviewerId;
    try { const reviewer = await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(reviewerId)) as any; reviewerName = String(reviewer.nick || reviewer.user?.global_name || reviewer.user?.username || reviewerId); } catch { /* use ID */ }
    const now = new Date().toISOString();
    const updated = await db("police_transfer_applications?id=eq." + encodeURIComponent(id) + "&status=eq.pending", { method: "PATCH", body: JSON.stringify({ status: action === "accept" ? "accepted" : "rejected", decision_reason: reason, reviewed_by_discord_id: reviewerId, reviewed_by_name: reviewerName, reviewed_at: now, ...(action === "accept" ? { role_assigned_at: now } : {}) }) });
    if (!updated?.length) return json({ error: "La solicitud cambió durante la revisión. Actualiza la lista." }, 409);
    if(action==='accept')scheduleAcceptedPublicList();
    const nicknameWarning = action === "accept" ? await setCandidateNickname(String(item.discord_user_id), item.full_name) : "";
    await postAuditLog(action === "accept" ? "✅ Traslado aceptado" : "❌ Traslado rechazado", action === "accept" ? 0x45b879 : 0xe87979, [
      { name: "Agente", value: String(item.full_name || item.discord_username) },
      { name: "Procedencia", value: String(item.source_city) + " · " + String(item.source_faction) },
      { name: "Discord ID", value: String(item.discord_user_id) },
      { name: "Decisión por", value: reviewerName },
      ...(reason ? [{ name: "Motivo", value: reason }] : []),
    ]);
    let notified = false;
    try {
      const accepted = action === "accept";
      let description = accepted
        ? "RRHH UCOP aceptó tu solicitud y te asignó el rol Traslado. Contacta con UCOP para coordinar tu entrevista IC."
        : "RRHH UCOP revisó tu solicitud de traslado y, por el momento, no fue aprobada." + (reason ? "\nMotivo: " + reason : "");
      await sendPrivateDiscordMessage(String(item.discord_user_id), { embeds: [{ title: accepted ? "🚔 Traslado aceptado · PRIME POLICE" : "📋 Resultado de solicitud de traslado", description, color: accepted ? 0x45b879 : 0xd5ad5a }] });
      notified = true;
    } catch (e) { console.error("Private transfer result DM failed:", String(e)); }
    return json({ ok: true, status: updated[0].status, role_assigned: action === "accept", nickname_updated: action === "accept" ? !nicknameWarning : undefined, results_notified: notified, warning: [nicknameWarning, notified ? "" : "La decisión se guardó, pero no se pudo enviar el resultado por privado. Comprueba que la persona permita mensajes directos."].filter(Boolean).join(" ") || undefined });
  } catch (e) {
    console.error("Transfer decision error:", String(e));
    return json({ error: "No se pudo guardar la decisión." }, 500);
  }
}

async function decide(req: Request) {
  const reviewerId = await authorizedUser(req);
  if (!reviewerId) return json({ error: "Sesión caducada o sin permisos de gestión." }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const id = String(body?.id ?? "");
  const action = String(body?.action ?? "");
  const reason = String(body?.reason ?? "").trim().slice(0, 500);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      !["accept", "reject"].includes(action)) {
    return json({ error: "Candidatura o acción inválida." }, 400);
  }

  let app: any;
  let finalApp: any;
  let preselectionSynced = true;
  let isNewDecision = false;
  let nicknameWarning = "";
  try {
    const rows = await db(
      "police_applications?select=*&id=eq." + encodeURIComponent(id) + "&limit=1",
    );
    app = rows?.[0];
    if (!app) return json({ error: "No se encontró esa candidatura." }, 404);
    app = {...app, full_name: parseApplicationIdentity(app.full_name, app.answers || {}).name};

    const retryRole = action === "accept" && app.status === "accepted" && !app.role_assigned_at;
    isNewDecision = app.status === "pending";
    if (action === "reject" && app.status !== "pending") {
      return json({ error: "Esta candidatura ya fue revisada y no se ha cambiado." }, 409);
    }
    if (action === "accept" && app.status !== "pending" && !retryRole) {
      return json({ error: "Esta candidatura ya está aceptada y el rol consta como asignado." }, 409);
    }

    if (action === "accept") {
      try {
        await discord(
          "/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(app.discord_user_id) +
          "/roles/" + PRESELECTION_ROLE_ID,
          { method: "PUT", body: JSON.stringify({}) },
        );
      } catch (e) {
        const detail = String(e);
        console.error("Panel role assignment error:", detail);
        if (detail.includes("403") || detail.includes("50013")) {
          return json({ error: "Discord ha denegado el rol. El bot necesita Administrar roles y su rol debe estar por encima de Preselección." }, 502);
        }
        if (detail.includes("404") || detail.includes("10007")) {
          return json({ error: "No se encontró al usuario en el servidor. Comprueba su ID y que siga dentro de Discord." }, 502);
        }
        return json({ error: "No se pudo asignar el rol en Discord; la candidatura no se ha marcado como aceptada." }, 502);
      }
    }

    const now = new Date().toISOString();
    let patch: Record<string, unknown>;
    let filter: string;
    if (action === "accept") {
      patch = {
        ...(app.status === "pending" ? {
          status: "accepted",
          reviewed_by_discord_id: reviewerId,
          reviewed_by_name: "Panel web",
          reviewed_at: now,
        } : {}),
        role_assigned_at: now,
        ...(reason ? { decision_reason: reason } : {}),
      };
      filter = app.status === "pending"
        ? "&status=eq.pending"
        : "&status=eq.accepted&role_assigned_at=is.null";
    } else {
      patch = {
        status: "rejected",
        reviewed_by_discord_id: reviewerId,
        reviewed_by_name: "Panel web",
        reviewed_at: now,
        decision_reason: reason,
      };
      filter = "&status=eq.pending";
    }
    const updated = await db(
      "police_applications?id=eq." + encodeURIComponent(id) + filter,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    if (!updated?.length) {
      return json({ error: "La candidatura cambió durante la operación. Actualiza la lista antes de volver a intentarlo." }, 409);
    }
    finalApp = updated[0];
    if (action === "accept") {
      nicknameWarning = await setCandidateNickname(String(app.discord_user_id), app.full_name);
      try {
        await db("police_preselections?on_conflict=discord_user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ discord_user_id: String(app.discord_user_id), discord_username: String(app.discord_username ?? ""), full_name: String(app.full_name ?? ""), source_application_id: app.id, status: "active", accepted_at: finalApp.reviewed_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }) });
      } catch (e) { preselectionSynced = false; console.error("Preselection record creation failed:", String(e)); }
    }
    let reviewerName = reviewerId;
    try {
      const reviewer = await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(reviewerId)) as any;
      reviewerName = String(reviewer.nick || reviewer.user?.global_name || reviewer.user?.username || reviewerId);
    } catch (e) { console.error("Could not resolve application reviewer name:", String(e)); }
    await postAuditLog(
      action === 'accept' ? '🛡️ PRIME POLICE · Preselección aprobada' : '❌ Postulación rechazada',
      action === 'accept' ? 0x4d98c9 : 0xe87979,
      action === 'accept' ? [
        {name:'CUENTA DE DISCORD',value:'<@'+app.discord_user_id+'> · '+String(app.discord_username||''),inline:false},
        {name:'Nombre del personaje',value:String(app.full_name||'No indicado')},
        {name:'Asignación',value:'<@&'+PRESELECTION_ROLE_ID+'>'},
        {name:'Revisada por',value:'<@'+reviewerId+'>\n'+reviewerName},
        {name:'Siguiente paso',value:'Entrevista IC con UCOP · Intento '+String(app.attempt_number||1)+' de 3',inline:false},
        ...(reason?[{name:'Observaciones',value:reason,inline:false}]:[])
      ] : [
        {name:'Postulante',value:String(app.full_name||app.discord_username||'Sin nombre')},
        {name:'Discord ID',value:String(app.discord_user_id)},
        {name:'Decisión por',value:reviewerName},
        {name:'Intento',value:String(app.attempt_number||1)+'/3'},
        ...(reason?[{name:'Motivo',value:reason}]:[])
      ],
      action==='accept'?'PRIME POLICE · RR. HH. · Selección y entrevistas':'PRIME POLICE · Auditoría UCOP'
    );
  } catch (e) {
    console.error("Panel decision database error:", String(e));
    return json({ error: "No se pudo guardar la decisión en la base de datos." }, 500);
  }

  if(action==='accept'&&isNewDecision)scheduleAcceptedPublicList();
  // Full application answers stay private; only names and Discord accounts enter the public list.
  const oldMessageId = String(app.discord_message_id ?? "");
  if (oldMessageId) {
    try {
        await discord("/channels/" + LEGACY_APPLICATION_CHANNEL_ID + "/messages/" + encodeURIComponent(oldMessageId), { method: "DELETE" });
    } catch (error) { console.error("Could not redact old application message:", String(error)); }
  }

  let resultsNotified = !isNewDecision;
  if (isNewDecision) {
    const attempt = Math.max(1, Number(app.attempt_number) || 1);
    const remaining = Math.max(0, 3 - attempt);
    const accepted = action === "accept";
    let description = accepted
      ? "RRHH UCOP aceptó tu postulación y te asignó el rol Preselección. UCOP coordinará contigo una entrevista IC. Después de aprobarla, podrás solicitar el rol Policía y el rango correspondiente."
      : remaining > 0
        ? "Gracias por tu tiempo y por querer formar parte de PRIME POLICE. En esta ocasión no has sido seleccionado. No te desanimes: puedes prepararte y volver a intentarlo. Te quedan **" + remaining + " de 3 intentos**."
        : "Gracias por tu esfuerzo y por postularte a PRIME POLICE. En esta ocasión no has sido seleccionado. Has utilizado tus **3 de 3 intentos**, así que no podrás enviar otra postulación. Te animamos a seguir participando en la comunidad y te deseamos lo mejor.";
    if (!accepted && remaining > 0) {
      const waitHours = attempt === 1 ? 12 : 48;
      const reviewedAt = Date.parse(String(finalApp.reviewed_at || ""));
      const retryAt = Math.ceil(((Number.isFinite(reviewedAt) ? reviewedAt : Date.now()) + waitHours * 3600000) / 1000);
      description += "\n\nDebes esperar **" + waitHours + " horas** desde este rechazo. Podrás volver a postularte <t:" + retryAt + ":F> (<t:" + retryAt + ":R>).";
    }
    try {
      await sendPrivateDiscordMessage(String(app.discord_user_id), {
        embeds: [{ title: accepted ? "🎉 Resultado de postulación · Aceptada" : "📋 Resultado de postulación · PRIME POLICE", description, color: accepted ? 0x45b879 : 0xd5ad5a, footer: { text: "RRHH UCOP · Intento " + attempt + "/3 · Mensaje privado" } }],
      });
      resultsNotified = true;
    } catch (error) {
      console.error("Could not DM application result:", String(error));
    }
  }
  return json({
    ok: true,
    status: finalApp.status,
    role_assigned: action === "accept" && Boolean(finalApp.role_assigned_at),
    nickname_updated: action === "accept" ? !nicknameWarning : undefined,
    results_notified: resultsNotified,
    warning: [nicknameWarning, !preselectionSynced
      ? "La candidatura se aceptó, pero no se guardó en la base de preseleccionados. Avísale a un administrador para revisar el registro."
      : "", resultsNotified ? "" : "La decisión se guardó, pero no se pudo enviar por privado. Comprueba que la persona permita mensajes directos."].filter(Boolean).join(" ") || undefined,
  });
}

async function routePanel(req: Request): Promise<Response> {
 try {
  const action = new URL(req.url).searchParams.get("panel");
  const origin = req.headers.get("origin");
  if (action !== "oauth-callback" && origin && origin !== PANEL_ORIGIN) return json({ error: "Origen no autorizado." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (action === "oauth-start" && req.method === "GET") return startDiscordOAuth();
  if (action === "oauth-callback" && req.method === "GET") return await finishDiscordOAuth(req);
  if (action === "login" && req.method === "POST") return await login(req);
  if (action === "me" && req.method === "GET") return await currentUser(req);
  if(['absence-summary','absence-review','absence-roster','absence-register'].includes(action||'')){const actor=await authorizedUser(req);if(!actor)return json({error:'Sesión caducada o sin permisos de gestión.'},403);return manageAbsences(req,action,actor,{db,json,notify:sendPrivateDiscordMessage,audit:postAuditLog});}
  if (action === "records") { if(!await authorizedUser(req))return json({error:'Sesión caducada o sin permisos de gestión.'},403);return listPagedRecords(req,json); }
  if (action === "data" && req.method === "GET") return await listApplications(req);
  if (action === "decision" && req.method === "POST") return await decide(req);
  if (action === "transfers" && req.method === "GET") return await listTransfers(req);
  if (action === "transfer-decision" && req.method === "POST") return await decideTransfer(req);
  if (action === "sanctions" && req.method === "GET") return await listSanctions(req);
  if (action === "sanction" && req.method === "POST") return await createSanction(req);
  if (action === "sanction-delete" && req.method === "POST") return await deleteSanction(req);
  const hrResponse = await handleHr(req, action ?? "");
  if (hrResponse) return hrResponse;
  if (action) return json({ error: "Acción de panel no reconocida." }, 404);
  if (req.method === "GET") {
    return json({
      ok: true,
      service: "PRIME POLICE · Panel API",
      login: "Inicio de sesión OAuth2 con Discord y comprobación de roles UCOP, Directiva, Gobierno, Staff y Dev Discord.",
      oauth_redirect_uri: DISCORD_OAUTH_CALLBACK,
      commands_status: "managed_separately",
      configured: { discord: Boolean(BOT_TOKEN), database: Boolean(SUPABASE_URL && SERVICE_KEY), discord_oauth: Boolean(DISCORD_OAUTH_CLIENT_SECRET) },

      version: "preselection-direct-ingress-2026-10-29h",
    });
  }
  return json({ error: "Método no permitido." }, 405);
 } catch(error) { console.error("Panel request failed",String(error));return json({error:"No se pudo comprobar el acceso con Discord en este momento. Tu sesión no se ha cerrado. Reintenta en unos segundos."},503); }
}
async function dispatchWithLocks(req:Request):Promise<Response>{
 const action=new URL(req.url).searchParams.get("panel")||"";
 const guarded=["rank-change","personnel-register","preselection-admit","transfer-admit","rank-request-review","rank-request-edit","rank-authorization-review","decision","transfer-decision","sanction","sanction-delete","nickname-sync","personnel-delete","shift-close","shift-delete","absence-review","absence-register","rank-config-save","rank-config-import-all"];
 if(req.method!=="POST"||!guarded.includes(action))return routePanel(req);
 try{
  if(!await authenticate(req))return json({error:"La sesión caducó. Entra nuevamente con Discord."},401);
  const body=await req.clone().json();let target=String(body.discord_user_id||"");
  const lookups:Record<string,[string,string]>={decision:["police_applications","discord_user_id"],"transfer-decision":["police_transfer_applications","discord_user_id"],"rank-request-review":["police_rank_requests","discord_user_id"],"rank-request-edit":["police_rank_requests","discord_user_id"],"rank-authorization-review":["police_rank_authorizations","target_id"],"sanction-delete":["police_sanctions","discord_user_id"],"shift-close":["police_duty_shifts","discord_user_id"],"shift-delete":["police_duty_shifts","discord_user_id"],"absence-review":["police_absence_requests","discord_user_id"]};
  if(lookups[action]){const id=String(body.id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Identificador inválido."},400);const [table,field]=lookups[action];const rows=await db(table+"?select="+field+"&id=eq."+encodeURIComponent(id)+"&limit=1");if(!rows?.length)return json({error:"No se encontró el registro."},404);target=String(rows[0][field]);}
  if(action.startsWith("rank-config-"))return withOperationLock("rank-scale",()=>routePanel(req));
  if(!/^\d{17,20}$/.test(target))return json({error:"Usuario inválido."},400);
  return withOperationLock("personnel:"+target,()=>routePanel(req));
 }catch(error){console.error("Guarded request:",String(error));return json({error:"No se pudo preparar la operación. Comprueba las migraciones y vuelve a consultar el registro."},503);}
}

async function dispatchHttp(req:Request):Promise<Response>{try{
 const action=new URL(req.url).searchParams.get('panel')||'',origin=req.headers.get('origin');
 if(action!=='oauth-callback'&&origin&&origin!==PANEL_ORIGIN)return json({error:'Origen no autorizado.'},403);
 if(req.method==='OPTIONS')return routePanel(req);
 if(!await rateLimitRequest(req,action))return json({error:'Demasiadas peticiones. Espera un minuto antes de volver a intentarlo.'},429);
 const sessionResponse=await sessionRoutes(req,action,json);if(sessionResponse)return sessionResponse;
 const prepared=await preparePlate(req,action,db,authorizedUser);if(prepared instanceof Response)return prepared;
 const assignedPlate=prepared!==req?String((await prepared.clone().json()).plate||''):'';req=prepared;
 const intercepted=await interceptChanges(req,action,{db,authorizedUser,discord,dispatch:routePanel,json});
 const result=intercepted||await dispatchWithLocks(req);
 if(assignedPlate&&result.ok){const body=await result.json();return new Response(JSON.stringify({...body,assigned_plate:assignedPlate}),{status:result.status,headers:result.headers});}
 return result;
 }catch(error){console.error('Request dispatch:',String(error));const upstream=discordFailure(error);return upstream?json(upstream.body,upstream.status):json({error:'No se pudo procesar la petición. Comprueba la conexión y actualiza el registro.'},503);}}
Deno.serve(async(req:Request)=>{const started=performance.now(),requestId=crypto.randomUUID();const response=await dispatchHttp(req);const headers=new Headers(response.headers);headers.set('X-Request-ID',requestId);headers.set('Access-Control-Expose-Headers','X-Request-ID');console.info('panel_request',JSON.stringify({request_id:requestId,action:new URL(req.url).searchParams.get('panel')||'health',method:req.method,status:response.status,elapsed_ms:Math.round(performance.now()-started)}));return new Response(response.body,{status:response.status,headers});});
const WARN_ROLE_IDS = ["1539970134482092032", "1539970134469378077", "1539970134469378076"];
const STRIKE_ROLE_IDS = ["1539970134469378075", "1539970134469378074", "1539970134469378073"];
const EXPELLED_ROLE_ID = "1539970134482092034";
const WARNING_CHANNEL_ID = "1539970136512143482";
const STRIKE_CHANNEL_ID = "1539970136512143481";
const MANAGER_ROLE_IDS = new Set([
  "1539970134565982313", "1539970134544748562", "1539970134544748556",
  "1539970134544748557", "1539970134519578773", "1539970134519578774",
]);
const MANAGER_ROLE_LABELS = new Map([
  ["1539970134565982313", "Gobierno · Alta Directiva"],
  ["1539970134544748562", "Directiva"],
  ["1539970134544748556", "Staff"],
  ["1539970134544748557", "Dev Discord"],
  ["1539970134519578773", "UCOP · Asuntos Internos"],
  ["1539970134519578774", "Directiva"],
]);
const authorizedRequests = new WeakMap<Request,string|null>();
async function authorizedUser(req: Request): Promise<string | null> {
  if(authorizedRequests.has(req))return authorizedRequests.get(req)!;
  const userId = await authenticate(req);
  if (!userId) return null;
  try {
    const member = await accessMember(userId,req.method!=="GET");
    const result=(member.roles ?? []).some((role: string) => MANAGER_ROLE_IDS.has(role)) ? userId : null; authorizedRequests.set(req,result);return result;
  } catch (e) {
    console.error("Manager role verification failed:", String(e));
    if(String(e).includes("404"))return null;throw e;
  }
}

async function currentUser(req: Request) {
  const userId = await authorizedUser(req);
  if (!userId) return json({ error: "Tu sesión expiró o ya no tienes un rol autorizado." }, 403);
  try {
    const member = await accessMember(userId,req.method!=="GET");
    const user = member?.user ?? {};
    const username = String(user.username ?? "Discord");
    const displayName = String(user.global_name ?? username);
    const avatarHash = String(user.avatar ?? "");
    const guildAvatarHash = String(member?.avatar ?? "");
    const avatarUrl = guildAvatarHash
      ? "https://cdn.discordapp.com/guilds/" + GUILD_ID + "/users/" + userId + "/avatars/" + guildAvatarHash + (guildAvatarHash.startsWith("a_") ? ".gif" : ".png") + "?size=128"
      : avatarHash
      ? "https://cdn.discordapp.com/avatars/" + userId + "/" + avatarHash + (avatarHash.startsWith("a_") ? ".gif" : ".png") + "?size=128"
      : "https://cdn.discordapp.com/embed/avatars/" + String(Number((BigInt(userId) >> 22n) % 6n)) + ".png";
    const roles: string[] = member?.roles ?? [];
    const accessRoles = roles.filter((role) => MANAGER_ROLE_IDS.has(role)).map((role) => MANAGER_ROLE_LABELS.get(role) ?? "Gestión autorizada");
    return json({ user: { id: userId, username, display_name: displayName, avatar_url: avatarUrl, access_roles: accessRoles, can_manage_shifts_direct: roles.some((id:string)=>["1539970134565982313","1539970134544748562","1539970134519578774","1539970134519578773"].includes(id)), can_authorize_promotions: roles.some((id:string)=>["1539970134565982313","1539970134544748562","1539970134519578774"].includes(id)) } });
  } catch (e) {
    console.error("Discord profile lookup failed:", String(e));
    return json({ error: "No se pudo cargar tu perfil de Discord." }, 502);
  }
}

async function listSanctions(req: Request) {
  const userId = await authorizedUser(req);
  if (!userId) return json({ error: "No tienes un rol autorizado para gestionar sanciones." }, 403);
  try {
    const personnel = await db("police_personnel?select=discord_user_id&unit=in.(POLICIA,UCOP,CIC)&limit=500");
    const ids = (personnel ?? []).map((row: any) => String(row.discord_user_id)).filter((id: string) => /^\d{17,20}$/.test(id));
    if (!ids.length) return json({ ok: true, sanctions: [] });
    const rows = await db("police_sanctions?select=*&discord_user_id=in.(" + ids.join(",") + ")&order=created_at.desc&limit=200");
    return json({ ok: true, sanctions: rows ?? [] });
  } catch (e) {
    console.error("Sanctions list error:", String(e));
    return json({ error: "No se pudieron cargar las sanciones. Aplica primero la migración de la tabla." }, 500);
  }
}

async function createSanction(req: Request) {
  const issuerId = await authorizedUser(req);
  if (!issuerId) return json({ error: "No tienes un rol autorizado para gestionar sanciones." }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const targetId = String(body?.discord_user_id ?? "").trim();
  const actionType = String(body?.action_type ?? "");
  const reason = String(body?.reason ?? "").trim().slice(0, 1000);
  const evidenceUrl = String(body?.evidence_url ?? "").trim().slice(0, 500);
  const targetName = String(body?.target_name ?? "").trim().slice(0, 100);
  const plate = String(body?.plate ?? "").trim().slice(0, 30);
  if (!/^\d{17,20}$/.test(targetId) || !["warning", "strike"].includes(actionType) || reason.length < 3) {
    return json({ error: "Indica un ID de Discord válido, tipo y motivo (mínimo 3 caracteres)." }, 400);
  }
  if (evidenceUrl) {
    try { const url = new URL(evidenceUrl); if (!["https:", "http:"].includes(url.protocol)) throw new Error(); }
    catch { return json({ error: "La evidencia debe ser un enlace http o https válido." }, 400); }
  }
  let member: any;
  let inserted: any;
  try {
    const ucopPersonnel = await db("police_personnel?select=discord_user_id&discord_user_id=eq." + targetId + "&unit=in.(POLICIA,UCOP,CIC)&limit=1");
    if (!ucopPersonnel?.length) return json({ error: "La persona no está registrada como personal UCOP." }, 409);
    member = await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(targetId)) as any;
    const roles: string[] = member.roles ?? [];
    if (!roles.includes(POLICE_ROLE_ID)) return json({ error: "La persona no tiene el rol Policía." }, 409);
    if (roles.includes(EXPELLED_ROLE_ID)) return json({ error: "La persona ya tiene el rol de expulsado." }, 409);
    let issuerName = issuerId;
    try { const issuer = await discord("/guilds/" + GUILD_ID + "/members/" + issuerId) as any; issuerName = String(issuer.nick || issuer.user?.global_name || issuer.user?.username || issuerId); } catch { /* use ID fallback */ }
    const tierRoles = actionType === "warning" ? WARN_ROLE_IDS : STRIKE_ROLE_IDS;
    const existingRoleLevel = Math.max(0, ...tierRoles.map((id, index) => roles.includes(id) ? index + 1 : 0));
    const prior = await db("police_sanctions?select=level&discord_user_id=eq." + targetId + "&action_type=eq." + actionType + "&active=eq.true&order=level.desc&limit=1");
    const currentLevel = Math.max(existingRoleLevel, Number(prior?.[0]?.level ?? 0));
    const level = currentLevel + 1;
    if (level > 3) return json({ error: actionType === "strike" ? "Ya alcanzó 3 strikes." : "Ya alcanzó 3 amonestaciones." }, 409);
    const name = String(member.user?.global_name || member.user?.username || targetId);
    const created = await db("police_sanctions", { method: "POST", body: JSON.stringify({
      discord_user_id: targetId, discord_username: name, target_name: targetName, plate,
      action_type: actionType, level, reason, evidence_url: evidenceUrl, issuer_discord_id: issuerId,
      issuer_name: issuerName, status: "pending", active: false,
    }) });
    inserted = created?.[0];
    if (!inserted?.id) throw new Error("Sanction row was not created");
    for (const roleId of tierRoles) if (roles.includes(roleId)) {
      await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + roleId, { method: "DELETE" });
    }
    await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + tierRoles[level - 1], { method: "PUT", body: "{}" });
    if (actionType === "strike" && level === 3) {
      await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + EXPELLED_ROLE_ID, { method: "PUT", body: "{}" });
      await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + POLICE_ROLE_ID, { method: "DELETE" });
    }
    const active = await db("police_sanctions?id=eq." + encodeURIComponent(inserted.id), {
      method: "PATCH", body: JSON.stringify({ status: "active", active: true, resolved_at: new Date().toISOString() }),
    });
    const all = await db("police_sanctions?select=action_type,level&discord_user_id=eq." + targetId + "&active=eq.true");
    const warnings = (all ?? []).filter((s: any) => s.action_type === "warning").length;
    const strikes = (all ?? []).filter((s: any) => s.action_type === "strike").length;
    const channel = actionType === "warning" ? WARNING_CHANNEL_ID : STRIKE_CHANNEL_ID;
    const label = actionType === "warning" ? "Amonestación (Warn)" : "Strike";
    const embed = {
      title: "📋 Notificación de UCOP · RR. HH.", color: actionType === "warning" ? 16753920 : 15548997,
      description: "Se ha registrado una acción disciplinaria contra <@" + targetId + ">.",
      fields: [
        { name: "Oficial sancionado", value: "<@" + targetId + ">" + (targetName ? " · " + targetName : "") + (plate ? " · Placa " + plate : ""), inline: false },
        { name: "Registrado por", value: "<@" + issuerId + ">", inline: true },
        { name: "Motivo", value: reason, inline: false },
        ...(evidenceUrl ? [{ name: "Evidencia", value: "[Abrir evidencia](" + evidenceUrl + ")", inline: false }] : []),
        { name: "Tipo de acción", value: label + " " + level, inline: true },
        { name: "Amonestaciones activas", value: String(warnings), inline: true },
        { name: "Strikes activos", value: String(strikes), inline: true },
      ], footer: { text: "UCOP · RR. HH. · Este registro puede apelarse ante Asuntos Internos." }, timestamp: new Date().toISOString(),
    };
    let notificationWarning = "";
    try {
      const posted = await discord("/channels/" + channel + "/messages", {
        method: "POST", body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
      }) as any;
      await db("police_sanctions?id=eq." + encodeURIComponent(inserted.id), { method: "PATCH", body: JSON.stringify({ discord_message_id: posted?.id ?? null }) });
    } catch (e) {
      notificationWarning = "Sanción aplicada, pero no se pudo enviar el aviso al canal configurado.";
      console.error("Sanction notification failed:", String(e));
      await db("police_sanctions?id=eq." + encodeURIComponent(inserted.id), { method: "PATCH", body: JSON.stringify({ notification_error: String(e).slice(0, 500) }) });
    }
    return json({ ok: true, sanction: active?.[0] ?? inserted, warning: notificationWarning || undefined, expelled: actionType === "strike" && level === 3 });
  } catch (e) {
    console.error("Sanction action failed:", String(e));
    if (inserted?.id) {
      try { await db("police_sanctions?id=eq." + encodeURIComponent(inserted.id), { method: "PATCH", body: JSON.stringify({ status: "failed", active: false, failure_reason: String(e).slice(0, 500) }) }); } catch { /* preserve original failure */ }
    }
    return json({ error: "No se pudo completar la sanción. Revisa permisos y jerarquía de roles del bot." }, 502);
  }
}

async function deleteSanction(req: Request) {
  const issuerId = await authorizedUser(req);
  if (!issuerId) return json({ error: "No tienes un rol autorizado para gestionar sanciones." }, 403);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const id = String(body?.id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "El identificador de sanción no es válido." }, 400);
  try {
    const found = await db("police_sanctions?select=*&id=eq." + encodeURIComponent(id) + "&limit=1");
    const sanction = found?.[0];
    if (!sanction) return json({ error: "La sanción ya no existe." }, 404);
    const personnel = await db("police_personnel?select=discord_user_id&discord_user_id=eq." + encodeURIComponent(String(sanction.discord_user_id)) + "&unit=in.(POLICIA,UCOP,CIC)&limit=1");
    if (!personnel?.length) return json({ error: "El registro no pertenece a personal UCOP." }, 409);
    const targetId = String(sanction.discord_user_id);
    const member = await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(targetId)) as any;
    const memberRoles: string[] = member.roles ?? [];
    const tierRoles = sanction.action_type === "warning" ? WARN_ROLE_IDS : STRIKE_ROLE_IDS;
    const activeRows = await db("police_sanctions?select=id,level,created_at&discord_user_id=eq." + encodeURIComponent(targetId) + "&action_type=eq." + encodeURIComponent(String(sanction.action_type)) + "&status=eq.active&active=eq.true&order=level.desc");
    if (sanction.status === "active" && activeRows?.[0]?.id !== sanction.id) {
      return json({ error: "Para conservar la secuencia, elimina primero la sanción activa más reciente de este tipo." }, 409);
    }
    const remaining = (activeRows ?? []).filter((row: any) => row.id !== sanction.id);
    const highest = remaining.reduce((value: number, row: any) => Math.max(value, Number(row.level) || 0), 0);
    const affectedRoles = [...tierRoles, EXPELLED_ROLE_ID, POLICE_ROLE_ID];
    const oldRoleState = new Set(memberRoles);
    try {
      for (const roleId of tierRoles) if (memberRoles.includes(roleId)) await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + roleId, { method: "DELETE" });
      if (highest > 0 && highest <= 3) await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + tierRoles[highest - 1], { method: "PUT", body: "{}" });
      if (sanction.status === "active" && sanction.action_type === "strike" && Number(sanction.level) === 3 && highest < 3 && memberRoles.includes(EXPELLED_ROLE_ID)) {
        await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + EXPELLED_ROLE_ID, { method: "DELETE" });
        if (!memberRoles.includes(POLICE_ROLE_ID)) await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + POLICE_ROLE_ID, { method: "PUT", body: "{}" });
      }
      const deleted = await db("police_sanctions?id=eq." + encodeURIComponent(id), { method: "DELETE" });
      if (Array.isArray(deleted) && !deleted.length) throw new Error("Sanction record was not deleted");
    } catch (error) {
      try {
        for (const roleId of affectedRoles) {
          if (oldRoleState.has(roleId)) await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + roleId, { method: "PUT", body: "{}" });
          else await discord("/guilds/" + GUILD_ID + "/members/" + targetId + "/roles/" + roleId, { method: "DELETE" });
        }
      } catch (rollbackError) { console.error("Sanction deletion rollback failed:", String(rollbackError)); }
      throw error;
    }
    if (sanction.discord_message_id) {
      const channelId = sanction.action_type === "warning" ? WARNING_CHANNEL_ID : STRIKE_CHANNEL_ID;
      try { await discord("/channels/" + channelId + "/messages/" + encodeURIComponent(String(sanction.discord_message_id)), { method: "DELETE" }); }
      catch (error) { console.error("Deleted sanction announcement could not be removed:", String(error)); }
    }
    let issuerName = issuerId;
    try { const actor = await discord("/guilds/" + GUILD_ID + "/members/" + issuerId) as any; issuerName = String(actor.nick || actor.user?.global_name || actor.user?.username || issuerId); } catch { /* use ID fallback */ }
    await postAuditLog("🗑️ Sanción eliminada", 0x7b8490, [
      { name: "Agente", value: String(sanction.target_name || sanction.discord_username || targetId) },
      { name: "Discord ID", value: targetId },
      { name: "Medida eliminada", value: (sanction.action_type === "warning" ? "Warn " : "Strike ") + String(sanction.level) },
      { name: "Eliminó", value: issuerName },
      { name: "Motivo original", value: String(sanction.reason || "Sin motivo") },
    ]);
    return json({ ok: true, message: "Sanción eliminada y roles sincronizados." });
  } catch (error) {
    console.error("Sanction deletion failed:", String(error));
    return json({ error: "No se pudo eliminar la sanción o sincronizar los roles de Discord." }, 502);
  }
}
