// Supabase Edge Function: payphone-process
// Inicia un cobro con PayPhone (Ecuador) para la plantilla de barbería.
//
// Despliegue (una sola vez):
//   1. supabase login
//   2. supabase link --project-ref <TU_PROJECT_REF>
//   3. supabase functions deploy payphone-process
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectadas por la plataforma.)
//
// SEGURIDAD — leer antes de tocar este archivo:
// El token de PayPhone NO se recibe del cliente y NO se guarda en
// profiles.barber_gateways (esa columna la lee cualquier visitante del perfil
// público: RLS `public_read_profiles` da SELECT a anon sobre todas las columnas).
// Las credenciales viven en `barber_payment_secrets`, que no tiene política para
// anon, y se leen aquí con el service_role. El navegador solo manda profile_id.
//
// El cliente lo invoca con:
//   supabase.functions.invoke('payphone-process', {
//     body: { profile_id, amount, orderId, reference, customer, responseUrl, cancellationUrl }
//   })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYPHONE_PREPARE_URL = "https://pay.payphonetodoesposible.com/api/button/Prepare";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

/** PayPhone maneja los montos en centavos enteros. */
const toCents = (n: number) => Math.round(n * 100);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      profile_id,
      amount,
      orderId,
      reference,
      customer,
      responseUrl,
      cancellationUrl,
    } = await req.json().catch(() => ({}));

    if (!profile_id) return json({ error: "Falta profile_id." }, 400);

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return json({ error: "El monto no es válido." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "La función no está configurada correctamente." }, 500);
    }

    // service_role: necesario para leer barber_payment_secrets (sin acceso anon).
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) El dueño debe tener PayPhone activado en su config pública.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("barber_gateways, displayName")
      .eq("id", profile_id)
      .single();

    if (profileError || !profile) return json({ error: "Perfil no encontrado." }, 404);

    const gateways = profile.barber_gateways;
    const payphoneEnabled = gateways && !Array.isArray(gateways) && gateways.payphone?.enabled;
    if (!payphoneEnabled) {
      return json({ error: "PayPhone no está habilitado para este negocio." }, 400);
    }

    // 2) Credenciales: solo del lado servidor.
    const { data: secrets } = await admin
      .from("barber_payment_secrets")
      .select("payphone_token, payphone_client_id")
      .eq("profile_id", profile_id)
      .maybeSingle();

    const token = secrets?.payphone_token;
    const storeId = secrets?.payphone_client_id;
    if (!token || !storeId) {
      return json({ error: "El negocio no ha terminado de configurar PayPhone." }, 400);
    }

    // 3) Preparar el cobro. El total debe cuadrar:
    //    amount = amountWithoutTax + amountWithTax + tax + service + tip.
    //    Sin desglose de IVA: todo va como amountWithoutTax.
    const cents = toCents(numericAmount);
    const clientTransactionId = `${String(profile_id).slice(0, 8)}-${Date.now()}`;
    const origin = req.headers.get("origin") || "";

    const payload = {
      amount: cents,
      amountWithoutTax: cents,
      amountWithTax: 0,
      tax: 0,
      service: 0,
      tip: 0,
      currency: "USD",
      clientTransactionId,
      storeId,
      reference: reference || `Pago ${profile.displayName || "barbería"}`,
      responseUrl: responseUrl || origin || undefined,
      cancellationUrl: cancellationUrl || origin || undefined,
      email: customer?.email || undefined,
      phoneNumber: customer?.phone || undefined,
    };

    const resp = await fetch(PAYPHONE_PREPARE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      // El detalle crudo de PayPhone puede traer info del comercio: se registra
      // en los logs de la función, pero al cliente solo le llega algo genérico.
      console.error("PayPhone Prepare falló", resp.status, JSON.stringify(data));
      return json({ error: "La pasarela rechazó el cobro. Intenta con otro método." }, 502);
    }

    const payUrl = data?.payWithCard || data?.payWithPayPhone;
    if (!payUrl) {
      console.error("PayPhone no devolvió URL de pago", JSON.stringify(data));
      return json({ error: "La pasarela no devolvió un enlace de pago." }, 502);
    }

    return json({
      payUrl,
      paymentId: data?.paymentId ?? null,
      clientTransactionId,
      orderId: orderId ?? clientTransactionId,
    });
  } catch (e) {
    console.error("payphone-process error", e);
    return json({ error: "No pudimos iniciar el pago." }, 500);
  }
});
