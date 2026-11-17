// API móvil de Taller (Ridder App): formatos y reglas sin I/O. Contrato: ridder-app/contratos/SINCRONIZACION.md.
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ESTADOS, type EstadoOrden } from "./taller";

// ---------- credencial de prueba (solo desarrollo) ----------

export const MIN_TOKEN_PRUEBA = 16;

const resumen = (v: string) => createHash("sha256").update(v).digest();

/**
 * "Bearer <usuario>.<token>" → el usuario, si el token coincide. El usuario va adelante, como en la ficha que
 * propone ACCESO-MOVIL.md (3.5); puede tener puntos, así que se corta en el último.
 * null: no hay credencial, el token no coincide, o el modo de prueba está apagado (producción o token corto).
 */
export function usuarioDeTokenDePrueba(authorization: string | null, token: string, produccion: boolean): string | null {
  if (produccion || token.length < MIN_TOKEN_PRUEBA) return null;
  if (!authorization?.startsWith("Bearer ")) return null;
  const valor = authorization.slice(7).trim();
  const corte = valor.lastIndexOf(".");
  if (corte <= 0) return null;
  const usuario = valor.slice(0, corte);
  if (!timingSafeEqual(resumen(valor.slice(corte + 1)), resumen(token))) return null;
  return usuario;
}

// ---------- registros que manda el teléfono ----------

export const TIPOS_TALLER = ["taller.inicio", "taller.avance", "taller.cierre"] as const;
export const TIPO_DEVOLUCION = "devolucion.recepcion";
export const TIPOS_REGISTRO = [...TIPOS_TALLER, TIPO_DEVOLUCION] as const;
export type TipoRegistro = (typeof TIPOS_REGISTRO)[number];
export type TipoTaller = (typeof TIPOS_TALLER)[number];

export const MAX_FOTOS_REGISTRO = 12;
// El contrato dice 150-300 KB por foto; se deja margen.
export const MAX_BYTES_FOTO_MOVIL = 1024 * 1024;
// Todo el pedido (JSON con las fotos en base64).
export const MAX_BYTES_PEDIDO = 18 * 1024 * 1024;

/** Lo que el teléfono no puede corregir reintentando: se contesta 422 y el motivo se le muestra a la persona. */
export class Rechazo extends Error {}

const fotoSchema = z.object({
  id: z.string().trim().min(1).max(100),
  toma: z.string().trim().max(40).default(""),
  datos: z.string().min(1),
});

export const registroSchema = z.object({
  id: z.uuid("El id del registro no es válido"),
  tipo: z.string().trim().min(1).max(60),
  creado: z.iso.datetime({ offset: true, error: "La hora de carga no es válida" }),
  datos: z.record(z.string(), z.unknown()),
  fotos: z.array(fotoSchema).max(MAX_FOTOS_REGISTRO, `Máximo ${MAX_FOTOS_REGISTRO} fotos`).default([]),
});
export type RegistroMovil = z.infer<typeof registroSchema>;
export type FotoMovil = z.infer<typeof fotoSchema>;

export function esTipoConocido(tipo: string): tipo is TipoRegistro {
  return (TIPOS_REGISTRO as readonly string[]).includes(tipo);
}

const nota = z
  .string()
  .max(4000, "La nota es demasiado larga")
  .optional()
  .transform((v) => v?.trim() ?? "");

export const datosTallerSchema = z.object({
  tareaId: z.string().trim().regex(/^\d+$/, "La tarea no existe en Taller").transform(Number),
  nota,
  // Propuesta de cambio al contrato: Taller registra el odómetro al reportar el trabajo. Opcional; 0 = sin dato.
  odometro: z.number().min(0).max(2_000_000).optional(),
});
export type DatosTaller = z.infer<typeof datosTallerSchema>;

// "fin_contrato" se sigue aceptando en el formato para poder rechazarlo con un motivo legible: con el contrato
// finalizado la moto queda con el cliente (regla de Sebastián, 2026-11-17).
export const MOTIVOS_DEVOLUCION = ["fin_contrato", "recupero", "cambio"] as const;
export type MotivoDevolucion = (typeof MOTIVOS_DEVOLUCION)[number];

export const datosDevolucionSchema = z.object({
  vehiculo: z.object({
    id: z.string().trim().regex(/^\d+$/, "La moto no existe en Taller").transform(Number),
    chapa: z.string().trim().min(1).max(20),
    modelo: z.string().max(200).optional().default(""),
  }),
  kilometraje: z.number({ error: "Falta el kilometraje" }).int("El kilometraje tiene que ser un número entero").min(0).max(2_000_000),
  entregoLlave: z.boolean({ error: "Falta indicar si entregó la llave" }),
  danos: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  observaciones: z.string().max(2000).optional().default(""),
  // Propuesta de cambio al contrato: hoy no viaja; sin él se registra como "devolucion".
  motivo: z.enum(MOTIVOS_DEVOLUCION).optional(),
});
export type DatosDevolucion = z.infer<typeof datosDevolucionSchema>;

/** Valida con zod y convierte el primer error en un rechazo legible. */
export function validar<T extends z.ZodType>(schema: T, valor: unknown): z.infer<T> {
  const r = schema.safeParse(valor);
  if (!r.success) throw new Rechazo(r.error.issues[0]?.message ?? "Datos inválidos");
  return r.data;
}

