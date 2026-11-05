/**
 * Webhook de la WhatsApp Cloud API (Meta) → Discord (+ puente KODA).
 *
 * Vercel convierte este archivo en una función serverless en
 * `/api/webhooks/whatsapp`: es la URL pública HTTPS que Meta necesita.
 *
 *   GET  → verificación inicial de Meta (hub.mode / hub.verify_token / hub.challenge)
 *   POST → mensajes entrantes, reenviados como texto al webhook de Discord.
 *          Además, si el puente KODA está configurado, el payload completo se pasa a la
 *          función `kodaWhatsApp` de Supabase, que atiende los botones de la plantilla
 *          «saludo_inicial_connexo» (¡Sí, enviar demo! / Ver más tarde), las bajas por texto
 *          y los mensajes que Meta no pudo entregar.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   WHATSAPP_VERIFY_TOKEN          token que se escribe también en el panel de Meta
 *   DISCORD_WHATSAPP_WEBHOOK_URL   URL del webhook del canal de Discord
 *   KODA_WA_URL                    (opcional) https://<ref>.supabase.co/functions/v1/kodaWhatsApp
 *   KODA_BRIDGE_SECRET             (opcional) el mismo secreto compartido de kodaIntake/kodaWhatsApp
 *
 * Ninguno de los valores va en el código: el repo se sube a GitHub y quien
 * tenga la URL del webhook de Discord puede escribir en el canal. Sin las dos variables
 * KODA_* el webhook funciona exactamente como antes (solo Discord).
 */

// Tipos mínimos de lo que Vercel entrega al handler. Se definen aquí en vez de
// instalar `@vercel/node` solo por los tipos.
interface Req {
  method?: string
  url?: string
  body?: unknown
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): unknown
  send(body: string): unknown
}

// Lo poco que se lee del payload de Meta.
interface WaMessage {
  from?: string
  type?: string
  text?: { body?: string }
  image?: { caption?: string }
  video?: { caption?: string }
  document?: { caption?: string; filename?: string }
  location?: { latitude?: number; longitude?: number; name?: string }
  button?: { text?: string }
  interactive?: {
    button_reply?: { title?: string }
    list_reply?: { title?: string }
  }
  reaction?: { emoji?: string }
}
interface WaValue {
  metadata?: { display_phone_number?: string }
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
  messages?: WaMessage[]
  statuses?: Array<{ id?: string; status?: string }>
}
interface WaPayload {
  object?: string
  entry?: Array<{ changes?: Array<{ value?: WaValue }> }>
}

const DISCORD_MAX = 2000 // límite de `content` en un webhook de Discord

const truncate = (s: string, max = DISCORD_MAX) =>
  s.length > max ? s.slice(0, max - 1) + '…' : s

/** Texto legible de un mensaje entrante, según su tipo. */
function describeMessage(m: WaMessage): string {
  switch (m.type) {
    case 'text':
      return m.text?.body ?? ''
    case 'image':
      return `[imagen] ${m.image?.caption ?? ''}`.trim()
    case 'video':
      return `[video] ${m.video?.caption ?? ''}`.trim()
    case 'document':
      return `[documento] ${m.document?.filename ?? m.document?.caption ?? ''}`.trim()
    case 'audio':
      return '[audio]'
    case 'sticker':
      return '[sticker]'
    case 'location': {
      const { latitude, longitude, name } = m.location ?? {}
      const link =
        latitude != null && longitude != null
          ? ` https://maps.google.com/?q=${latitude},${longitude}`
          : ''
      return `[ubicación] ${name ?? ''}${link}`.trim()
    }
    case 'button':
      return m.button?.text ?? '[botón]'
    case 'interactive':
      return (
        m.interactive?.button_reply?.title ??
        m.interactive?.list_reply?.title ??
        '[respuesta interactiva]'
      )
    case 'reaction':
      return `reaccionó ${m.reaction?.emoji ?? ''}`.trim()
    default:
      return `[${m.type ?? 'mensaje'}]`
  }
}

