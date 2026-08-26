// Supabase Edge Function: notifyAdminEvent
// Recibe una acción del panel Super Admin recién guardada en public.admin_events
// (crear perfil, activar/desactivar, cambiar plan/plantilla) y la reenvía a un
// canal de monitoreo PROPIO, SEPARADO del canal de errores.
//
// ⚠️ Usa secretos DEDICADOS (distintos de notifyError) para que estos avisos
// lleguen a OTRO canal de Discord. Si no configuras el suyo, NO se envía nada
// (nunca cae en el canal de errores):
//     DISCORD_ADMIN_WEBHOOK_URL   ← el webhook del canal nuevo (lo que necesitas)
//     SLACK_ADMIN_WEBHOOK_URL     ← opcional
//     ADMIN_ALERT_EMAIL_TO        ← opcional (reutiliza RESEND_API_KEY, misma cuenta)
//     ADMIN_ALERT_EMAIL_FROM      ← opcional
//
// Se dispara desde el trigger trg_admin_events_notify (pg_net) de
// setup_admin_event_log.sql.
//
// Despliegue (una sola vez):
//   1. supabase link --project-ref wxkqmotksjcjwhytodvx   (si no lo hiciste ya)
//   2. supabase secrets set DISCORD_ADMIN_WEBHOOK_URL=https://discord.com/api/webhooks/XXX
//   3. supabase functions deploy notifyAdminEvent --no-verify-jwt
//
// Devuelve SIEMPRE 200 para que pg_net no reintente.

const SLACK_URL   = Deno.env.get("SLACK_ADMIN_WEBHOOK_URL")   ?? "";
const DISCORD_URL = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL") ?? "";
const RESEND_KEY  = Deno.env.get("RESEND_API_KEY")            ?? "";  // misma cuenta; el destino es propio
const EMAIL_TO    = Deno.env.get("ADMIN_ALERT_EMAIL_TO")      ?? "";
const EMAIL_FROM  = Deno.env.get("ADMIN_ALERT_EMAIL_FROM")    ?? "Connexo Panel <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const clip = (v: unknown, n: number) => {
  const s = v == null ? "" : String(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

// Etiquetas legibles por tipo de evento.
const EVENT: Record<string, { emoji: string; label: string }> = {
  profile_created:     { emoji: "🆕", label: "Nuevo perfil creado" },
  profile_activated:   { emoji: "✅", label: "Perfil activado" },
  profile_deactivated: { emoji: "⛔", label: "Perfil desactivado" },
  plan_theme_changed:  { emoji: "✏️", label: "Plan / plantilla actualizados" },
};

const PLAN_LABEL: Record<string, string> = { conecta: "CONECTA", pro: "PRO", ultra: "ULTRA" };
const SUB_LABEL: Record<string, string> = {
  none: "Sin suscripción", trial: "Trial", mensual: "Mensual", anual: "Anual",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const r = payload.record ?? payload;

    const type      = r.event_type ?? "profile_created";
    const meta      = EVENT[type] ?? { emoji: "📋", label: type };
    const actor     = r.actor_email ?? "desconocido";
    const role      = r.actor_role ? ` (${r.actor_role})` : "";
    const target    = r.target_email ?? "—";
    const username  = r.target_username ? `@${r.target_username}` : "";
    const plan      = r.plan ? (PLAN_LABEL[String(r.plan).toLowerCase()] ?? r.plan) : "—";
    const theme     = r.theme ?? "—";
    const sub       = r.subscription_type ? (SUB_LABEL[String(r.subscription_type).toLowerCase()] ?? r.subscription_type) : null;
    const campaign  = r.campaign ?? "";
    const trialDays = r.trial_days ?? null;
    const location  = r.location ?? "—";
    const when      = r.created_at ?? new Date().toISOString();
    const details   = r.details && Object.keys(r.details).length ? JSON.stringify(r.details) : "";

    const heading = `${meta.emoji} ${meta.label} — Connexo`;

    // Cuerpo. Las líneas de suscripción/plantilla solo aparecen si hay dato,
    // para que un simple "activar perfil" no muestre campos vacíos.
    const lines: string[] = [
      `*${heading}*`,
      `• *Quién:* ${actor}${role}`,
      `• *Cuándo:* ${when}`,
      `• *Cliente:* ${target} ${username}`.trim(),
    ];
    if (type === "profile_created" || type === "plan_theme_changed") {
      lines.push(`• *Plan:* ${plan}`);
      lines.push(`• *Plantilla:* ${theme}`);
    }
    if (sub) {
      let subLine = `• *Suscripción:* ${sub}`;
      if (type === "profile_created" && String(r.subscription_type).toLowerCase() === "trial" && trialDays != null) {
        subLine += ` · ${trialDays} días`;
        if (campaign) subLine += ` · campaña: ${clip(campaign, 60)}`;
      }
      lines.push(subLine);
    }
    if (type === "profile_created") lines.push(`• *País:* ${location}`);
    if (details) lines.push(`• *Detalle:* ${clip(details, 400)}`);

    const text = lines.join("\n");
    const results: Record<string, unknown> = {};

    // ── Slack ────────────────────────────────────────────────────────────────
    if (SLACK_URL) {
      try {
        const res = await fetch(SLACK_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        results.slack = res.ok ? "ok" : `http ${res.status}`;
      } catch (e) { results.slack = `err ${String(e).slice(0, 120)}`; }
    }

    // ── Discord ──────────────────────────────────────────────────────────────
    if (DISCORD_URL) {
      try {
        const discordText = text.replace(/\*(.+?)\*/g, "**$1**"); // *x* → **x**
        const res = await fetch(DISCORD_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: clip(discordText, 1900) }),
        });
        results.discord = res.ok ? "ok" : `http ${res.status}`;
      } catch (e) { results.discord = `err ${String(e).slice(0, 120)}`; }
    }

    // ── Correo (Resend) ──────────────────────────────────────────────────────
    if (RESEND_KEY && EMAIL_TO) {
      try {
        const html = `<h2>${heading}</h2><ul>${
          text.split("\n").slice(1).map((l) =>
            `<li>${l.replace(/^•\s*/, "").replace(/\*(.+?)\*/g, "<b>$1</b>")}</li>`).join("")
        }</ul>`;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
            subject: `${meta.emoji} [Connexo] ${meta.label} — ${target}`,
            html,
          }),
        });
        results.email = res.ok ? "ok" : `http ${res.status}`;
      } catch (e) { results.email = `err ${String(e).slice(0, 120)}`; }
    }

    if (Object.keys(results).length === 0) {
      console.warn("[notifyAdminEvent] Ningún canal configurado.");
    } else {
      console.log("[notifyAdminEvent]", type, JSON.stringify(results));
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[notifyAdminEvent] fallo:", e?.message ?? String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
