import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import { odoo, type Many2one } from "./odoo";
import { enviarTelegram } from "./telegram";
import { registrar, type Usuario } from "./auth";
import { CAMPOS_VEHICULO, MODELO_ORDEN, MODELO_VEHICULO, chapaDe, conAutor, hoyAsuncion, type VehiculoOdoo } from "./taller";
import { crearOrden, ordenesEnProcesoDe } from "./crear-orden";
import { iniciarOrden } from "./tablero";
import { crearYEjecutar } from "./finalizar-servicio";
import { destinoValido, mensajeTelegramSolicitud, payloadNotaSolicitudAprobada } from "./solicitudes-dominio";
import type { FotoSubida } from "./fotos-form";

export class ErrorSolicitud extends Error {}

export type DatosSolicitud = { clave: string; vehiculoId: number; tipoId: number; odometro: number; observacion: string };

// El mecánico solicita: se guarda acá (con fotos) y se avisa al grupo del taller. Odoo no se toca todavía.
export async function crearSolicitud(d: DatosSolicitud, fotos: FotoSubida[], u: Usuario) {
  const db = await getDb();
  const [previa] = await db.select({ id: schema.solicitudes.id }).from(schema.solicitudes).where(eq(schema.solicitudes.clave, d.clave));
  if (previa) return { id: previa.id };

  const [[vehiculo], [tipo]] = await Promise.all([
    odoo.searchRead<VehiculoOdoo>(MODELO_VEHICULO, [["id", "=", d.vehiculoId], ["active", "in", [true, false]]], [...CAMPOS_VEHICULO], { limit: 1 }),
    odoo.searchRead<{ id: number; name: string }>("fleet.service.type", [["id", "=", d.tipoId]], ["id", "name"], { limit: 1 }),
  ]);
  if (!vehiculo) throw new ErrorSolicitud("La moto no existe en Odoo");
  if (!tipo) throw new ErrorSolicitud("El tipo de trabajo no existe en Odoo");
  const chapa = chapaDe(vehiculo);

  const id = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(schema.solicitudes)
      .values({ ...d, usuarioId: u.id, chapa, vehiculo: vehiculo.display_name, tipo: tipo.name })
      .onConflictDoNothing()
      .returning({ id: schema.solicitudes.id });
    if (s && fotos.length) await tx.insert(schema.solicitudFotos).values(fotos.map((f, i) => ({ ...f, solicitudId: s.id, orden: i })));
    return s?.id;
  });
  if (!id) {
    const [s] = await db.select({ id: schema.solicitudes.id }).from(schema.solicitudes).where(eq(schema.solicitudes.clave, d.clave));
    return { id: s.id };
  }

  await registrar(u.id, "solicitud.crear", { vehiculoId: d.vehiculoId, detalle: { solicitudId: id, chapa, tipo: tipo.name, odometro: d.odometro, fotos: fotos.length } });
  let avisoTelegram = true;
  await enviarTelegram(
    env().TELEGRAM_CHAT_TALLER,
    mensajeTelegramSolicitud({ mecanico: u.nombre, chapa, tipo: tipo.name, odometro: d.odometro, observacion: d.observacion, fotos: fotos.length }),
  ).catch((e) => {
    avisoTelegram = false;
    console.error("[telegram solicitud]", e);
  });
  return { id, avisoTelegram };
}

const columnas = {
  id: schema.solicitudes.id,
  usuarioId: schema.solicitudes.usuarioId,
  mecanico: schema.usuarios.nombre,
  vehiculoId: schema.solicitudes.vehiculoId,
  chapa: schema.solicitudes.chapa,
  vehiculo: schema.solicitudes.vehiculo,
  tipo: schema.solicitudes.tipo,
  odometro: schema.solicitudes.odometro,
  observacion: schema.solicitudes.observacion,
  estado: schema.solicitudes.estado,
  ordenId: schema.solicitudes.ordenId,
  reportada: schema.solicitudes.reportada,
  error: schema.solicitudes.error,
  motivo: schema.solicitudes.motivo,
  resueltoNombre: schema.solicitudes.resueltoNombre,
  resuelto: schema.solicitudes.resuelto,
  creado: schema.solicitudes.creado,
};

