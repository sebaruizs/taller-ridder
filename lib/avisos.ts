import "server-only";
import { after } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import type { EstadoOrden } from "./taller";

// Avisos al teléfono (app Gestiones). Taller no habla con Apple ni Google: le pide a Ridder Acceso que avise.
//   POST <ACCESO_URL>/api/acceso/avisos   Authorization: Bearer <ACCESO_AVISOS_SECRET>   X-Ridder-Modulo: taller
// Sin ACCESO_URL o sin ACCESO_AVISOS_SECRET no hace nada. Nunca corta ni demora la operación que lo dispara: sale
// después de responderle a quien hizo el cambio, con un log y sin reintentos.
// Acceso responde 202 {enviados, sinTelefono, repetidos, desconocidos} a los 8 s como mucho; 401/403 clave o módulo
// mal, 503 sin clave cargada, 400 texto demasiado largo, 404 usuario inexistente.
const TIEMPO_MAXIMO_MS = 10_000;
const MIN_SECRETO = 32;
// Acceso recibe hasta 50 usuarios por llamada.
export const TANDA = 50;

type Texto = { titulo: string; cuerpo: string; ruta: string; clave: string };
export type Aviso = Texto & ({ usuario: string } | { usuarios: string[] });

// Los textos se ven con la pantalla bloqueada: genéricos, sin chapa, cliente ni descripción.
// "clave" identifica el aviso para que Acceso no lo repita. Devuelta y desbloqueada pueden pasar más de una vez con
// la misma orden, así que llevan el momento (en segundos); como acá no se reintenta, no hay repetidos que filtrar.
export function avisoTareaAsignada(ordenId: number, usuario: string): Aviso {
  return { usuario, titulo: "Taller", cuerpo: "Tenés una tarea nueva", ruta: `/tareas/${ordenId}`, clave: `taller.tarea.${ordenId}.asignada.${usuario}` };
}
export function avisoTareaDevuelta(ordenId: number, usuario: string, momento: number): Aviso {
  return { usuario, titulo: "Taller", cuerpo: "Te devolvieron una tarea", ruta: `/tareas/${ordenId}`, clave: `taller.tarea.${ordenId}.devuelta.${usuario}.${momento}` };
}
export function avisoTareaDesbloqueada(ordenId: number, usuario: string, momento: number): Aviso {
  return { usuario, titulo: "Taller", cuerpo: "Se desbloqueó una tarea", ruta: `/tareas/${ordenId}`, clave: `taller.tarea.${ordenId}.desbloqueada.${usuario}.${momento}` };
}
// Sin mecánico: la tarea es de quien la tome, se avisa a todos y se abre la lista.
export function avisoTareaDisponible(ordenId: number, usuarios: string[]): Aviso {
  return { usuarios, titulo: "Taller", cuerpo: "Hay una tarea nueva disponible", ruta: "/tareas", clave: `taller.tarea.${ordenId}.disponible` };
}
export function avisoTareaDesbloqueadaParaTodos(ordenId: number, usuarios: string[], momento: number): Aviso {
  return { usuarios, titulo: "Taller", cuerpo: "Se desbloqueó una tarea", ruta: "/tareas", clave: `taller.tarea.${ordenId}.desbloqueada.${momento}` };
}

