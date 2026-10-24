import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import { odoo } from "./odoo";
import { enviarTelegram } from "./telegram";
import { hoyAsuncion } from "./taller";
import { ejecutarFinalizacion, type Resumen } from "./finalizar";
import { registrar, type Usuario } from "./auth";

export type EntradaFinalizar = {
  clave: string;
  ordenId: number;
  odometro: number;
  observacion: string;
  listaEntrega: boolean;
  fotos: { nombre: string; mimetype: string; datos: Buffer }[];
};

const enCurso = new Map<string, Promise<Resumen>>();

export async function buscarFinalizacion(clave: string) {
  const db = await getDb();
  const [fila] = await db.select().from(schema.finalizaciones).where(eq(schema.finalizaciones.clave, clave));
  return fila ?? null;
}

export async function crearYEjecutar(entrada: EntradaFinalizar, usuario: Usuario): Promise<Resumen> {
  const db = await getDb();
  const existente = await buscarFinalizacion(entrada.clave);
  if (!existente) {
    await db.transaction(async (tx) => {
      const [fin] = await tx
        .insert(schema.finalizaciones)
        .values({
          clave: entrada.clave,
          ordenId: entrada.ordenId,
          usuarioId: usuario.id,
          odometro: entrada.odometro,
          observacion: entrada.observacion,
          listaEntrega: entrada.listaEntrega,
        })
        .onConflictDoNothing()
        .returning({ id: schema.finalizaciones.id });
      if (fin && entrada.fotos.length) {
        await tx.insert(schema.finalizacionFotos).values(entrada.fotos.map((f, i) => ({ ...f, finalizacionId: fin.id, orden: i })));
      }
    });
  } else if (existente.ordenId !== entrada.ordenId) {
    throw new Error("La clave de envío no corresponde a esta orden");
  }
  return ejecutar(entrada.clave, usuario);
}

export function ejecutar(clave: string, usuario: Usuario): Promise<Resumen> {
  const actual = enCurso.get(clave);
  if (actual) return actual;
  const p = correr(clave, usuario).finally(() => enCurso.delete(clave));
  enCurso.set(clave, p);
  return p;
}

async function correr(clave: string, usuario: Usuario): Promise<Resumen> {
  const db = await getDb();
  const fin = await buscarFinalizacion(clave);
  if (!fin) throw new Error("Finalización no encontrada");
  if (fin.terminado && fin.resumen) return fin.resumen as unknown as Resumen;

  const [autor] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, fin.usuarioId));
  const e = env();
  await db
    .update(schema.finalizaciones)
    .set({ intentos: fin.intentos + 1 })
    .where(eq(schema.finalizaciones.id, fin.id));

  const resumen = await ejecutarFinalizacion(
    { ...fin, attachmentIds: fin.attachmentIds ?? [] },
    {
      odoo,
      telegram: enviarTelegram,
      mecanico: { nombre: autor.nombre, partnerId: autor.odooPartnerId },
      config: {
        estadoParaEntregar: e.ODOO_VEHICLE_STATE_PARA_ENTREGAR,
        chatTaller: e.TELEGRAM_CHAT_TALLER,
        chatErrores: e.TELEGRAM_CHAT_ERRORES,
        hoy: hoyAsuncion(),
      },
      store: {
        async guardar(patch) {
          await db
            .update(schema.finalizaciones)
            .set(patch as Partial<typeof schema.finalizaciones.$inferInsert>)
            .where(eq(schema.finalizaciones.id, fin.id));
        },
        fotos() {
          return db
            .select()
            .from(schema.finalizacionFotos)
            .where(eq(schema.finalizacionFotos.finalizacionId, fin.id))
            .orderBy(asc(schema.finalizacionFotos.orden));
        },
        async marcarFoto(fotoId, attachmentId) {
          await db
            .update(schema.finalizacionFotos)
            .set({ attachmentId })
            .where(and(eq(schema.finalizacionFotos.id, fotoId), eq(schema.finalizacionFotos.finalizacionId, fin.id)));
        },
        async borrarFotos() {
          await db.delete(schema.finalizacionFotos).where(eq(schema.finalizacionFotos.finalizacionId, fin.id));
        },
      },
    },
  );
  await registrar(usuario.id, "orden.finalizar", {
    ordenId: fin.ordenId,
    detalle: { chapa: resumen.chapa, estado: resumen.estado, odometro: resumen.odometro, fotos: resumen.fotos, intento: fin.intentos + 1 },
  });
  return resumen;
}
