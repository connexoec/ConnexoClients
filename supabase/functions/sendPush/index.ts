// Supabase Edge Function: sendPush
// Envía notificaciones Web Push a todos los dispositivos suscritos de un usuario.
// Se dispara desde un Database Webhook sobre public.notifications (evento INSERT).
//
// Despliegue (una sola vez):
//   1. supabase login
//   2. supabase link --project-ref wxkqmotksjcjwhytodvx
//   3. supabase secrets set VAPID_PUBLIC_KEY=<PUBLICA> VAPID_PRIVATE_KEY=<PRIVADA> VAPID_SUBJECT=mailto:soporte@connexo.ec
//   4. supabase functions deploy sendPush --no-verify-jwt
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectadas por la plataforma)
//
// Luego: Supabase → Database → Webhooks → New hook
//   Tabla: public.notifications | Evento: INSERT | Tipo: Supabase Edge Function → sendPush

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:soporte@connexo.ec";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      throw new Error("Faltan los secretos VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.");
    }

    const payload = await req.json().catch(() => ({}));
    // El webhook envía { type, table, record, old_record, schema }.
    // También aceptamos invocación directa con { user_id, title, body, url }.
    const record = payload.record ?? payload;
    const userId: string | undefined = record.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, reason: "sin user_id" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Una push por aviso, haya el transporte que haya ─────────────────────
    // El manual manda crear un Database Webhook sobre `notifications` y además
    // `setup_notifications_webhook.sql` engancha un trigger de pg_net que hace
    // lo mismo: con los dos puestos cada aviso salía DOS veces. En vez de
    // adivinar cuál está activo, se marca el aviso al enviarlo y el segundo
    // intento se retira. El UPDATE que hay detrás es atómico, así que dos
    // llamadas a la vez no pueden ganar las dos.
    //
    // Sólo aplica cuando viene un id de notificación real: la invocación
    // directa (pruebas con { user_id, title, ... }) sigue funcionando igual.
    const notificationId: string | undefined = record.id;
    if (notificationId) {
      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_notification_push",
        { p_id: notificationId },
      );
      // Si la función aún no existe (falta correr setup_notifications_fix.sql)
      // se sigue adelante: mejor un posible duplicado que no avisar.
      if (!claimError && claimed === false) {
        return new Response(
          JSON.stringify({ ok: true, sent: 0, skipped: "ya enviada" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (claimError) {
        console.warn(`[sendPush] claim_notification_push no disponible: ${claimError.message}`);
      }
    }

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (error) throw error;

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ¿De qué negocio es este aviso? ──────────────────────────────────────
    // Un mismo teléfono puede estar registrado para varias cuentas (el dueño
    // que lleva dos negocios, o el operador que vigila a sus clientes). En ese
    // caso, un "Nuevo pedido" a secas es indistinguible de un aviso ajeno: es
    // lo que se percibía como notificación fantasma. Se antepone el nombre.
    //
    // ⚠️ SÓLO en los dispositivos compartidos. A un cliente normal, que sólo
    // tiene su propia cuenta, repetirle el nombre de su negocio en cada aviso
    // es ruido: para él nada cambia.
    const endpoints = subs.map((s: any) => s.endpoint);
    const sharedEndpoints = new Set<string>();
    try {
      const { data: others } = await admin
        .from("push_subscriptions")
        .select("endpoint")
        .in("endpoint", endpoints)
        .neq("user_id", userId);
      for (const o of others ?? []) sharedEndpoints.add(o.endpoint);
    } catch (_) {
      // Si la consulta falla se manda sin etiqueta: perder el nombre es mucho
      // menos grave que perder el aviso.
    }

    let ownerLabel = "";
    if (sharedEndpoints.size > 0) {
      const { data: prof } = await admin
        .from("profiles")
        .select('displayName, username')
        .eq("id", userId)
        .maybeSingle();
      const raw = (prof?.displayName || prof?.username || "").trim();
      // Se recorta: Android corta el título y lo importante (qué pasó) va
      // detrás del nombre, así que un nombre largo lo dejaría fuera de vista.
      if (raw) ownerLabel = (raw.length > 22 ? raw.slice(0, 21).trimEnd() + "…" : raw) + " · ";
    }

    const baseTitle = record.title ?? "Connexo";
    const payloadFor = (titulo: string) => JSON.stringify({
      title: titulo,
      body: record.body ?? "",
      url: record.url ?? "/",
      // ⚠️ El tag identifica UN aviso, no su categoría. Antes iba `record.type`,
      // así que dos pedidos seguidos compartían tag: el segundo REEMPLAZABA al
      // primero en el teléfono (y con renotify volvía a vibrar). El dueño veía
      // una notificación que se repetía y perdía las anteriores. Con el id de
      // la notificación cada evento real se muestra por separado.
      tag: notificationId ?? record.type ?? "connexo",
    });
    const plainBody = payloadFor(baseTitle);
    const labeledBody = ownerLabel ? payloadFor(ownerLabel + baseTitle) : plainBody;

    let sent = 0;
    // Detalle por dispositivo. Antes los fallos se descartaban en silencio, así
    // que un endpoint rechazado (p. ej. 403 por llave VAPID que no corresponde)
    // era indistinguible de un envío correcto: en los logs solo se veía "ok".
    const results: Array<Record<string, unknown>> = [];

    await Promise.all(
      subs.map(async (s: any) => {
        const host = (() => {
          try { return new URL(s.endpoint).host; } catch { return "?"; }
        })();
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            // Con el nombre del negocio delante sólo si ESE aparato lo comparten
            // varias cuentas.
            sharedEndpoints.has(s.endpoint) ? labeledBody : plainBody,
          );
          sent++;
          results.push({ host, ok: true });
        } catch (err: any) {
          const code = err?.statusCode;
          const detail = String(err?.body ?? err?.message ?? err).slice(0, 300);
          results.push({ host, ok: false, statusCode: code ?? null, detail });
          console.error(`[sendPush] fallo user=${userId} host=${host} status=${code}: ${detail}`);

          // 404/410 = suscripción caducada → la eliminamos.
          // El 403 NO se borra a propósito: suele ser configuración de llaves
          // VAPID, y borrar la fila haría perder un dispositivo válido.
          if (code === 404 || code === 410) {
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("user_id", userId)
              .eq("endpoint", s.endpoint);
          }
        }
      }),
    );

    const failed = results.length - sent;
    if (failed > 0) {
      console.error(`[sendPush] user=${userId}: ${sent} enviadas, ${failed} fallidas`, JSON.stringify(results));
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
