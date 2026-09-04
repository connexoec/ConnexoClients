// Supabase Edge Function: extractCatalog
// Lee la foto de una carta física, un menú impreso o un folleto de servicios y
// extrae los productos de forma estructurada usando Claude (visión).
//
// Despliegue (una sola vez):
//   1. supabase login
//   2. supabase link --project-ref <TU_PROJECT_REF>
//   3. supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (si aún no está puesto)
//   4. supabase functions deploy extractCatalog --no-verify-jwt
//
// El cliente lo invoca con:
//   supabase.functions.invoke('extractCatalog', { body: { images: [{ data, mediaType }] } })
// donde `data` es la imagen en base64 (sin el prefijo data:) y `mediaType`
// algo como "image/jpeg". Se aceptan varias imágenes (una carta puede tener
// varias páginas).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Sonnet 4.6 tiene visión y devuelve JSON estructurado con fiabilidad. Para
// abaratar se puede probar "claude-haiku-4-5-20251001" (más rápido y barato).
const MODEL = "claude-sonnet-4-6";

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

interface VisionImage {
  data: string;       // base64 sin prefijo
  mediaType: string;  // p.ej. image/jpeg
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const images: VisionImage[] = Array.isArray(body?.images) ? body.images : [];

    const valid = images
      .filter((img) => img && typeof img.data === "string" && img.data.length > 0)
      .map((img) => ({
        data: img.data,
        mediaType: ALLOWED_MEDIA.has(img.mediaType) ? img.mediaType : "image/jpeg",
      }))
      .slice(0, 5); // tope de seguridad: hasta 5 páginas por análisis

    if (valid.length === 0) {
      throw new Error("No se recibió ninguna imagen para analizar.");
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY en el proyecto.");

    const instruction =
      "Eres un asistente que digitaliza catálogos. Analiza la(s) imagen(es) de una " +
      "carta física, un menú impreso, una lista de precios o un folleto de servicios y " +
      "extrae CADA producto o servicio que aparezca.\n\n" +
      "Para cada uno devuelve:\n" +
      '- "name": el nombre del producto o servicio (obligatorio, tal cual aparece).\n' +
      '- "category": la sección/categoría bajo la que está listado (ej. "Entradas", ' +
      '"Bebidas", "Cortes de cabello"). Si no hay secciones, deja "".\n' +
      '- "price": el precio tal como aparece, incluyendo el símbolo si lo tiene ' +
      '(ej. "$12.50", "8,00"). Si no tiene precio visible, deja "".\n' +
      '- "description": la descripción o ingredientes si aparecen; si no, deja "".\n\n' +
      "Reglas:\n" +
      "- Extrae SOLO lo que realmente se ve; no inventes productos, precios ni descripciones.\n" +
      "- Respeta el idioma original del texto de la imagen.\n" +
      "- Si un producto tiene varios tamaños/precios, crea una entrada por variante e " +
      'indícalo en el nombre (ej. "Pizza Margarita (Grande)").\n' +
      "- Ignora encabezados, teléfonos, direcciones, horarios y textos que no sean productos.\n\n" +
      'Responde ÚNICAMENTE con JSON válido, sin texto adicional ni explicaciones, con esta ' +
      'forma exacta: {"products":[{"name":"","category":"","price":"","description":""}]}';

    const content: any[] = valid.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    }));
    content.push({ type: "text", text: instruction });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error?.message || `Claude API respondió ${resp.status}`);
    }

    const text: string = data?.content?.[0]?.text ?? "{}";
    let products: any[] = [];
    try {
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : text);
      products = Array.isArray(parsed?.products) ? parsed.products : [];
    } catch {
      products = [];
    }

    // Saneamiento básico: solo strings, y descarta entradas sin nombre.
    const clean = products
      .map((p) => ({
        name: String(p?.name ?? "").trim(),
        category: String(p?.category ?? "").trim(),
        price: String(p?.price ?? "").trim(),
        description: String(p?.description ?? "").trim(),
      }))
      .filter((p) => p.name.length > 0)
      .slice(0, 300);

    return new Response(JSON.stringify({ products: clean }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    // 200 con products vacío para que el cliente no rompa; el mensaje va aparte.
    return new Response(
      JSON.stringify({ error: (e as Error).message, products: [] }),
      { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
