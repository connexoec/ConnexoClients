/**
 * Webhook de la WhatsApp Cloud API (Meta) → Discord.
 *
 * Vercel convierte este archivo en una función serverless en
 * `/api/webhooks/whatsapp`: es la URL pública HTTPS que Meta necesita.
 *
 *   GET  → verificación inicial de Meta (hub.mode / hub.verify_token / hub.challenge)
 *   POST → mensajes entrantes, reenviados como texto al webhook de Discord
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   WHATSAPP_VERIFY_TOKEN          token que se escribe también en el panel de Meta
 *   DISCORD_WHATSAPP_WEBHOOK_URL   URL del webhook del canal de Discord
 *
 * Ninguno de los dos valores va en el código: el repo se sube a GitHub y quien
 * tenga la URL del webhook de Discord puede escribir en el canal.
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

  return res.status(200).send('EVENT_RECEIVED')
}

export default async function handler(req: Req, res: Res) {
  if (req.method === 'GET') return verify(req, res)
  if (req.method === 'POST') return receive(req, res)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).send('Method Not Allowed')
}