// mias: solo las del usuario (mecánico). Si no, las pendientes primero y las últimas resueltas.
export async function listarSolicitudes(f: { usuarioId?: number }) {
  const db = await getDb();
  const filas = await db
    .select(columnas)
    .from(schema.solicitudes)
    .innerJoin(schema.usuarios, eq(schema.solicitudes.usuarioId, schema.usuarios.id))
    .where(f.usuarioId ? eq(schema.solicitudes.usuarioId, f.usuarioId) : undefined)
    .orderBy(desc(schema.solicitudes.creado))
    .limit(100);
  const ids = filas.map((s) => s.id);
  const fotos = ids.length
    ? await db
        .select({ id: schema.solicitudFotos.id, solicitudId: schema.solicitudFotos.solicitudId })
        .from(schema.solicitudFotos)
        .where(inArray(schema.solicitudFotos.solicitudId, ids))
        .orderBy(asc(schema.solicitudFotos.orden))
    : [];
  return filas.map((s) => ({ ...s, fotos: fotos.filter((x) => x.solicitudId === s.id).map((x) => x.id) }));
}

export type Solicitud = Awaited<ReturnType<typeof listarSolicitudes>>[number];

// Órdenes abiertas de cada moto, para que el jefe elija sobre cuál reportar.
export async function ordenesAbiertasDe(vehiculoIds: number[]) {
  const filas = await ordenesEnProcesoDe(odoo, [...new Set(vehiculoIds)]);
  return filas.map((o) => ({
    id: o.id,
    vehiculoId: o.vehicle_id ? o.vehicle_id[0] : 0,
    tipo: o.service_type_id ? o.service_type_id[1] : null,
    fecha: o.date || null,
    estado: o.state,
  }));
}

export async function fotoSolicitud(fotoId: number) {
  const db = await getDb();
  const [f] = await db
    .select({ datos: schema.solicitudFotos.datos, mimetype: schema.solicitudFotos.mimetype, usuarioId: schema.solicitudes.usuarioId })
    .from(schema.solicitudFotos)
    .innerJoin(schema.solicitudes, eq(schema.solicitudFotos.solicitudId, schema.solicitudes.id))
    .where(eq(schema.solicitudFotos.id, fotoId));
  return f ?? null;
}

async function cargar(id: number) {
  const db = await getDb();
  const [s] = await db.select().from(schema.solicitudes).where(eq(schema.solicitudes.id, id));
  if (!s) throw new ErrorSolicitud("La solicitud no existe");
  return s;
}

export async function rechazarSolicitud(id: number, motivo: string, jefe: Usuario) {
  const s = await cargar(id);
  if (s.estado !== "pendiente") throw new ErrorSolicitud("Esta solicitud ya fue resuelta");
  const db = await getDb();
  await db
    .update(schema.solicitudes)
    .set({ estado: "rechazada", motivo, resueltoPor: jefe.id, resueltoNombre: jefe.nombre, resuelto: new Date() })
    .where(and(eq(schema.solicitudes.id, id), eq(schema.solicitudes.estado, "pendiente")));
  await db.delete(schema.solicitudFotos).where(eq(schema.solicitudFotos.solicitudId, id));
  await registrar(jefe.id, "solicitud.rechazar", { vehiculoId: s.vehiculoId, detalle: { solicitudId: id, chapa: s.chapa, motivo } });
}

const enCurso = new Set<number>();

