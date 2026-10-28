import { z } from "zod";
import { ROLES } from "./db/schema";

export const MAX_INTENTOS = 5;
export const BLOQUEO_MINUTOS = 15;

export const usuarioSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, "Usuario: de 3 a 30 caracteres, sin espacios (letras, números, punto, guion)");

// De qué etiquetas de Odoo sale el contacto de cada rol. El jefe (y el admin) puede ser mecánico o ejecutivo.
export type EtiquetaContacto = "mecanico" | "ejecutivo";
export function etiquetasDelRol(rol: (typeof ROLES)[number]): EtiquetaContacto[] {
  if (rol === "mecanico") return ["mecanico"];
  if (rol === "cobrador") return ["ejecutivo"];
  return ["mecanico", "ejecutivo"];
}

export function textoEtiquetas(etiquetas: EtiquetaContacto[]): string {
  return etiquetas.map((e) => `«${e}»`).join(" o ");
}

// Para comparar nombres de personas: sin mayúsculas, sin tildes y sin espacios de más.
export function normalizarNombre(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// El contacto de Odoo que corresponde a un nombre: solo si hay exactamente uno con ese nombre.
export function contactoPorNombre<T extends { id: number; nombre: string }>(nombre: string, contactos: T[]): { contacto: T } | { contacto: null; motivo: string } {
  const buscado = normalizarNombre(nombre);
  const iguales = [...new Map(contactos.filter((c) => normalizarNombre(c.nombre) === buscado).map((c) => [c.id, c])).values()];
  if (iguales.length === 1) return { contacto: iguales[0] };
  return { contacto: null, motivo: iguales.length ? `varias coincidencias: ${iguales.map((c) => c.nombre).join(", ")}` : "sin coincidencia" };
}

export const passwordSchema = z.string().min(8, "La contraseña tiene que tener al menos 8 caracteres").max(200);

export const datosUsuarioSchema = z.object({
  nombre: z.string().trim().min(2, "Falta el nombre").max(80),
  rol: z.enum(ROLES, { error: "Rol inválido" }),
  odooPartnerId: z.number().int().positive().nullable(),
  activo: z.boolean().default(true),
  permisosOff: z.array(z.string().max(40)).max(20).default([]),
});

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

// Límite por IP en memoria (una sola instancia): frena probar muchos usuarios desde el mismo lugar.
const MAX_POR_IP = 20;
const VENTANA_IP_MS = 15 * 60_000;
const porIp = new Map<string, { desde: number; fallos: number }>();

export function ipBloqueada(ip: string, ahora = Date.now()): boolean {
  const r = porIp.get(ip);
  if (!r || ahora - r.desde > VENTANA_IP_MS) return false;
  return r.fallos >= MAX_POR_IP;
}

export function registrarFalloIp(ip: string, ahora = Date.now()): void {
  const r = porIp.get(ip);
  if (!r || ahora - r.desde > VENTANA_IP_MS) porIp.set(ip, { desde: ahora, fallos: 1 });
  else r.fallos += 1;
  if (porIp.size > 5000) for (const [k, v] of porIp) if (ahora - v.desde > VENTANA_IP_MS) porIp.delete(k);
}
