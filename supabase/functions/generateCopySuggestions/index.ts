// Supabase Edge Function: generateCopySuggestions
// Genera sugerencias de copy (biografía o título/cargo) usando Claude API.
//
// Despliegue (una sola vez):
//   1. supabase login
//   2. supabase link --project-ref <TU_PROJECT_REF>
//   3. supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   4. supabase functions deploy generateCopySuggestions
//
// El cliente ya lo invoca con: supabase.functions.invoke('generateCopySuggestions', { body: { type, keywords } })

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Modelo: Sonnet 4.6 da buen copy de marketing. Para abaratar costos puedes
// cambiarlo a "claude-haiku-4-5-20251001" (más rápido y barato).
const MODEL = "claude-sonnet-4-6";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, keywords } = await req.json().catch(() => ({ type: "bio", keywords: "" }));
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY en el proyecto.");

    const isTitle = type === "title";
    const instruction = isTitle
      ? "Genera 4 títulos o cargos profesionales cortos (máximo 5 palabras cada uno), atractivos y claros."
      : "Genera 4 biografías cortas y atractivas para un perfil profesional (1 o 2 frases, máximo 160 caracteres cada una), con tono cercano y profesional.";

    const prompt =
      `${instruction}\n` +
      `Contexto o palabras clave del negocio/persona: "${keywords || "negocio profesional"}".\n` +
      `Escribe en español. Responde ÚNICAMENTE con un arreglo JSON de strings, sin texto adicional ni explicaciones.\n` +
      `Ejemplo de formato exacto: ["opción uno", "opción dos", "opción tres", "opción cuatro"]`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error?.message || `Claude API respondió ${resp.status}`);
    }

    const text: string = data?.content?.[0]?.text ?? "[]";
    let suggestions: string[] = [];
    try {
      const match = text.match(/\[[\s\S]*\]/);
      suggestions = JSON.parse(match ? match[0] : text);
    } catch {
      // Fallback: separar por líneas si no vino JSON limpio.
      suggestions = text
        .split("\n")
        .map((s) => s.replace(/^[-*\d.\s"]+/, "").replace(/[",]+$/, "").trim())
        .filter(Boolean)
        .slice(0, 4);
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    // Devolvemos 200 con suggestions vacío para que el cliente no rompa.
    return new Response(
      JSON.stringify({ error: (e as Error).message, suggestions: [] }),
      { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
