import "server-only";
// API móvil de Taller (Ridder App). Contrato: ridder-app/contratos/SINCRONIZACION.md. Reglas puras en movil-dominio.ts.
import { and, desc, eq, gte, inArray, like, min } from "drizzle-orm";
import { getDb, schema } from "./db";
import { odoo, m2oId, type Many2one } from "./odoo";
import { registrar, type Usuario } from "./auth";
import { puedeU } from "./permisos";
import { crearYEjecutar } from "./finalizar-servicio";
import { FinalizarError } from "./finalizar";
import { valoresDevolucion } from "./devoluciones";
import { MAX_FOTOS_DEVOLUCION, MIN_FOTOS, modeloDe } from "./devoluciones-dominio";
import {
  CAMPOS_VEHICULO,
  MODELO_ASIGNACION,
  MODELO_ORDEN,
  MODELO_VEHICULO,
  chapaDe,
  conAutor,
  formatoKm,
  hoyAsuncion,
  normalizarChapa,
  type EstadoOrden,
  type VehiculoOdoo,
} from "./taller";
import {
  Rechazo,
  TIPOS_TALLER,
  TIPO_DEVOLUCION,
  datosDevolucionSchema,
  datosTallerSchema,
  decodificarFoto,
  esTipoConocido,
  estadoDeTarea,
  exigirContenido,
  fechaCorta,
  motivoRechazoTarea,
  observacionDevolucion,
  payloadNotaAvance,
  payloadNotaInicio,
  tipoDeDevolucion,
  validar,
  type EstadoTarea,
  type MotivoDevolucion,
  type RegistroMovil,
  type TipoTaller,
} from "./movil-dominio";

// ---------- descargas ----------

export type TareaMovil = {
  id: string;
  ordenId: string;
  chapa: string;
  modelo: string;
  titulo: string;
  indicaciones: string;
  estado: EstadoTarea;
  inicio?: string;
  /** Extra (no está en el contrato): false si la orden todavía no tiene mecánico y la puede tomar cualquiera. */
  asignada: boolean;
};

type OrdenTarea = {
  id: number;
  vehicle_id: Many2one;
  service_type_id: Many2one;
  description: string | false;
  state: EstadoOrden;
  vendor_id: Many2one;
  date: string | false;
};
const CAMPOS_TAREA = ["id", "vehicle_id", "service_type_id", "description", "state", "vendor_id", "date"];

async function vehiculosPorId(ids: number[]): Promise<Map<number, VehiculoOdoo>> {
  if (!ids.length) return new Map();
  const filas = await odoo.searchRead<VehiculoOdoo>(MODELO_VEHICULO, [["id", "in", ids], ["active", "in", [true, false]]], [...CAMPOS_VEHICULO], {
    limit: ids.length,
  });
  return new Map(filas.map((v) => [v.id, v]));
}

/** Desde cuándo trabaja esta persona en cada orden: lo primero que mandó desde el teléfono y Taller aceptó. */
async function iniciosDe(usuarioId: number, ordenIds: number[]): Promise<Map<number, Date>> {
  if (!ordenIds.length) return new Map();
  const db = await getDb();
  const filas = await db
    .select({ ordenId: schema.registrosMovil.ordenId, inicio: min(schema.registrosMovil.creado) })
    .from(schema.registrosMovil)
    .where(
      and(
        eq(schema.registrosMovil.usuarioId, usuarioId),
        inArray(schema.registrosMovil.ordenId, ordenIds),
        eq(schema.registrosMovil.estado, "aceptado"),
        like(schema.registrosMovil.tipo, "taller.%"),
      ),
    )
    .groupBy(schema.registrosMovil.ordenId);
  return new Map(filas.filter((f) => f.ordenId && f.inicio).map((f) => [f.ordenId!, new Date(f.inicio!)]));
}

/**
 * Las tareas de la persona: las órdenes En proceso asignadas a su contacto de Odoo o sin mecánico todavía, y las que
 * reportó hoy (Listo para verificar). Sin contacto de Odoo no puede tomar ni cerrar tareas: lista vacía.
 */
