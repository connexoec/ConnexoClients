// Saneo de contraste de la paleta de un paquete del banco (WCAG 2.x).
//
// El mismo cálculo vive, copiado, en `supabase/functions/kodaIntake/index.ts` (`sanearPaleta` y `logoSvg`):
// la función se pega en el panel de Supabase como un solo archivo, así que no puede importar de aquí.
// Si cambias una regla, cámbiala en los dos sitios.
//
// Reglas (todas contra el fondo OSCURO del paquete):
//   · acento (buttonColor) como TEXTO: razón >= ACENTO_MIN. Si no llega se aclara mezclándolo con blanco
//     (mismo tono, más luminoso). Sobre superficies teñidas (tarjetas, píldoras) el margen se come, de ahí 6.5.
//   · texto de botón (buttonTextColor): razón >= 4.5 sobre el acento. Se conserva el actual si ya cumple;
//     si no, el fondo del paquete, y si tampoco, negro o blanco.
//   · texto general (textColor): razón >= 7 sobre el fondo.
export const ACENTO_MIN = 6.5;
export const BOTON_MIN = 4.5;
export const TEXTO_MIN = 7;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const esHex = (s) => typeof s === "string" && HEX.test(s.trim());

export const aRgb = (hex) => {
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
export const aHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

export const luminancia = (hex) => {
  const [r, g, b] = aRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const razon = (a, b) => {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Mezcla `a` con `b`: t = 0 → a, t = 1 → b. */
export const mezclar = (a, b, t) => {
  const x = aRgb(a), y = aRgb(b);
  return aHex(x.map((v, i) => v + (y[i] - v) * t));
};

/** Aclara `hex` (hacia blanco) hasta que contraste >= minimo con `fondo`. */
export const aclarar = (hex, fondo, minimo) => {
  if (razon(hex, fondo) >= minimo) return hex.toLowerCase();
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const c = mezclar(hex, "#ffffff", t);
    if (razon(c, fondo) >= minimo) return c;
  }
  return "#ffffff";
};

/** Color de texto con mejor contraste sobre `fondo`, probando primero los candidatos dados. */
export const textoSobre = (fondo, candidatos, minimo = BOTON_MIN) => {
  const lista = candidatos.filter(esHex);
  for (const c of lista) if (razon(c, fondo) >= minimo) return c.toLowerCase();
  const todos = [...lista, "#000000", "#ffffff"];
  return todos.reduce((mejor, c) => (razon(c, fondo) > razon(mejor, fondo) ? c : mejor)).toLowerCase();
};

/**
 * @param {{ backgroundColor?: string, buttonColor?: string, buttonTextColor?: string, textColor?: string }} p
 * @returns {{ buttonColor?: string, buttonTextColor?: string, textColor?: string }} solo lo que hay que cambiar
 */
export function sanearPaleta(p) {
  const fondo = p.backgroundColor;
  if (!esHex(fondo)) return {};
  const salida = {};
  let acento = p.buttonColor;
  if (esHex(acento)) {
    const nuevo = aclarar(acento, fondo, ACENTO_MIN);
    if (nuevo !== acento.toLowerCase()) salida.buttonColor = nuevo;
    acento = nuevo;
    const bt = textoSobre(acento, [p.buttonTextColor, fondo, "#0b0b0b"]);
    if (bt !== String(p.buttonTextColor ?? "").toLowerCase()) salida.buttonTextColor = bt;
  }
  if (esHex(p.textColor) && razon(p.textColor, fondo) < TEXTO_MIN) {
    salida.textColor = textoSobre(fondo, ["#ffffff"], TEXTO_MIN);
  }
  return salida;
}

/** Logo provisional: degradado OSCURO (fondo → fondo con un 20 % de acento) y texto/rótulo legibles encima. */
export function paletaLogo({ fondo, acento, texto }) {
  const f = esHex(fondo) ? fondo : "#111111";
  const extremo = mezclar(f, esHex(acento) ? acento : "#ff6b35", 0.2);
  const a = aclarar(esHex(acento) ? acento : "#ff6b35", f, 4.5);
  const peorRazon = (c) => Math.min(razon(c, f), razon(c, extremo));
  const candidatos = [texto, "#ffffff", "#000000"].filter(esHex).map((c) => c.toLowerCase());
  const t = candidatos.find((c) => peorRazon(c) >= 7) ?? candidatos.reduce((m, c) => (peorRazon(c) > peorRazon(m) ? c : m));
  return { fondo: f, acento: a, texto: t };
}
