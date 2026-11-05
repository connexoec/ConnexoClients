// Aplica el saneo de contraste (paleta.mjs) a recursos.json SIN necesitar las demos locales.
// Idempotente. Imprime antes → después de cada paquete.   Uso: node supabase/koda-recursos/sanear-recursos.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanearPaleta, paletaLogo, razon } from "./paleta.mjs";

const archivo = path.join(path.dirname(fileURLToPath(import.meta.url)), "recursos.json");
const paquetes = JSON.parse(fs.readFileSync(archivo, "utf8"));
for (const p of paquetes) {
  const antes = { btn: p.perfil.buttonColor, bt: p.perfil.buttonTextColor, tx: p.perfil.textColor };
  Object.assign(p.perfil, sanearPaleta(p.perfil));
  p.logo = { etiqueta: p.logo.etiqueta, ...paletaLogo({ fondo: p.perfil.backgroundColor, acento: p.perfil.buttonColor, texto: p.perfil.textColor }) };
  const f = p.perfil.backgroundColor, a = p.perfil.buttonColor;
  console.log(`${p.clave.padEnd(13)} acento ${antes.btn} → ${a} (${razon(a, f).toFixed(1)} sobre fondo) · texto botón ${antes.bt} → ${p.perfil.buttonTextColor} (${razon(p.perfil.buttonTextColor, a).toFixed(1)} sobre acento)`);
}
fs.writeFileSync(archivo, JSON.stringify(paquetes, null, 2) + "\n");
