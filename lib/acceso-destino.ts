// Etapa 2 de Ridder Acceso (CONTRATO.md de Acceso, sección 5): a qué pantalla de Taller volver después de pasar por
// Acceso. Viaja sin firmar como `a` en ACCESO_URL/ir/taller?a=<ruta> y vuelve en /entrar/acceso?…&a=<ruta>: por eso
// solo se acepta una ruta relativa de Taller, nunca una dirección completa.

export const MAX_RUTA = 2000;
// La pone proxy.ts en cada página con la ruta pedida (los layouts no la reciben de otra forma).
export const RUTA_HEADER = "x-taller-ruta";

// Copia de rutaSegura en Ridder-acceso/src/destino.js (la referencia; sus casos están en tests/acceso-destino.test.ts).
// Devuelve la ruta si es segura, o null. "/ordenes/5?x=1" sí; "//otro.com", "/\otro.com", "https://…" no.
export function rutaSegura(a: unknown): string | null {
  if (typeof a !== "string" || !a || a.length > MAX_RUTA) return null;
  if (a[0] !== "/") return null; // relativa al módulo
  if (a[1] === "/" || a[1] === "\\") return null; // "//host" o "/\host": el navegador lo toma como otro sitio
  if (/[\u0000-\u001f\u007f\s\\]/.test(a)) return null; // sin espacios, controles ni barras invertidas en ningún lado
  let decodificada: string;
  try {
    decodificada = decodeURIComponent(a);
  } catch {
    return null;
  }
  // Lo mismo después de decodificar: "/%2F%2Fotro.com" o "/%5Cotro.com" tampoco
  if (decodificada[1] === "/" || decodificada[1] === "\\" || /[\u0000-\u001f\u007f]/.test(decodificada)) return null;
  // En el camino (antes de ? o #): ni "//" ni segmentos "." o "..".
  for (const r of [a, decodificada]) {
    const camino = r.split(/[?#]/)[0];
    if (camino.includes("//") || camino.split("/").some((seg) => seg === "." || seg === "..")) return null;
  }
  return a;
}

// Adónde volver después de /entrar/acceso. Además de la regla de Acceso: tiene que poder ir en la cabecera Location
// (solo ASCII; Acceso manda la ruta ya codificada) y no puede ser otra vez el ingreso (/ingresar, /entrar/…).
export function destinoDeVuelta(a: unknown): string | null {
  const r = rutaSegura(a);
  if (!r || !/^[\x21-\x7e]+$/.test(r)) return null;
  const camino = r.split(/[?#]/)[0];
  if (/^\/(ingresar|entrar)(\/|$)/.test(camino)) return null;
  return r;
}

// Id público de la sesión de Acceso (`s`): 32 hexadecimales. Acceso lo manda en minúsculas.
export function idSesionAcceso(s: unknown): string | null {
  return typeof s === "string" && /^[0-9a-f]{32}$/.test(s) ? s : null;
}

// ACCESO_URL/ir/taller?a=<ruta codificada>. Acceso pide ingresar si hace falta y vuelve con el enlace firmado.
export function enlaceIrATaller(accesoUrl: string, ruta: string | null): string {
  const base = accesoUrl.replace(/\/+$/, "");
  const r = destinoDeVuelta(ruta);
  return r && r !== "/" ? `${base}/ir/taller?a=${encodeURIComponent(r)}` : `${base}/ir/taller`;
}

// Ruta actual sin los parámetros internos de Next (_rsc en las navegaciones del lado del cliente).
export function rutaPedida(pathname: string, search: string): string {
  const q = new URLSearchParams(search);
  q.delete("_rsc");
  const resto = q.toString();
  return resto ? `${pathname}?${resto}` : pathname;
}