// null = avisos apagados: falta la URL de Acceso o la clave (o es demasiado corta).
export function destinoAvisos(e: { ACCESO_URL: string; ACCESO_AVISOS_SECRET: string }): { url: string; secreto: string } | null {
  if (!/^https?:\/\//.test(e.ACCESO_URL) || e.ACCESO_AVISOS_SECRET.length < MIN_SECRETO) return null;
  return { url: `${e.ACCESO_URL.replace(/\/+$/, "")}/api/acceso/avisos`, secreto: e.ACCESO_AVISOS_SECRET };
}

export async function enviarAviso(aviso: Aviso): Promise<"enviado" | "apagado" | "fallo"> {
  const d = destinoAvisos(env());
  if (!d) return "apagado";
  try {
    const r = await fetch(d.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${d.secreto}`, "X-Ridder-Modulo": "taller" },
      body: JSON.stringify(aviso),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      cache: "no-store",
    });
    if (!r.ok) {
      console.warn(`[avisos] Acceso respondió ${r.status} para ${aviso.clave}`);
      return "fallo";
    }
    const cuerpo = (await r.json().catch(() => ({}))) as { enviados?: number; sinTelefono?: boolean };
    console.log(`[avisos] ${aviso.clave}: enviados ${cuerpo.enviados ?? "?"}${cuerpo.sinTelefono ? " (sin teléfono registrado)" : ""}`);
    return "enviado";
  } catch (e) {
    console.warn(`[avisos] no se pudo avisar ${aviso.clave}: ${e instanceof Error ? e.message : String(e)}`);
    return "fallo";
  }
}

// Usuarios activos de Taller cuyo contacto de Odoo es ese mecánico (el criterio de la lista de tareas), sin quien hizo el cambio.
async function usuariosDelMecanico(partnerId: number, autorId: number): Promise<string[]> {
  const db = await getDb();
  const filas = await db
    .select({ id: schema.usuarios.id, usuario: schema.usuarios.usuario })
    .from(schema.usuarios)
    .where(and(eq(schema.usuarios.odooPartnerId, partnerId), eq(schema.usuarios.activo, true)));
  return filas.filter((u) => u.id !== autorId).map((u) => u.usuario);
}

// Todos los mecánicos activos que pueden tomar tareas (tienen contacto de Odoo), sin quien hizo el cambio.
async function todosLosMecanicos(autorId: number): Promise<string[]> {
  const db = await getDb();
  const filas = await db
    .select({ id: schema.usuarios.id, usuario: schema.usuarios.usuario })
    .from(schema.usuarios)
    .where(and(eq(schema.usuarios.rol, "mecanico"), eq(schema.usuarios.activo, true), isNotNull(schema.usuarios.odooPartnerId)));
  return filas.filter((u) => u.id !== autorId).map((u) => u.usuario).sort();
}

async function aTodos(autorId: number, armar: (usuarios: string[]) => Aviso): Promise<void> {
  const usuarios = await todosLosMecanicos(autorId);
  for (let i = 0; i < usuarios.length; i += TANDA) await enviarAviso(armar(usuarios.slice(i, i + TANDA)));
}

export type EntradaEnProceso = {
  ordenId: number;
  // De qué etapa viene: Nuevo (tarea nueva), Listo para verificar (devuelta) o Bloqueado (desbloqueada).
  de: EstadoOrden;
  mecanicoPartnerId: number | null | undefined;
  // Usuario de Taller que hizo el cambio: a él no se le avisa.
  autorId: number;
};

/**
 * Una orden pasó a En proceso: recién ahí es una tarea en el teléfono. ordenId es el mismo id que devuelve
 * /api/movil/taller/tareas.
 *  - desde Nuevo: con mecánico, «Tenés una tarea nueva» a él; sin mecánico, «Hay una tarea nueva disponible» a todos.
 *  - desde Listo para verificar: «Te devolvieron una tarea» al mecánico.
 *  - desde Bloqueado: «Se desbloqueó una tarea» al mecánico, o a todos si no tiene.
 * No lanza nunca.
 */
export async function avisarEntradaEnProceso(e: EntradaEnProceso, momento = Math.floor(Date.now() / 1000)): Promise<void> {
  try {
    if (!destinoAvisos(env())) return;
    const { ordenId, de, autorId } = e;
    const suyos = e.mecanicoPartnerId ? await usuariosDelMecanico(e.mecanicoPartnerId, autorId) : null;
    if (de === "new") {
      if (suyos) await Promise.all(suyos.map((u) => enviarAviso(avisoTareaAsignada(ordenId, u))));
      else await aTodos(autorId, (us) => avisoTareaDisponible(ordenId, us));
    } else if (de === "cancelled") {
      if (suyos) await Promise.all(suyos.map((u) => enviarAviso(avisoTareaDevuelta(ordenId, u, momento))));
    } else if (de === "to_be_paid") {
      if (suyos) await Promise.all(suyos.map((u) => enviarAviso(avisoTareaDesbloqueada(ordenId, u, momento))));
      else await aTodos(autorId, (us) => avisoTareaDesbloqueadaParaTodos(ordenId, us, momento));
    }
  } catch (err) {
    console.warn(`[avisos] no se pudo avisar la tarea ${e.ordenId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Se cambió el mecánico de una orden En proceso: «Tenés una tarea nueva» al nuevo. No lanza nunca. */
export async function avisarTareaAsignada(ordenId: number, mecanicoPartnerId: number | null | undefined, autorId: number): Promise<void> {
  try {
    if (!mecanicoPartnerId || !destinoAvisos(env())) return;
    const usuarios = await usuariosDelMecanico(mecanicoPartnerId, autorId);
    await Promise.all(usuarios.map((u) => enviarAviso(avisoTareaAsignada(ordenId, u))));
  } catch (e) {
    console.warn(`[avisos] no se pudo avisar la tarea ${ordenId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Corre el aviso después de mandar la respuesta: quien mueve la orden no espera a Acceso.
 * Fuera de un pedido de Next (pruebas) no hay "después": se espera acá.
 */
export async function despuesDeResponder(tarea: () => Promise<void>): Promise<void> {
  try {
    after(tarea);
  } catch {
    await tarea();
  }
}
