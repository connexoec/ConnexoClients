// Supabase Edge Function: notifyError
// Recibe un error recién guardado en public.client_errors y lo reenvía al canal
// de monitoreo. Soporta Slack, Discord y correo (Resend) A LA VEZ: manda a
// cualquiera de los tres cuyo secreto esté configurado.
//
// Se dispara desde el trigger trg_client_errors_notify (pg_net) de
// setup_error_logging.sql, que solo la llama para errores 'error'/'critical'.
//
// ── Despliegue (una sola vez) ────────────────────────────────────────────────
//   1. supabase login
//   2. supabase link --project-ref wxkqmotksjcjwhytodvx
//   3. Configura AL MENOS UNO de estos secretos (los que no pongas se ignoran):
//        supabase secrets set SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX
//        supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/XXX
//        # Correo (necesita los tres):
//        supabase secrets set RESEND_API_KEY=re_xxx
//        supabase secrets set ALERT_EMAIL_TO=tucorreo@dominio.com
//        supabase secrets set ALERT_EMAIL_FROM="Connexo Alertas <alertas@tudominio.com>"
//   4. supabase functions deploy notifyError --no-verify-jwt
//
// Nota: devuelve SIEMPRE 200 (aunque no haya canal configurado o falle un
// envío) para que pg_net no reintente ni ensucie los logs de la base. El
// detalle real va al log de la función.

const SLACK_URL   = Deno.env.get("SLACK_WEBHOOK_URL")   ?? "";
const DISCORD_URL = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";
const RESEND_KEY  = Deno.env.get("RESEND_API_KEY")      ?? "";
const EMAIL_TO    = Deno.env.get("ALERT_EMAIL_TO")      ?? "";
const EMAIL_FROM  = Deno.env.get("ALERT_EMAIL_FROM")    ?? "Connexo Alertas <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sevEmoji = (s: string) =>
  s === "critical" ? "🔴" : s === "error" ? "🟠" : s === "warning" ? "🟡" : "🔵";

const clip = (v: unknown, n: number) => {
  const s = v == null ? "" : String(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    // El trigger manda to_jsonb(NEW). También se acepta invocación directa.
    const r = payload.record ?? payload;

    const message   = r.message      ?? "(sin mensaje)";
    const severity  = (r.severity    ?? "error").toLowerCase();
    const errorType = r.error_type   ?? "render";
    const url        = r.url          ?? "—";
    const component  = r.component    ?? "—";
    const userId     = r.user_id      ?? "anónimo (sin sesión)";
    const userAgent  = r.user_agent   ?? "—";
    const lastAction = r.last_action  ?? "—";
    const stack      = r.stack        ?? "";
    const createdAt  = r.created_at   ?? new Date().toISOString();
    const meta       = r.metadata ? JSON.stringify(r.metadata) : "{}";

    const emoji = sevEmoji(severity);
    const heading = `${emoji} Error en Connexo — ${severity.toUpperCase()}`;

    // Cuerpo en texto plano, reutilizable por los tres canales.
    const lines = [
      `*${heading}*`,
      `• *Mensaje:* ${clip(message, 500)}`,
      `• *Tipo:* ${errorType}`,
      `• *Dónde:* ${clip(url, 300)}  ·  componente: ${clip(component, 120)}`,
      `• *Usuario:* ${userId}`,
      `• *Cuándo:* ${createdAt}`,
      `• *Última acción:* ${clip(lastAction, 300)}`,
      `• *Navegador:* ${clip(userAgent, 300)}`,
      `• *Contexto:* ${clip(meta, 500)}`,
    ];
    if (stack) lines.push(`\n\`\`\`${clip(stack, 1200)}\`\`\``);
    const text = lines.join("\n");

    const results: Record<string, unknown> = {};

    // ── Slack ────────────────────────────────────────────────────────────────
    if (SLACK_URL) {
      try {
        const res = await fetch(SLACK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // mrkdwn de Slack entiende *negrita* y ```bloques```.
          body: JSON.stringify({ text }),
        });
        results.slack = res.ok ? "ok" : `http ${res.status}`;
      } catch (e) { results.slack = `err ${String(e).slice(0, 120)}`; }
    }

    // ── Discord ──────────────────────────────────────────────────────────────
    if (DISCORD_URL) {
      try {
        // Discord: **negrita** con doble asterisco; se convierte el *simple*.
        const discordText = text.replace(/\*(.+?)\*/g, "**$1**");
        const res = await fetch(DISCORD_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: clip(discordText, 1900) }),
        });
        results.discord = res.ok ? "ok" : `http ${res.status}`;
      } catch (e) { results.discord = `err ${String(e).slice(0, 120)}`; }
    }

    // ── Correo (Resend) ──────────────────────────────────────────────────────
    if (RESEND_KEY && EMAIL_TO) {
      try {
        const html = `<h2>${heading}</h2><ul>
          <li><b>Mensaje:</b> ${clip(message, 500)}</li>
          <li><b>Tipo:</b> ${errorType}</li>
          <li><b>Dónde:</b> ${clip(url, 300)} · componente: ${clip(component, 120)}</li>
          <li><b>Usuario:</b> ${userId}</li>
          <li><b>Cuándo:</b> ${createdAt}</li>
          <li><b>Última acción:</b> ${clip(lastAction, 300)}</li>
          <li><b>Navegador:</b> ${clip(userAgent, 300)}</li>
          <li><b>Contexto:</b> ${clip(meta, 500)}</li>
        </ul>${stack ? `<pre style="background:#111;color:#eee;padding:12px;border-radius:8px;overflow:auto">${clip(stack, 2000)}</pre>` : ""}`;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
            subject: `${emoji} [Connexo] ${clip(message, 90)}`,
            html,
          }),
        });
        results.email = res.ok ? "ok" : `http ${res.status}`;
      } catch (e) { results.email = `err ${String(e).slice(0, 120)}`; }
    }

    if (Object.keys(results).length === 0) {
      console.warn("[notifyError] Ningún canal configurado (SLACK_WEBHOOK_URL / DISCORD_WEBHOOK_URL / RESEND_API_KEY+ALERT_EMAIL_TO).");
    } else {
      console.log("[notifyError]", JSON.stringify(results));
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    // Nunca propagamos error: 200 para que pg_net no reintente.
    console.error("[notifyError] fallo:", e?.message ?? String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