/** Reglas de cada tipo de Taller que no dependen del servidor: nota y fotos obligatorias. */
export function exigirContenido(tipo: TipoTaller, datos: DatosTaller, fotos: number): void {
  if (tipo === "taller.avance" && !datos.nota && fotos === 0) throw new Rechazo("El avance no tiene nota ni fotos");
  if (tipo === "taller.cierre") {
    if (!datos.nota) throw new Rechazo("Para cerrar la tarea hace falta una nota de lo que se hizo");
    if (fotos === 0) throw new Rechazo("Para cerrar la tarea hace falta al menos una foto");
  }
}

/** JPEG en base64, con o sin el prefijo "data:image/jpeg;base64,". */
export function decodificarFoto(f: FotoMovil): Buffer {
  const crudo = f.datos.replace(/^data:image\/jpe?g;base64,/i, "");
  if (crudo.startsWith("data:")) throw new Rechazo("Las fotos tienen que ser JPEG");
  const datos = Buffer.from(crudo, "base64");
  if (datos.length < 4 || datos[0] !== 0xff || datos[1] !== 0xd8 || datos[2] !== 0xff) throw new Rechazo("Una de las fotos no es un JPEG válido");
  if (datos.length > MAX_BYTES_FOTO_MOVIL) throw new Rechazo("Una de las fotos es demasiado grande (máximo 1 MB)");
  return datos;
}

// ---------- tareas del mecánico ----------

export type EstadoTarea = "pendiente" | "en_curso" | "lista";

/**
 * Una orden de Odoo es una tarea. "En proceso" sin inicio cargado desde el teléfono = pendiente; con inicio = en
 * curso; "Listo para verificar" (el mecánico ya reportó) = lista.
 */
export function estadoDeTarea(estado: EstadoOrden, iniciada: boolean): EstadoTarea | null {
  if (estado === "running") return iniciada ? "en_curso" : "pendiente";
  if (estado === "cancelled") return "lista";
  return null;
}

/**
 * Si la orden admite este registro. null = sí; si no, el motivo para la persona.
 * cierreRepetido: la orden ya se reportó con este mismo id (un reintento del cierre).
 */
export function motivoRechazoTarea(p: {
  tipo: TipoTaller;
  estado: EstadoOrden;
  mecanicoId: number | null;
  mecanicoNombre: string | null;
  partnerId: number | null;
}): string | null {
  if (!p.partnerId) return "Tu usuario de Taller no está vinculado a un contacto de Odoo. Pedile al admin que lo vincule.";
  if (p.mecanicoId && p.mecanicoId !== p.partnerId) return `La tarea fue reasignada a ${p.mecanicoNombre ?? "otro mecánico"}`;
  switch (p.estado) {
    case "running":
      return null;
    case "new":
      return "La orden todavía no está En proceso: la pasa el jefe de taller desde el tablero";
    case "to_be_paid":
      return `La orden está «${ESTADOS.to_be_paid}»: hablá con el jefe de taller`;
    case "cancelled":
      return p.tipo === "taller.cierre" ? "La tarea ya se había cerrado" : "La tarea ya se cerró: no admite más cambios";
    case "done":
      return "La orden ya está finalizada";
    default:
      return "La orden no está En proceso";
  }
}

// ---------- devoluciones ----------

const MOTIVO_TEXTO: Record<MotivoDevolucion, string> = { fin_contrato: "Fin de contrato", recupero: "Recupero", cambio: "Cambio de moto" };

/** Taller distingue devolución y recupero; fin de contrato y cambio son devoluciones. */
export function tipoDeDevolucion(motivo: MotivoDevolucion | undefined): "devolucion" | "recupero" {
  return motivo === "recupero" ? "recupero" : "devolucion";
}

/** La observación que se guarda (y se ve en Devoluciones de la web) con lo cargado en el teléfono. */
export function observacionDevolucion(d: DatosDevolucion): string {
  const km = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(d.kilometraje);
  const partes = [
    ...(d.motivo ? [MOTIVO_TEXTO[d.motivo]] : []),
    `Km: ${km}`,
    d.entregoLlave ? "Entregó la llave" : "No entregó la llave",
    d.danos.length ? `Daños: ${d.danos.join(", ")}` : "Sin daños marcados",
  ];
  const obs = d.observaciones.trim();
  return `${partes.join(" · ")}${obs ? `\n${obs}` : ""}\n(Cargado desde Ridder App)`;
}

/** "2026-11-17" → "17/11/2026". */
export const fechaCorta = (f: string) => f.slice(0, 10).split("-").reverse().join("/");

// ---------- notas en el historial de la orden (Odoo) ----------

const NOTA = { message_type: "comment", subtype_xmlid: "mail.mt_note", body_is_html: true } as const;
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** "17/11 10:42", en hora de Asunción: cuándo se cargó en el teléfono (puede ser bastante antes de llegar). */
export function horaDelTelefono(iso: string): string {
  return new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function payloadNotaInicio(p: { mecanico: string; creado: string }) {
  return { body: `<p><b>Trabajo empezado por ${escapar(p.mecanico)}</b> (Ridder App, ${horaDelTelefono(p.creado)}).</p>`, ...NOTA };
}

export function payloadNotaAvance(p: { mecanico: string; creado: string; nota: string; adjuntos: number[] }) {
  const texto = p.nota ? `<p>${escapar(p.nota).replace(/\r?\n/g, "<br>")}</p>` : "";
  return {
    body: `<p><b>Avance de ${escapar(p.mecanico)}</b> (Ridder App, ${horaDelTelefono(p.creado)}).</p>${texto}`,
    ...NOTA,
    ...(p.adjuntos.length ? { attachment_ids: p.adjuntos } : {}),
  };
}
