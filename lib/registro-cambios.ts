import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";

// Título de cada acción en el registro de cambios.
export const TITULOS_REGISTRO: Record<string, string> = {
  "producto.crear": "Producto creado",
  "producto.precio": "Precio de venta cambiado",
  "producto.nombre": "Nombre cambiado",
};

export const objetoProducto = (productoId: number) => `producto:${productoId}`;

export type CambioRegistro = {
  id: number;
  titulo: string;
  autor: string;
  fecha: Date;
  origen: string | null;
  aviso: string | null;
  campos: { campo: string; antes: unknown; despues: unknown }[];
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

// Lo que se cambió sobre un objeto desde esta app, de lo más nuevo a lo más viejo. Solo se agregan filas: nada lo modifica.
export async function cambiosDe(objeto: string, limite = 200): Promise<CambioRegistro[]> {
  const db = await getDb();
  const filas = await db
    .select({
      id: schema.logAcciones.id,
      accion: schema.logAcciones.accion,
      detalle: schema.logAcciones.detalle,
      antes: schema.logAcciones.antes,
      despues: schema.logAcciones.despues,
      fecha: schema.logAcciones.fecha,
      copiado: schema.logAcciones.usuarioNombre,
      actual: schema.usuarios.nombre,
    })
    .from(schema.logAcciones)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.logAcciones.usuarioId))
    .where(eq(schema.logAcciones.objeto, objeto))
    .orderBy(desc(schema.logAcciones.id))
    .limit(limite);
  return filas.map((f) => {
    const antes = f.antes ?? {};
    const despues = f.despues ?? {};
    const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
    const por = texto(f.detalle?.por);
    return {
      id: f.id,
      titulo: TITULOS_REGISTRO[f.accion] ?? f.accion,
      autor: f.copiado ?? f.actual ?? por ?? "Sistema",
      fecha: f.fecha,
      origen: f.detalle?.origen === "cobranzas" ? `desde Cobranzas${por ? `, por ${por}` : ""}` : null,
      aviso: texto(f.detalle?.aviso),
      campos: claves.map((campo) => ({ campo, antes: antes[campo] ?? null, despues: despues[campo] ?? null })),
    };
  });
}
