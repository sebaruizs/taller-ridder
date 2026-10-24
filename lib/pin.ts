import { z } from "zod";

export const MAX_INTENTOS = 5;
export const BLOQUEO_MINUTOS = 15;

export const pinSchema = z.string().regex(/^\d{4,6}$/, "El PIN tiene que tener de 4 a 6 dígitos");

export type EstadoBloqueo = { intentosFallidos: number; bloqueadoHasta: Date | null };

export function estaBloqueado(u: EstadoBloqueo, ahora = new Date()): boolean {
  return Boolean(u.bloqueadoHasta && u.bloqueadoHasta > ahora);
}

export function trasIntentoFallido(u: EstadoBloqueo, ahora = new Date()): EstadoBloqueo {
  const base = u.bloqueadoHasta && u.bloqueadoHasta <= ahora ? 0 : u.intentosFallidos;
  const intentos = base + 1;
  if (intentos >= MAX_INTENTOS) {
    return { intentosFallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60_000) };
  }
  return { intentosFallidos: intentos, bloqueadoHasta: null };
}
