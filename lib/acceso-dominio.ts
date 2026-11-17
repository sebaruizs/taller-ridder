import { createHmac, timingSafeEqual } from "node:crypto";
import { usuarioSchema } from "./credenciales";

export type { MotivoRechazo } from "./acceso-mensajes";

// Enlace firmado de un solo uso que emite Ridder Acceso (app.ridder.com.py) para entrar sin contraseña:
//   /entrar/acceso?t=<usuario en base64url>.<vence en ms>.<firma>
//   firma = HMAC-SHA256(ACCESO_SECRET, "acceso|<usuario>|<vence>") en hex
export const VIDA_ENLACE_MS = 2 * 60_000;
// Con menos que esto la clave no se usa: la puerta responde como si no estuviera configurada.
export const MIN_SECRETO = 32;


export type EnlaceAcceso = { ok: true; usuario: string; vence: number; firma: string } | { ok: false; motivo: "invalido" | "vencido" };

// "acceso": enlace de /entrar/acceso (un solo uso, 2 minutos). "movil": ficha de las APIs móviles (varios usos, 10 minutos;
// ridder-app/contratos/ACCESO-MOVIL.md 3.5). Mismo formato y misma clave; el origen va dentro de lo firmado, así una
// ficha no sirve como enlace ni al revés.
type Origen = "acceso" | "movil";
export const VIDA_FICHA_MS = 10 * 60_000;
const VIDA: Record<Origen, number> = { acceso: VIDA_ENLACE_MS, movil: VIDA_FICHA_MS };

function firmar(origen: Origen, secreto: string, usuario: string, vence: number | string): string {
  return createHmac("sha256", secreto).update(`${origen}|${usuario}|${vence}`).digest("hex");
}

export function firmarAcceso(secreto: string, usuario: string, vence: number | string): string {
  return firmar("acceso", secreto, usuario, vence);
}

export function firmarFicha(secreto: string, usuario: string, vence: number | string): string {
  return firmar("movil", secreto, usuario, vence);
}

// Para tests y para documentar el formato: así arma Acceso el valor de ?t=
export function armarEnlace(secreto: string, usuario: string, vence: number): string {
  return `${Buffer.from(usuario).toString("base64url")}.${vence}.${firmarAcceso(secreto, usuario, vence)}`;
}

// Igual para la ficha móvil, que viaja como "Authorization: Bearer <ficha>".
export function armarFicha(secreto: string, usuario: string, vence: number): string {
  return `${Buffer.from(usuario).toString("base64url")}.${vence}.${firmarFicha(secreto, usuario, vence)}`;
}

function verificar(origen: Origen, t: string | null | undefined, secreto: string, ahora: number): EnlaceAcceso {
  const invalido = { ok: false, motivo: "invalido" } as const;
  if (!t || t.length > 400) return invalido;
  const partes = t.split(".");
  if (partes.length !== 3) return invalido;
  const [u64, venceTxt, firma] = partes;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(u64) || !/^\d{13,14}$/.test(venceTxt) || !/^[0-9a-f]{64}$/.test(firma)) return invalido;
  const usuario = Buffer.from(u64, "base64url").toString("utf8");
  // La firma se calcula sobre lo que llegó; recién después se mira si el usuario tiene forma de usuario.
  const esperada = Buffer.from(firmar(origen, secreto, usuario, venceTxt), "hex");
  if (!timingSafeEqual(esperada, Buffer.from(firma, "hex"))) return invalido;
  const vence = Number(venceTxt);
  if (vence <= ahora) return { ok: false, motivo: "vencido" };
  // Acceso los emite con vida corta: uno que vence más lejos no es de Acceso (o los relojes están corridos).
  if (vence > ahora + VIDA[origen]) return invalido;
  const login = usuarioSchema.safeParse(usuario);
  if (!login.success || login.data !== usuario) return invalido;
  return { ok: true, usuario, vence, firma };
}

export function verificarEnlace(t: string | null | undefined, secreto: string, ahora = Date.now()): EnlaceAcceso {
  return verificar("acceso", t, secreto, ahora);
}

export function verificarFicha(t: string | null | undefined, secreto: string, ahora = Date.now()): EnlaceAcceso {
  return verificar("movil", t, secreto, ahora);
}

// Un solo uso: las firmas ya usadas se recuerdan en memoria hasta que vencen (corre una sola instancia).
const usadas = new Map<string, number>();

// true = primera vez que se ve esa firma (queda marcada); false = ya se usó.
export function marcarUsada(firma: string, vence: number, ahora = Date.now()): boolean {
  for (const [f, v] of usadas) if (v <= ahora) usadas.delete(f);
  if (usadas.has(firma)) return false;
  usadas.set(firma, vence);
  return true;
}
