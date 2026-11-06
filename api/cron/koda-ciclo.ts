/**
 * Cron diario del puente KODA → Connexo (Fase 5).
 *
 * Vercel lo llama una vez al día (ver `crons` en vercel.json) y esto despierta la función `kodaWhatsApp` de Supabase
 * (acción `ciclo`): vence las invitaciones sin respuesta, manda el aviso del día 5 de la prueba, desactiva las pruebas
 * terminadas y, a los 30 días, borra los datos de quien no aceptó o no contrató. Lo que hizo el ciclo se publica en el
 * canal de Discord de siempre, redactado en claro.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   KODA_WA_URL                    https://<ref>.supabase.co/functions/v1/kodaWhatsApp   (ya está, la usa el webhook)
 *   KODA_BRIDGE_SECRET             el secreto compartido del puente                      (ya está)
 *   DISCORD_WHATSAPP_WEBHOOK_URL   canal de Discord                                      (ya está)
 *   CRON_SECRET                    (opcional) si existe, Vercel lo manda como «Authorization: Bearer …» y solo así se acepta.
 *                                  Sin él, solo se acepta al agente de cron de Vercel («vercel-cron/1.0»).
 *
 * Es idempotente: ejecutarlo dos veces el mismo día no duplica avisos ni borra dos veces. Aunque cualquiera lo llamara,
 * el ciclo solo hace lo que corresponde por fechas; y el BORRADO exige además KODA_WA_PURGA=1 en Supabase.
 */

interface Req {
  method?: string
  headers?: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): unknown
  send(body: string): unknown
}

const DISCORD_MAX = 2000
const truncate = (s: string, max = DISCORD_MAX) => (s.length > max ? s.slice(0, max - 1) + '…' : s)

function cabecera(req: Req, nombre: string): string {
  const v = req.headers?.[nombre]
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

async function aDiscord(url: string, texto: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: truncate(texto), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Discord respondió ${res.status}`)
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).send('Method Not Allowed')
  }

  // Autenticación: con CRON_SECRET solo ese portador; sin él, solo el cron de Vercel.
  const secretoCron = process.env.CRON_SECRET
  if (secretoCron) {
    if (cabecera(req, 'authorization') !== `Bearer ${secretoCron}`) return res.status(401).send('Unauthorized')
  } else if (!/^vercel-cron\//i.test(cabecera(req, 'user-agent'))) {
    return res.status(401).send('Unauthorized')
  }

  const url = process.env.KODA_WA_URL
  const secret = process.env.KODA_BRIDGE_SECRET
  if (!url || !secret) {
    console.error('[koda-ciclo] Faltan KODA_WA_URL / KODA_BRIDGE_SECRET')
    return res.status(500).send('Server misconfigured')
  }

  let data: { ok?: boolean; resumen?: unknown; errores?: string[]; eventos?: Array<{ texto?: string }> } = {}
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-koda-secret': secret },
      body: JSON.stringify({ v: 1, action: 'ciclo' }),
      signal: AbortSignal.timeout(55000),
    })
    data = (await r.json().catch(() => ({}))) as typeof data
    if (!r.ok) throw new Error(`kodaWhatsApp respondió ${r.status}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[koda-ciclo] El ciclo no corrió:', msg)
    // Si Discord está configurado, se avisa: un ciclo caído no debe pasar en silencio.
    const discord = process.env.DISCORD_WHATSAPP_WEBHOOK_URL
    if (discord) await aDiscord(discord, `❗ El ciclo diario de KODA no corrió: ${msg}`).catch(() => {})
    return res.status(502).send('Cycle failed')
  }

  // Lo que hizo el ciclo, en Discord. Un fallo de Discord no repite el ciclo (es idempotente y ya se ejecutó).
  const discord = process.env.DISCORD_WHATSAPP_WEBHOOK_URL
  if (discord) {
    for (const e of data.eventos ?? []) {
      if (typeof e?.texto !== 'string') continue
      try { await aDiscord(discord, e.texto) } catch (err) { console.error('[koda-ciclo] Discord:', err instanceof Error ? err.message : err) }
    }
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(200).send(JSON.stringify({ ok: data.ok !== false, resumen: data.resumen ?? null, errores: data.errores ?? [] }))
}