// Aprobar: crea la orden (o usa una abierta de la moto), la pasa a En proceso si hace falta y la reporta
// a nombre del mecánico con sus fotos y observación. Si algo falla, reintentar sigue desde donde quedó.
export async function aprobarSolicitud(id: number, destino: number | "nueva", jefe: Usuario) {
  if (enCurso.has(id)) throw new ErrorSolicitud("Ya se está aprobando esta solicitud");
  enCurso.add(id);
  try {
    const db = await getDb();
    const s = await cargar(id);
    if (s.estado === "rechazada") throw new ErrorSolicitud("Esta solicitud fue rechazada");
    if (s.reportada) return { ordenId: s.ordenId! };
    const [mec] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, s.usuarioId));
    const cfg = env();

    let ordenId = s.ordenId;
    if (!ordenId) {
      if (destino === "nueva") {
        const r = await crearOrden(
          { vehiculoId: s.vehiculoId, tipoId: s.tipoId, descripcion: s.observacion, mecanicoPartnerId: mec.odooPartnerId, mecanicoNombre: mec.nombre, fotos: [] },
          {
            odoo,
            telegram: enviarTelegram,
            autor: jefe.nombre,
            autorPartnerId: jefe.odooPartnerId,
            config: { chatTaller: cfg.TELEGRAM_CHAT_TALLER, chatErrores: cfg.TELEGRAM_CHAT_ERRORES, hoy: hoyAsuncion() },
          },
        );
        ordenId = r.ordenId;
      } else {
        const [o] = await odoo.read<{ id: number; vehicle_id: Many2one; state: string }>(MODELO_ORDEN, [destino], ["id", "vehicle_id", "state"]).catch(() => []);
        const error = destinoValido(o ? { vehicleId: o.vehicle_id ? o.vehicle_id[0] : null, state: o.state } : undefined, s.vehiculoId);
        if (error) throw new ErrorSolicitud(error);
        ordenId = destino;
      }
      // Desde acá la solicitud queda atada a esa orden: un reintento no crea otra.
      await db
        .update(schema.solicitudes)
        .set({ estado: "aprobada", ordenId, resueltoPor: jefe.id, resueltoNombre: jefe.nombre, resuelto: new Date() })
        .where(eq(schema.solicitudes.id, id));
      await registrar(jefe.id, "solicitud.aprobar", { ordenId, vehiculoId: s.vehiculoId, detalle: { solicitudId: id, chapa: s.chapa, ordenNueva: destino === "nueva" } });
      await odoo
        .messagePost(MODELO_ORDEN, ordenId, conAutor(payloadNotaSolicitudAprobada({ mecanico: mec.nombre, jefe: jefe.nombre, solicitudId: id, ordenNueva: destino === "nueva" }), jefe.odooPartnerId))
        .catch((e) => console.error("[solicitud] nota", e));
    }

    try {
      const [o] = await odoo.read<{ state: string }>(MODELO_ORDEN, [ordenId], ["state"]);
      if (o?.state === "new") await iniciarOrden(odoo, ordenId, jefe.nombre, jefe.odooPartnerId);
      const fotos = await db
        .select({ nombre: schema.solicitudFotos.nombre, mimetype: schema.solicitudFotos.mimetype, datos: schema.solicitudFotos.datos })
        .from(schema.solicitudFotos)
        .where(eq(schema.solicitudFotos.solicitudId, id))
        .orderBy(asc(schema.solicitudFotos.orden));
      const mecanico: Usuario = {
        id: mec.id,
        usuario: mec.usuario,
        nombre: mec.nombre,
        rol: mec.rol,
        odooPartnerId: mec.odooPartnerId,
        permisosOff: mec.permisosOff ?? [],
        tema: mec.tema,
      };
      const resumen = await crearYEjecutar(
        { clave: s.clave, ordenId, odometro: s.odometro, observacion: s.observacion, fotos: fotos.map((f) => ({ ...f, datos: Buffer.from(f.datos) })) },
        mecanico,
      );
      await db.update(schema.solicitudes).set({ reportada: true, error: null }).where(eq(schema.solicitudes.id, id));
      await db.delete(schema.solicitudFotos).where(eq(schema.solicitudFotos.solicitudId, id));
      return { ordenId, resumen };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.update(schema.solicitudes).set({ error: msg }).where(eq(schema.solicitudes.id, id));
      throw e;
    }
  } finally {
    enCurso.delete(id);
  }
}
