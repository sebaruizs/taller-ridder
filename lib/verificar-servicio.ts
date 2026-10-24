import "server-only";
import { odoo } from "./odoo";
import { env } from "./env";
import { enviarTelegram } from "./telegram";
import { registrar, type Usuario } from "./auth";
import { formatoGs, totalRepuestos } from "./taller";
import { NoVerificable, agregarRepuesto, aprobarOrden, quitarRepuesto } from "./verificar";

export type ProductoOdoo = { id: number; nombre: string; costo: number; unidad: string | null };

export async function buscarProductos(q: string): Promise<ProductoOdoo[]> {
  const filas = await odoo.searchRead<{ id: number; display_name: string; standard_price: number; uom_id: [number, string] | false }>(
    "product.product",
    ["|", ["name", "ilike", q], ["default_code", "ilike", q], ["active", "=", true]],
    ["id", "display_name", "standard_price", "uom_id"],
    { limit: 15, order: "name asc" },
  );
  return filas.map((p) => ({ id: p.id, nombre: p.display_name, costo: p.standard_price || 0, unidad: p.uom_id ? p.uom_id[1] : null }));
}

// Una operación a la vez por orden: evita repuestos duplicados por doble toque.
const enCurso = new Set<number>();

async function conCandado<T>(ordenId: number, fn: () => Promise<T>): Promise<T> {
  if (enCurso.has(ordenId)) throw new NoVerificable("Hay otra operación en curso sobre esta orden. Esperá un momento.");
  enCurso.add(ordenId);
  try {
    return await fn();
  } finally {
    enCurso.delete(ordenId);
  }
}

export function agregarRepuestoComo(ordenId: number, datos: { productoId: number; cantidad: number; costoUnitario: number }, u: Usuario) {
  return conCandado(ordenId, async () => {
    const r = await agregarRepuesto(odoo, ordenId, datos);
    await registrar(u.id, "orden.repuesto_agregar", { ordenId, detalle: { ...datos, producto: r.producto } });
    return r.lineas;
  });
}

export function quitarRepuestoComo(ordenId: number, lineaId: number, u: Usuario) {
  return conCandado(ordenId, async () => {
    const r = await quitarRepuesto(odoo, ordenId, lineaId);
    await registrar(u.id, "orden.repuesto_quitar", { ordenId, detalle: { ...r.quitada } });
    return r.lineas;
  });
}

export function aprobarComo(ordenId: number, confirmaSinRepuestos: boolean, u: Usuario) {
  return conCandado(ordenId, async () => {
    const cfg = env();
    const r = await aprobarOrden(
      { odoo, telegram: enviarTelegram, autor: u.nombre, config: { chatTaller: cfg.TELEGRAM_CHAT_TALLER, chatErrores: cfg.TELEGRAM_CHAT_ERRORES } },
      ordenId,
      confirmaSinRepuestos,
    );
    await registrar(u.id, "orden.verificar", {
      ordenId,
      detalle: { chapa: r.chapa, repuestos: r.lineas.length, total: formatoGs(totalRepuestos(r.lineas)), avisos: r.avisos },
    });
    return r;
  });
}