export async function tareasDe(u: Usuario): Promise<TareaMovil[]> {
  const p = u.odooPartnerId;
  if (!p) return [];
  const [enProceso, listas] = await Promise.all([
    odoo.searchRead<OrdenTarea>(MODELO_ORDEN, [["state", "=", "running"], "|", ["vendor_id", "=", p], ["vendor_id", "=", false]], CAMPOS_TAREA, {
      limit: 200,
      order: "date asc, id asc",
    }),
    odoo.searchRead<OrdenTarea>(MODELO_ORDEN, [["state", "=", "cancelled"], ["vendor_id", "=", p], ["service_end_date", "=", hoyAsuncion()]], CAMPOS_TAREA, {
      limit: 100,
      order: "id asc",
    }),
  ]);
  const ordenes = [...enProceso, ...listas];
  const [vehiculos, inicios] = await Promise.all([
    vehiculosPorId([...new Set(ordenes.map((o) => m2oId(o.vehicle_id)).filter((x): x is number => !!x))]),
    iniciosDe(u.id, ordenes.map((o) => o.id)),
  ]);
  return ordenes.flatMap((o) => {
    const inicio = inicios.get(o.id);
    const estado = estadoDeTarea(o.state, !!inicio);
    if (!estado) return [];
    const v = vehiculos.get(m2oId(o.vehicle_id) ?? 0);
    const chapa = v ? chapaDe(v) : o.vehicle_id ? chapaDe({ license_plate: false, display_name: o.vehicle_id[1] }) : "—";
    return [
      {
        id: String(o.id),
        ordenId: String(o.id),
        chapa,
        modelo: v ? modeloDe(v.display_name, chapa) : "",
        titulo: o.service_type_id ? o.service_type_id[1] : `Orden #${o.id}`,
        indicaciones: (o.description || "").trim(),
        estado,
        ...(inicio ? { inicio: inicio.toISOString() } : {}),
        asignada: !!o.vendor_id,
      },
    ];
  });
}

export type VehiculoMovil = {
  id: string;
  chapa: string;
  modelo: string;
  cliente: string;
  /** null: Taller no sabe por qué vuelve la moto (ver README, «API móvil»). */
  motivo: MotivoDevolucion | null;
  kmAnterior: number;
};

/** Las motos que hoy tiene un chofer en Odoo: las que pueden volver. Odoo no guarda el motivo (contrato, recupero, cambio). */
export async function vehiculosADevolver(): Promise<VehiculoMovil[]> {
  const vs = await odoo.searchRead<VehiculoOdoo>(MODELO_VEHICULO, [["driver_id", "!=", false]], [...CAMPOS_VEHICULO], {
    limit: 2000,
    order: "license_plate asc, id asc",
  });
  return vs.map((v) => {
    const chapa = chapaDe(v);
    return {
      id: String(v.id),
      chapa,
      modelo: modeloDe(v.display_name, chapa),
      cliente: v.driver_id ? v.driver_id[1] : "",
      motivo: null,
      kmAnterior: Math.round(v.odometer || 0),
    };
  });
}

// ---------- registros ----------

export type Respuesta =
  | { status: 200; body: { resultado: "aceptado" } }
  | { status: 422; body: { resultado: "rechazado"; motivo: string } }
  | { status: 503; body: { error: string } };

const aceptado = (): Respuesta => ({ status: 200, body: { resultado: "aceptado" } });
const rechazado = (motivo: string): Respuesta => ({ status: 422, body: { resultado: "rechazado", motivo } });
const temporal = (error: string): Respuesta => ({ status: 503, body: { error } });

type FilaRegistro = typeof schema.registrosMovil.$inferSelect;
type Progreso = { adjuntos?: Record<string, number>; mecanicoOk?: boolean; notaOk?: boolean; aviso?: string; error?: string };

// Un mismo id llegando dos veces a la vez (el teléfono reintentó antes de recibir la respuesta): se espera al primero.
const enCurso = new Map<string, Promise<Respuesta>>();

export function recibirRegistro(u: Usuario, r: RegistroMovil): Promise<Respuesta> {
  const actual = enCurso.get(r.id);
  if (actual) return actual;
  const p = procesar(u, r).finally(() => enCurso.delete(r.id));
  enCurso.set(r.id, p);
  return p;
}

