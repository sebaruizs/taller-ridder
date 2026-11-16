import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { odoo } from "./odoo";
import { CAMPOS_VEHICULO, MODELO_VEHICULO, chapaDe, hoyAsuncion, normalizarChapa, type VehiculoOdoo } from "./taller";
import { registrar, type Usuario } from "./auth";
import type { FotoSubida } from "./fotos-form";
import { MAX_FOTOS_DEVOLUCION, MIN_FOTOS, modeloDe, type Devolucion, type TipoDevolucion } from "./devoluciones-dominio";

// Devoluciones y recuperos: se guardan en la base del taller con sus fotos. De Odoo solo se lee la moto.
export class DevolucionInvalida extends Error {}
export class DevolucionNoEncontrada extends Error {}

const POR_PAGINA = 30;

type Fila = typeof schema.devoluciones.$inferSelect;

async function conFotos(filas: Fila[]): Promise<Devolucion[]> {
  if (!filas.length) return [];
  const db = await getDb();
  const fotos = await db
    .select({ id: schema.devolucionFotos.id, devolucionId: schema.devolucionFotos.devolucionId })
    .from(schema.devolucionFotos)
    .where(inArray(schema.devolucionFotos.devolucionId, filas.map((f) => f.id)))
    .orderBy(schema.devolucionFotos.devolucionId, schema.devolucionFotos.orden);
  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    vehiculoId: f.vehiculoId,
    chapa: f.chapa,
    vehiculo: f.vehiculo,
    chofer: f.chofer,
    observacion: f.observacion,
    fecha: f.fecha,
    por: f.usuarioNombre,
    creado: f.creado.toISOString(),
    fotos: fotos.filter((x) => x.devolucionId === f.id).map((x) => x.id),
  }));
}

export async function listarDevoluciones(f: { q?: string; tipo?: TipoDevolucion; pagina?: number } = {}) {
  const db = await getDb();
  const pagina = f.pagina ?? 1;
  const filtro = and(
    f.tipo ? eq(schema.devoluciones.tipo, f.tipo) : undefined,
    f.q ? sql`${schema.devoluciones.chapa} ilike ${`%${normalizarChapa(f.q)}%`}` : undefined,
  );
  const [filas, [{ total }]] = await Promise.all([
    db.select().from(schema.devoluciones).where(filtro).orderBy(desc(schema.devoluciones.fecha), desc(schema.devoluciones.id)).limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA),
    db.select({ total: sql<number>`count(*)::int` }).from(schema.devoluciones).where(filtro),
  ]);
  return { devoluciones: await conFotos(filas), total, porPagina: POR_PAGINA };
}

// Las de una moto, por su id de Odoo o por la chapa: lo que pide Cobranzas para el perfil del vehículo.
export async function devolucionesDeVehiculo(v: { vehiculoId?: number; chapa?: string }): Promise<Devolucion[]> {
  const chapa = v.chapa ? normalizarChapa(v.chapa) : "";
  if (!v.vehiculoId && !chapa) return [];
  const db = await getDb();
  const filas = await db
    .select()
    .from(schema.devoluciones)
    .where(or(v.vehiculoId ? eq(schema.devoluciones.vehiculoId, v.vehiculoId) : undefined, chapa ? eq(schema.devoluciones.chapa, chapa) : undefined))
    .orderBy(desc(schema.devoluciones.fecha), desc(schema.devoluciones.id))
    .limit(50);
  return conFotos(filas);
}

export async function registrarDevolucion(e: { tipo: TipoDevolucion; vehiculoId: number; observacion: string; fotos: FotoSubida[] }, autor: Usuario): Promise<Devolucion> {
  if (e.fotos.length < MIN_FOTOS) throw new DevolucionInvalida("Sacá al menos una foto de la moto");
  if (e.fotos.length > MAX_FOTOS_DEVOLUCION) throw new DevolucionInvalida(`Máximo ${MAX_FOTOS_DEVOLUCION} fotos`);
  const [v] = await odoo.searchRead<VehiculoOdoo>(MODELO_VEHICULO, [["id", "=", e.vehiculoId], ["active", "in", [true, false]]], [...CAMPOS_VEHICULO], { limit: 1 });
  if (!v) throw new DevolucionInvalida("La moto no existe en Odoo");
  const chapa = normalizarChapa(chapaDe(v));

  const db = await getDb();
  const fila = await db.transaction(async (tx) => {
    const [d] = await tx
      .insert(schema.devoluciones)
      .values({
        tipo: e.tipo,
        vehiculoId: v.id,
        chapa,
        vehiculo: modeloDe(v.display_name, chapaDe(v)),
        chofer: v.driver_id ? v.driver_id[1] : null,
        observacion: e.observacion,
        fecha: hoyAsuncion(),
        usuarioId: autor.id || null,
        usuarioNombre: autor.nombre,
      })
      .returning();
    await tx.insert(schema.devolucionFotos).values(e.fotos.map((f, i) => ({ devolucionId: d.id, orden: i, mimetype: f.mimetype, datos: f.datos })));
    return d;
  });
  await registrar(autor.id, "devolucion.registrar", { vehiculoId: v.id, detalle: { devolucionId: fila.id, tipo: e.tipo, chapa, chofer: fila.chofer, fotos: e.fotos.length } });
  const [d] = await conFotos([fila]);
  return d;
}

export async function fotoDeDevolucion(id: number): Promise<{ datos: Buffer; mimetype: string } | null> {
  const db = await getDb();
  const [f] = await db.select({ datos: schema.devolucionFotos.datos, mimetype: schema.devolucionFotos.mimetype }).from(schema.devolucionFotos).where(eq(schema.devolucionFotos.id, id));
  return f ?? null;
}

export async function borrarDevolucion(id: number, autor: Usuario): Promise<{ chapa: string }> {
  const db = await getDb();
  const [d] = await db.delete(schema.devoluciones).where(eq(schema.devoluciones.id, id)).returning();
  if (!d) throw new DevolucionNoEncontrada("No existe esa devolución");
  await registrar(autor.id, "devolucion.borrar", { vehiculoId: d.vehiculoId, detalle: { devolucionId: id, tipo: d.tipo, chapa: d.chapa, fecha: d.fecha, observacion: d.observacion } });
  return { chapa: d.chapa };
}