/** Arma el texto que se publica en Discord para un mensaje. */
function formatForDiscord(m: WaMessage, value: WaValue): string {
  const contact = value.contacts?.find((c) => c.wa_id === m.from)
  const who = contact?.profile?.name ? `${contact.profile.name} (+${m.from})` : `+${m.from}`
  const line = value.metadata?.display_phone_number
    ? ` → línea +${value.metadata.display_phone_number}`
    : ''
  const quoted = describeMessage(m)
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')
  return `📩 **WhatsApp** · ${who}${line}\n${quoted}`
}

async function sendToDiscord(url: string, content: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // El texto lo escribe un tercero: `parse: []` evita que un "@everyone" ping.
    body: JSON.stringify({ content: truncate(content), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Discord respondió ${res.status}`)
}

/** ¿Este payload trae algo que le importe al puente KODA? (mensajes de clientes o entregas fallidas). */
function interesaAKoda(payload: WaPayload): boolean {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value
      if (!v) continue
      if ((v.messages ?? []).length > 0) return true
      if ((v.statuses ?? []).some((s) => s.status === 'failed')) return true
    }
  }
  return false
}

/**
 * Pasa el payload a la función `kodaWhatsApp`. Falla (lanza) solo si conviene que Meta REINTENTE:
 * red caída, timeout o 5xx. Un 4xx (secreto mal puesto, contrato distinto) se anota y no se reintenta:
 * repetirlo no lo arregla.
 */
async function forwardToKoda(payload: WaPayload): Promise<void> {
  const url = process.env.KODA_WA_URL
  const secret = process.env.KODA_BRIDGE_SECRET
  if (!url || !secret || !interesaAKoda(payload)) return

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-koda-secret': secret },
    body: JSON.stringify({ v: 1, action: 'webhook', payload }),
    signal: AbortSignal.timeout(20000),
  })
  if (res.status >= 500) throw new Error(`kodaWhatsApp respondió ${res.status}`)
  if (!res.ok) console.error(`[whatsapp] kodaWhatsApp rechazó el aviso (${res.status}); no se reintenta`)
}

function verify(req: Req, res: Res) {
  const params = new URL(req.url ?? '', 'http://localhost').searchParams
  const expected = process.env.WHATSAPP_VERIFY_TOKEN

  // `expected` debe existir: sin variable configurada nunca se acepta nada.
  if (
    expected &&
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === expected
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(params.get('hub.challenge') ?? '')
  }
  return res.status(403).send('Forbidden')
}

async function receive(req: Req, res: Res) {
  const payload = req.body as WaPayload | undefined
  if (payload?.object !== 'whatsapp_business_account') {
    return res.status(400).send('Bad Request')
  }

  // 1) Puente KODA primero: que un botón tocado («¡Sí, enviar demo!») no dependa de que Discord responda.
  //    Todo lo que hace kodaWhatsApp es idempotente, así que si Meta reintenta por otro motivo no se duplica nada.
  let kodaError: string | null = null
  try {
    await forwardToKoda(payload)
  } catch (err) {
    kodaError = err instanceof Error ? err.message : String(err)
    console.error('[whatsapp] No se pudo avisar a kodaWhatsApp:', kodaError)
  }

  // 2) Discord, como siempre.
  const discordUrl = process.env.DISCORD_WHATSAPP_WEBHOOK_URL
  if (!discordUrl) {
    console.error('[whatsapp] Falta DISCORD_WHATSAPP_WEBHOOK_URL')
    return res.status(500).send('Server misconfigured')
  }

  // Los avisos de estado (enviado/entregado/leído) no traen `messages`: se ignoran.
  const texts: string[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue
      for (const m of value.messages ?? []) texts.push(formatForDiscord(m, value))
    }
  }

  try {
    for (const text of texts) await sendToDiscord(discordUrl, text)
  } catch (err) {
    // 500 → Meta reintenta el envío, así que un fallo de Discord no pierde el mensaje.
    console.error('[whatsapp] No se pudo reenviar a Discord:', err instanceof Error ? err.message : err)
    return res.status(500).send('Forward failed')
  }

  // 500 → Meta reintenta (hasta ~7 días con espera creciente): no se pierde el toque de un botón.
  if (kodaError) return res.status(500).send('KODA forward failed')

  return res.status(200).send('EVENT_RECEIVED')
}

export default async function handler(req: Req, res: Res) {
  if (req.method === 'GET') return verify(req, res)
  if (req.method === 'POST') return receive(req, res)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).send('Method Not Allowed')
}