async function procesar(u: Usuario, r: RegistroMovil): Promise<Respuesta> {
  const db = await getDb();
  const [previo] = await db.select().from(schema.registrosMovil).where(eq(schema.registrosMovil.id, r.id));
  if (previo) {
    if (previo.usuarioId !== u.id) return rechazado("Este registro ya lo envió otra persona");
    if (previo.estado === "aceptado") return aceptado();
    if (previo.estado === "rechazado") return rechazado(previo.motivo ?? "Taller no lo aceptó");
    return aplicar(u, r, previo);
  }

  try {
    if (!esTipoConocido(r.tipo)) throw new Rechazo(`Taller no recibe registros de tipo «${r.tipo}»`);
    if (r.tipo === TIPO_DEVOLUCION) return await recibirDevolucion(u, r);
    const ordenId = await validarTarea(u, r, r.tipo);
    const [fila] = await db
      .insert(schema.registrosMovil)
      .values({ id: r.id, usuarioId: u.id, tipo: r.tipo, creado: new Date(r.creado), estado: "aplicando", ordenId, datos: r.datos })
      .onConflictDoNothing()
      .returning();
    // Otro proceso lo tomó en este instante: el teléfono reintenta y recibe ese resultado.
    if (!fila) return temporal("Se está procesando este registro. Reintentá en unos segundos.");
    return aplicar(u, r, fila);
  } catch (e) {
    if (!(e instanceof Rechazo)) throw e;
    await guardarRechazo(u, r, e.message);
    return rechazado(e.message);
  }
}

async function guardarRechazo(u: Usuario, r: RegistroMovil, motivo: string, extra: { ordenId?: number | null; vehiculoId?: number | null } = {}) {
  const db = await getDb();
  const ordenId = extra.ordenId ?? numeroDe(r.datos.tareaId);
  const vehiculoId = extra.vehiculoId ?? numeroDe((r.datos.vehiculo as { id?: unknown } | undefined)?.id);
  await db
    .insert(schema.registrosMovil)
    .values({ id: r.id, usuarioId: u.id, tipo: r.tipo, creado: new Date(r.creado), estado: "rechazado", motivo, ordenId, vehiculoId, datos: r.datos, terminado: new Date() })
    .onConflictDoNothing();
  await registrar(u.id, `movil.${r.tipo}`, { ordenId: ordenId ?? undefined, vehiculoId: vehiculoId ?? undefined, detalle: { registro: r.id, resultado: "rechazado", motivo } });
}

const numeroDe = (v: unknown): number | null => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

// ---------- tareas del mecánico ----------

type OrdenValidar = { id: number; state: EstadoOrden; vendor_id: Many2one };

/** Reglas de inicio, avance y cierre antes de aplicar nada. Devuelve la orden. */
async function validarTarea(u: Usuario, r: RegistroMovil, tipo: TipoTaller): Promise<number> {
  if (!puedeU(u, "ordenes.finalizar")) throw new Rechazo("No tenés permiso para trabajar órdenes en Taller");
  const datos = validar(datosTallerSchema, r.datos);
  exigirContenido(tipo, datos, r.fotos.length);
  r.fotos.forEach(decodificarFoto);
  const [o] = await odoo.read<OrdenValidar>(MODELO_ORDEN, [datos.tareaId], ["id", "state", "vendor_id"]).catch(() => []);
  if (!o) throw new Rechazo("La orden ya no existe en Taller (se eliminó)");
  const motivo = motivoRechazoTarea({
    tipo,
    estado: o.state,
    mecanicoId: m2oId(o.vendor_id),
    mecanicoNombre: o.vendor_id ? o.vendor_id[1] : null,
    partnerId: u.odooPartnerId,
  });
  if (motivo) throw new Rechazo(motivo);
  return o.id;
}

