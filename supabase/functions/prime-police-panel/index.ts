import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleHr } from "./hr.ts";

const GUILD_ID = "1539970134469378068";
const APPLICATION_CHANNEL_ID = "1539970136683847857";
const RESULTS_CHANNEL_ID = "1564350390294552696";
const POLICE_ROLE_ID = "1539970134482092038";
const APPLICATION_ID = "1540484542354428025";
const OWNER_IDS = new Set(["698630509143654541"]);
const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
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

const discord = async (path: string, init: RequestInit = {}) => {
  if (!BOT_TOKEN) throw new Error("Discord bot token is not configured");
  const res = await fetch("https://discord.com/api/v10" + path, {
    ...init,
    headers: {
      Authorization: "Bot " + BOT_TOKEN,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error("Discord API " + res.status + ": " + JSON.stringify(body));
  return body;
};

async function ensureSlashCommands() {
  const path = "/applications/" + APPLICATION_ID + "/guilds/" + GUILD_ID + "/commands";
  const desired = [
    { name: "postulacion", description: "Información sobre cómo postularte a PRIME POLICE" },
    { name: "publicar_postulaciones", description: "Publicar las postulaciones de PRIME POLICE" },
    { name: "panel_codigo", description: "Generar un código temporal para entrar al panel policial" },
  ];
  const existing = await discord(path) as any[];
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
async function signSession(userId: string) {
  if (!BOT_TOKEN) throw new Error("Discord bot token is not configured");
  const payload = base64urlEncode(encoder.encode(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
  })));
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(BOT_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return payload + "." + base64urlEncode(sig);
}
async function authenticate(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !BOT_TOKEN) return null;
  const parts = auth.slice(7).trim().split(".");
  if (parts.length !== 2) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(BOT_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, base64urlDecode(parts[1]), encoder.encode(parts[0]),
    );
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
    if (typeof session.sub !== "string" ||
        !Number.isFinite(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session.sub;
  } catch {
    return null;
  }
}

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
    // No comprobar aquí ADMIN_IDS: los miembros autorizados por rol tienen su propio ID de usuario.
    if (!row) {
      return json({ error: "Código inválido, usado o caducado. Genera uno nuevo en Discord." }, 401);
    }
    const consumed = await db(
      "police_panel_login_codes?id=eq." + encodeURIComponent(row.id) + "&used_at=is.null",
      { method: "PATCH", body: JSON.stringify({ used_at: new Date().toISOString() }) },
    );
    if (!consumed?.length) return json({ error: "Ese código ya se utilizó. Genera uno nuevo en Discord." }, 409);
    return json({ token: await signSession(row.discord_user_id), expires_in: 28800 });
  } catch (e) {
    console.error("Panel login error:", String(e));
    return json({ error: "No se pudo iniciar sesión. Revisa la configuración del servidor." }, 500);
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

async function findApplicationMessage(applicationId: string): Promise<any | null> {
  const messages = await discord("/channels/" + APPLICATION_CHANNEL_ID + "/messages?limit=100") as any[];
  const target = (messages ?? []).find((message: any) => {
    const id = String(applicationId);
    if (String(message.content ?? "").includes(id)) return true;
    if ((message.embeds ?? []).some((embed: any) =>
      String(embed.description ?? "").includes(id) || String(embed.footer?.text ?? "").includes(id) ||
      (embed.fields ?? []).some((field: any) => String(field.value ?? "").includes(id))
    )) return true;
    return (message.components ?? []).some((row: any) =>
      (row.components ?? []).some((component: any) =>
        String(component.custom_id ?? "").endsWith(":" + id)
      )
    );
  });
  return target ?? null;
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
  try {
    const rows = await db(
      "police_applications?select=*&id=eq." + encodeURIComponent(id) + "&limit=1",
    );
    app = rows?.[0];
    if (!app) return json({ error: "No se encontró esa candidatura." }, 404);

    const retryRole = action === "accept" && app.status === "accepted" && !app.role_assigned_at;
    const isNewDecision = app.status === "pending";
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
          "/roles/" + POLICE_ROLE_ID,
          { method: "PUT", body: JSON.stringify({}) },
        );
      } catch (e) {
        const detail = String(e);
        console.error("Panel role assignment error:", detail);
        if (detail.includes("403") || detail.includes("50013")) {
          return json({ error: "Discord ha denegado el rol. El bot necesita Administrar roles y su rol debe estar por encima de Policía." }, 502);
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
      try {
        await db("police_personnel?on_conflict=discord_user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ discord_user_id: String(app.discord_user_id), discord_username: String(app.discord_username ?? ""), full_name: String(app.full_name ?? ""), source_application_id: app.id, status: "active" }) });
      } catch (e) { console.error("Personnel record creation failed:", String(e)); }
    }
  } catch (e) {
    console.error("Panel decision database error:", String(e));
    return json({ error: "No se pudo guardar la decisión en la base de datos." }, 500);
  }

  const statusText = action === "accept" ? "✅ Aceptada · rol de Policía asignado" : "❌ No seleccionada";
  const content = "📋 **Postulación revisada**\n" +
    "**Candidato:** <@" + String(app.discord_user_id) + ">\n" +
    "**Estado:** " + statusText + "\n" +
    "**Revisado por:** <@" + reviewerId + ">\n" +
    "**Intento:** " + String(app.attempt_number ?? 1) + "/3\n" +
    "**Solicitud:** " + id;
  let discordSynced = false;
  let messageId = String(app.discord_message_id ?? "");

  // First try the exact message ID already stored for this application.
  if (messageId) {
    try {
      await discord(
        "/channels/" + APPLICATION_CHANNEL_ID + "/messages/" + encodeURIComponent(messageId),
        { method: "PATCH", body: JSON.stringify({ content, embeds: [], components: [] }) },
      );
      discordSynced = true;
    } catch (e) {
      console.error("Could not edit stored application message; will search Discord:", String(e));
      messageId = "";
    }
  }

  // Older applications may not have discord_message_id. Find their original message
  // by the application UUID in its embed or button IDs so stale buttons can be removed.
  if (!discordSynced) {
    try {
      const existingMessage = await findApplicationMessage(id);
      if (existingMessage?.id) {
        await discord(
          "/channels/" + APPLICATION_CHANNEL_ID + "/messages/" + encodeURIComponent(existingMessage.id),
          { method: "PATCH", body: JSON.stringify({ content, embeds: [], components: [] }) },
        );
        messageId = String(existingMessage.id);
        discordSynced = true;
      }
    } catch (e) {
      console.error("Could not find/edit original application message:", String(e));
    }
  }

  // If the original is no longer available, publish a decision receipt instead.
  if (!discordSynced) {
    try {
      const posted = await discord("/channels/" + APPLICATION_CHANNEL_ID + "/messages", {
        method: "POST",
        body: JSON.stringify({ content }),
      }) as any;
      if (posted?.id) {
        messageId = String(posted.id);
        discordSynced = true;
      }
    } catch (e) {
      console.error("Could not publish decision to Discord:", String(e));
    }
  }

  // Persist the recovered/new message ID so subsequent decisions can edit it directly.
  if (discordSynced && messageId && messageId !== String(app.discord_message_id ?? "")) {
    try {
      await db(
        "police_applications?id=eq." + encodeURIComponent(id),
        { method: "PATCH", body: JSON.stringify({ discord_message_id: messageId }) },
      );
    } catch (e) {
      console.error("Could not persist Discord message ID:", String(e));
    }
  }

  let resultsNotified = !isNewDecision;
  if (isNewDecision) {
    const attempt = Math.max(1, Number(app.attempt_number) || 1);
    const remaining = Math.max(0, 3 - attempt);
    const accepted = action === "accept";
    const description = accepted
      ? "¡Enhorabuena! Tu postulación ha sido aceptada. Ya tienes el rol <@&" + POLICE_ROLE_ID + ">. Te damos la bienvenida a PRIME POLICE; el equipo te indicará los siguientes pasos."
      : remaining > 0
        ? "Gracias por tu tiempo y por querer formar parte de PRIME POLICE. En esta ocasión no has sido seleccionado. No te desanimes: puedes prepararte y volver a intentarlo. Te quedan **" + remaining + " de 3 intentos**."
        : "Gracias por tu esfuerzo y por postularte a PRIME POLICE. En esta ocasión no has sido seleccionado. Has utilizado tus **3 de 3 intentos**, así que no podrás enviar otra postulación. Te animamos a seguir participando en la comunidad y te deseamos lo mejor.";
    try {
      await discord("/channels/" + RESULTS_CHANNEL_ID + "/messages", {
        method: "POST",
        body: JSON.stringify({
          content: "<@" + String(app.discord_user_id) + ">",
          embeds: [{ title: accepted ? "🎉 Resultado de postulación · Aceptada" : "📋 Resultado de postulación · PRIME POLICE", description, color: accepted ? 0x45b879 : 0xd5ad5a, footer: { text: "PRIME POLICE · Reclutamiento · Intento " + attempt + "/3" } }],
          allowed_mentions: { parse: [], users: [String(app.discord_user_id)], roles: accepted ? [POLICE_ROLE_ID] : [] },
        }),
      });
      resultsNotified = true;
    } catch (error) {
      console.error("Could not publish application result:", String(error));
    }
  }
  return json({
    ok: true,
    status: finalApp.status,
    role_assigned: action === "accept" && Boolean(finalApp.role_assigned_at),
    discord_synced: discordSynced,
    results_notified: resultsNotified,
    warning: discordSynced && resultsNotified ? undefined : "La decisión se guardó, pero Discord no confirmó todos los mensajes.",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const action = new URL(req.url).searchParams.get("panel");
  if (action === "login" && req.method === "POST") return await login(req);
  if (action === "data" && req.method === "GET") return await listApplications(req);
  if (action === "decision" && req.method === "POST") return await decide(req);
  if (action === "sanctions" && req.method === "GET") return await listSanctions(req);
  if (action === "sanction" && req.method === "POST") return await createSanction(req);
  const hrResponse = await handleHr(req, action ?? "");
  if (hrResponse) return hrResponse;
  if (action) return json({ error: "Acción de panel no reconocida." }, 404);
  if (req.method === "GET") {
    let commandsRegistered = false;
    let commandError = "";
    try {
      await ensureSlashCommands();
      commandsRegistered = true;
    } catch (e) {
      commandError = String(e);
      console.error("Panel health: no se pudieron registrar los comandos slash:", commandError);
    }
    return json({
      ok: true,
      service: "PRIME POLICE · Panel API",
      login: "Genera un código con /panel_codigo en el servidor de Discord.",
      commands_registered: commandsRegistered,
      configured: { discord: Boolean(BOT_TOKEN), database: Boolean(SUPABASE_URL && SERVICE_KEY) },
      warning: commandsRegistered ? undefined : "La API está activa, pero no se pudieron actualizar los comandos de Discord.",
      version: 2,
    });
  }
  return json({ error: "Método no permitido." }, 405);
});
const WARN_ROLE_IDS = ["1539970134482092032", "1539970134469378077", "1539970134469378076"];
const STRIKE_ROLE_IDS = ["1539970134469378075", "1539970134469378074", "1539970134469378073"];
const EXPELLED_ROLE_ID = "1539970134482092034";
const WARNING_CHANNEL_ID = "1539970136512143482";
const STRIKE_CHANNEL_ID = "1539970136512143481";
const MANAGER_ROLE_IDS = new Set([
  "1539970134565982313", "1539970134544748562", "1539970134544748556",
  "1539970134519578773", "1539970134519578774",
]);
async function authorizedUser(req: Request): Promise<string | null> {
  const userId = await authenticate(req);
  if (!userId) return null;
  if (OWNER_IDS.has(userId)) return userId;
  try {
    const member = await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(userId)) as any;
    return (member.roles ?? []).some((role: string) => MANAGER_ROLE_IDS.has(role)) ? userId : null;
  } catch (e) {
    console.error("Manager role verification failed:", String(e));
    return null;
  }
}

async function listSanctions(req: Request) {
  const userId = await authorizedUser(req);
  if (!userId) return json({ error: "No tienes un rol autorizado para gestionar sanciones." }, 403);
  try {
    const rows = await db("police_sanctions?select=*&order=created_at.desc&limit=200");
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
  const targetName = String(body?.target_name ?? "").trim().slice(0, 100);
  const plate = String(body?.plate ?? "").trim().slice(0, 30);
  if (!/^\d{17,20}$/.test(targetId) || !["warning", "strike"].includes(actionType) || reason.length < 3) {
    return json({ error: "Indica un ID de Discord válido, tipo y motivo (mínimo 3 caracteres)." }, 400);
  }
  let member: any;
  let inserted: any;
  try {
    member = await discord("/guilds/" + GUILD_ID + "/members/" + encodeURIComponent(targetId)) as any;
    const roles: string[] = member.roles ?? [];
    if (!roles.includes(POLICE_ROLE_ID)) return json({ error: "La persona no tiene el rol Policía." }, 409);
    if (roles.includes(EXPELLED_ROLE_ID)) return json({ error: "La persona ya tiene el rol de expulsado." }, 409);
    const tierRoles = actionType === "warning" ? WARN_ROLE_IDS : STRIKE_ROLE_IDS;
    const existingRoleLevel = Math.max(0, ...tierRoles.map((id, index) => roles.includes(id) ? index + 1 : 0));
    const prior = await db("police_sanctions?select=level&discord_user_id=eq." + targetId + "&action_type=eq." + actionType + "&active=eq.true&order=level.desc&limit=1");
    const currentLevel = Math.max(existingRoleLevel, Number(prior?.[0]?.level ?? 0));
    const level = currentLevel + 1;
    if (level > 3) return json({ error: actionType === "strike" ? "Ya alcanzó 3 strikes." : "Ya alcanzó 3 amonestaciones." }, 409);
    const name = String(member.user?.global_name || member.user?.username || targetId);
    const created = await db("police_sanctions", { method: "POST", body: JSON.stringify({
      discord_user_id: targetId, discord_username: name, target_name: targetName, plate,
      action_type: actionType, level, reason, issuer_discord_id: issuerId,
      issuer_name: "<@" + issuerId + ">", status: "pending", active: false,
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