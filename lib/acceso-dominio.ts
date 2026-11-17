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

export function firmarAcceso(secreto: string, usuario: string, vence: number | string): string {
  return createHmac("sha256", secreto).update(`acceso|${usuario}|${vence}`).digest("hex");
}

// Para tests y para documentar el formato: así arma Acceso el valor de ?t=
export function armarEnlace(secreto: string, usuario: string, vence: number): string {
  return `${Buffer.from(usuario).toString("base64url")}.${vence}.${firmarAcceso(secreto, usuario, vence)}`;
}

export function verificarEnlace(t: string | null | undefined, secreto: string, ahora = Date.now()): EnlaceAcceso {
  const invalido = { ok: false, motivo: "invalido" } as const;
  if (!t || t.length > 400) return invalido;
  const partes = t.split(".");
  if (partes.length !== 3) return invalido;
  const [u64, venceTxt, firma] = partes;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(u64) || !/^\d{13,14}$/.test(venceTxt) || !/^[0-9a-f]{64}$/.test(firma)) return invalido;
  const usuario = Buffer.from(u64, "base64url").toString("utf8");
  // La firma se calcula sobre lo que llegó; recién después se mira si el usuario tiene forma de usuario.
  const esperada = Buffer.from(firmarAcceso(secreto, usuario, venceTxt), "hex");
  if (!timingSafeEqual(esperada, Buffer.from(firma, "hex"))) return invalido;
  const vence = Number(venceTxt);
  if (vence <= ahora) return { ok: false, motivo: "vencido" };
  // Acceso los emite con 2 minutos de vida: uno que vence más lejos no es de Acceso (o los relojes están corridos).
  if (vence > ahora + VIDA_ENLACE_MS) return invalido;
  const login = usuarioSchema.safeParse(usuario);
  if (!login.success || login.data !== usuario) return invalido;
  return { ok: true, usuario, vence, firma };
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