/** Escribe en Odoo lo que falta de un registro de tarea. Un error de Odoo deja el registro "aplicando" y responde 503. */
async function aplicar(u: Usuario, r: RegistroMovil, fila: FilaRegistro): Promise<Respuesta> {
  const tipo = fila.tipo as TipoTaller;
  if (!(TIPOS_TALLER as readonly string[]).includes(tipo) || !fila.ordenId) return temporal("Registro en un estado inesperado");
  const db = await getDb();
  const ordenId = fila.ordenId;
  const datos = validar(datosTallerSchema, fila.datos);
  const progreso: Progreso = { ...(fila.progreso as Progreso) };
  const guardar = (patch: Partial<typeof schema.registrosMovil.$inferInsert>) =>
    db.update(schema.registrosMovil).set(patch).where(eq(schema.registrosMovil.id, r.id));

  try {
    if (tipo === "taller.inicio") await aplicarInicio(u, ordenId, r, progreso, (p) => guardar({ progreso: p }));
    else if (tipo === "taller.avance") await aplicarAvance(u, ordenId, r, datos.nota, progreso, (p) => guardar({ progreso: p }));
    else {
      try {
        await crearYEjecutar(
          {
            clave: r.id,
            ordenId,
            odometro: datos.odometro ?? 0,
            observacion: datos.nota,
            fotos: r.fotos.map((f, i) => ({ nombre: `orden-${ordenId}-cierre-${i + 1}.jpg`, mimetype: "image/jpeg", datos: decodificarFoto(f) })),
          },
          u,
        );
      } catch (e) {
        // La orden cambió entre la validación y el cierre: lo decide el servidor.
        if (e instanceof FinalizarError && (e.paso === "validacion" || e.paso === "lectura")) throw new Rechazo(e.message);
        throw e;
      }
    }
  } catch (e) {
    if (e instanceof Rechazo) {
      await guardar({ estado: "rechazado", motivo: e.message, terminado: new Date() });
      await registrar(u.id, `movil.${tipo}`, { ordenId, detalle: { registro: r.id, resultado: "rechazado", motivo: e.message } });
      return rechazado(e.message);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[movil] ${tipo} ${r.id} orden ${ordenId}:`, e);
    await guardar({ progreso: { ...progreso, error: msg } });
    return temporal(`Taller no pudo guardarlo todavía (${msg}). Se reintenta solo.`);
  }

  await guardar({ estado: "aceptado", progreso: { ...progreso, error: undefined }, terminado: new Date() });
  await registrar(u.id, `movil.${tipo}`, { ordenId, detalle: { registro: r.id, resultado: "aceptado", fotos: r.fotos.length, creado: r.creado, aviso: progreso.aviso } });
  return aceptado();
}

/** Empezar: si la orden no tenía mecánico, queda a nombre de quien la empezó. La nota de seguimiento no es crítica. */
async function aplicarInicio(u: Usuario, ordenId: number, r: RegistroMovil, progreso: Progreso, guardar: (p: Progreso) => Promise<unknown>) {
  if (!progreso.mecanicoOk) {
    const [o] = await odoo.read<OrdenValidar>(MODELO_ORDEN, [ordenId], ["id", "state", "vendor_id"]);
    if (o && !o.vendor_id && u.odooPartnerId) await odoo.write(MODELO_ORDEN, [ordenId], { vendor_id: u.odooPartnerId });
    progreso.mecanicoOk = true;
    await guardar(progreso);
  }
  if (!progreso.notaOk) {
    try {
      await odoo.messagePost(MODELO_ORDEN, ordenId, conAutor(payloadNotaInicio({ mecanico: u.nombre, creado: r.creado }), u.odooPartnerId));
    } catch (e) {
      progreso.aviso = `No se pudo publicar la nota de inicio: ${e instanceof Error ? e.message : String(e)}`;
    }
    progreso.notaOk = true;
    await guardar(progreso);
  }
}

/** Avance: las fotos como adjuntos de la orden (una vez cada una, por su id del teléfono) y la nota con ellas. */
async function aplicarAvance(u: Usuario, ordenId: number, r: RegistroMovil, nota: string, progreso: Progreso, guardar: (p: Progreso) => Promise<unknown>) {
  const adjuntos = { ...(progreso.adjuntos ?? {}) };
  for (const [i, f] of r.fotos.entries()) {
    if (adjuntos[f.id]) continue;
    adjuntos[f.id] = await odoo.create("ir.attachment", {
      name: `orden-${ordenId}-avance-${i + 1}.jpg`,
      type: "binary",
      datas: decodificarFoto(f).toString("base64"),
      mimetype: "image/jpeg",
      res_model: MODELO_ORDEN,
      res_id: ordenId,
    });
    progreso.adjuntos = adjuntos;
    await guardar(progreso);
  }
  if (!progreso.notaOk) {
    const ids = r.fotos.map((f) => adjuntos[f.id]).filter((x): x is number => !!x);
    await odoo.messagePost(MODELO_ORDEN, ordenId, conAutor(payloadNotaAvance({ mecanico: u.nombre, creado: r.creado, nota, adjuntos: ids }), u.odooPartnerId));
    progreso.notaOk = true;
    await guardar(progreso);
  }
}

// ---------- devolución ----------

type Asignacion = { date_start: string | false };

/**
 * Recepción de una moto que vuelve. Todo se guarda en la base de Taller (Odoo solo se lee), en una transacción junto
 * con el id del registro: o queda todo o no queda nada.
 */
async function recibirDevolucion(u: Usuario, r: RegistroMovil): Promise<Respuesta> {
  if (!puedeU(u, "devoluciones.registrar")) throw new Rechazo("No tenés permiso para registrar devoluciones en Taller");
  const d = validar(datosDevolucionSchema, r.datos);
  if (r.fotos.length < MIN_FOTOS) throw new Rechazo("Falta al menos una foto de la moto");
  if (r.fotos.length > MAX_FOTOS_DEVOLUCION) throw new Rechazo(`Máximo ${MAX_FOTOS_DEVOLUCION} fotos`);
  const fotos = r.fotos.map(decodificarFoto);

  const [v] = await odoo.searchRead<VehiculoOdoo>(MODELO_VEHICULO, [["id", "=", d.vehiculo.id], ["active", "in", [true, false]]], [...CAMPOS_VEHICULO], { limit: 1 });
  if (!v) throw new Rechazo(`La chapa ${d.vehiculo.chapa} no existe en Taller`);
  const chapa = chapaDe(v);
  if (normalizarChapa(chapa) !== normalizarChapa(d.vehiculo.chapa)) throw new Rechazo(`La moto elegida tiene la chapa ${chapa} en Odoo, no ${d.vehiculo.chapa}`);
  const kmAnterior = Math.round(v.odometer || 0);
  if (d.kilometraje < kmAnterior) {
    throw new Rechazo(`El kilometraje (${formatoKm(d.kilometraje)} km) es menor que el último registrado (${formatoKm(kmAnterior)} km)`);
  }

  // Ya devuelta: hay una recepción desde que empezó su última asignación a un chofer (o de hoy, si nunca tuvo).
  const [ultima] = await odoo.searchRead<Asignacion>(MODELO_ASIGNACION, [["vehicle_id", "=", v.id]], ["date_start"], {
    limit: 1,
    order: "date_start desc",
    context: { active_test: false },
  });
  const desde = ultima?.date_start ? ultima.date_start.slice(0, 10) : hoyAsuncion();
  const db = await getDb();
  const [previa] = await db
    .select({ fecha: schema.devoluciones.fecha, por: schema.devoluciones.usuarioNombre })
    .from(schema.devoluciones)
    .where(and(eq(schema.devoluciones.vehiculoId, v.id), gte(schema.devoluciones.fecha, desde)))
    .orderBy(desc(schema.devoluciones.fecha))
    .limit(1);
  if (previa) throw new Rechazo(`La moto ${chapa} ya figura devuelta el ${fechaCorta(previa.fecha)} (la recibió ${previa.por})`);

  const tipo = tipoDeDevolucion(d.motivo);
  const devolucionId = await db.transaction(async (tx) => {
    const [fila] = await tx.insert(schema.devoluciones).values(valoresDevolucion(v, tipo, observacionDevolucion(d), u)).returning({ id: schema.devoluciones.id });
    await tx.insert(schema.devolucionFotos).values(fotos.map((datos, i) => ({ devolucionId: fila.id, orden: i, mimetype: "image/jpeg", datos })));
    await tx.insert(schema.registrosMovil).values({
      id: r.id,
      usuarioId: u.id,
      tipo: r.tipo,
      creado: new Date(r.creado),
      estado: "aceptado",
      vehiculoId: v.id,
      datos: r.datos,
      progreso: { devolucionId: fila.id },
      terminado: new Date(),
    });
    return fila.id;
  });
  await registrar(u.id, "devolucion.registrar", {
    vehiculoId: v.id,
    detalle: { devolucionId, tipo, chapa: normalizarChapa(chapa), fotos: fotos.length, origen: "movil", registro: r.id, kilometraje: d.kilometraje },
  });
  return aceptado();
}
