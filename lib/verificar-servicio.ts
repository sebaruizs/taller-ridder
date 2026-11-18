import "server-only";
import { odoo } from "./odoo";
import { env } from "./env";
import { enviarTelegram } from "./telegram";
import { registrar, type Usuario } from "./auth";
import { MODELO_ORDEN, conAutor, formatoGs, payloadNotaRepuesto, totalRepuestos } from "./taller";
import { actualizarFactura } from "./factura-orden";
import { NoVerificable, agregarRepuesto, aprobarOrden, editarRepuesto, quitarRepuesto } from "./verificar";

export type ProductoOdoo = { id: number; nombre: string; costo: number; unidad: string | null };

export async function buscarProductos(q: string): Promise<ProductoOdoo[]> {
  const filas = await odoo.searchRead<{ id: number; display_name: string; standard_price: number; uom_id: [number, string] | false }>(
    "product.product",
    ["|", ["name", "ilike", q], ["default_code", "ilike", q], ["active", "=", true]],
    ["id", "display_name", "standard_price", "uom_id"],
    { limit: 15, order: "name asc", context: { lang: "es_419" } },
  );
  return filas.map((p) => ({ id: p.id, nombre: p.display_name, costo: p.standard_price || 0, unidad: p.uom_id ? p.uom_id[1] : null }));
}

// La nota no es crítica: si falla, el repuesto queda cargado igual.
async function notaRepuesto(ordenId: number, u: Usuario, cambio: Parameters<typeof payloadNotaRepuesto>[1]) {
  try {
    await odoo.messagePost(MODELO_ORDEN, ordenId, conAutor(payloadNotaRepuesto(u.nombre, cambio), u.odooPartnerId));
  } catch (e) {
    console.error("No se pudo publicar la nota del repuesto", e);
  }
}

// Si la orden ya está finalizada y tiene su factura en borrador, cada cambio de repuesto se lleva también a la factura
// (lib/factura-orden.ts). El aviso vuelve a la pantalla cuando la factura no se pudo o no se debía tocar.

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
    await notaRepuesto(ordenId, u, { tipo: "agregar", producto: r.producto, cantidad: datos.cantidad, costoUnitario: datos.costoUnitario });
    const f = await actualizarFactura(odoo, ordenId, { tipo: "agregar", productoId: datos.productoId, producto: r.producto, cantidad: datos.cantidad, costoUnitario: datos.costoUnitario }, u);
    await registrar(u.id, "orden.repuesto_agregar", { ordenId, detalle: { ...datos, producto: r.producto, factura: f.hecho ?? f.aviso } });
    return { lineas: r.lineas, aviso: f.aviso };
  });
}

export function quitarRepuestoComo(ordenId: number, lineaId: number, u: Usuario) {
  return conCandado(ordenId, async () => {
    const r = await quitarRepuesto(odoo, ordenId, lineaId);
    await notaRepuesto(ordenId, u, { tipo: "quitar", producto: r.quitada.producto, cantidad: r.quitada.cantidad, costoUnitario: r.quitada.costoUnitario });
    const f = await actualizarFactura(odoo, ordenId, { tipo: "quitar", productoId: r.quitada.productoId, producto: r.quitada.producto, cantidad: r.quitada.cantidad, costoUnitario: r.quitada.costoUnitario }, u);
    await registrar(u.id, "orden.repuesto_quitar", { ordenId, detalle: { ...r.quitada, factura: f.hecho ?? f.aviso } });
    return { lineas: r.lineas, aviso: f.aviso };
  });
}

export function editarRepuestoComo(ordenId: number, lineaId: number, datos: { cantidad: number; costoUnitario: number }, u: Usuario) {
  return conCandado(ordenId, async () => {
    const r = await editarRepuesto(odoo, ordenId, lineaId, datos);
    await notaRepuesto(ordenId, u, { tipo: "editar", producto: r.antes.producto, antes: { cantidad: r.antes.cantidad, costoUnitario: r.antes.costoUnitario }, despues: datos });
    const f = await actualizarFactura(odoo, ordenId, { tipo: "editar", productoId: r.antes.productoId, producto: r.antes.producto, antes: { cantidad: r.antes.cantidad, costoUnitario: r.antes.costoUnitario }, despues: datos }, u);
    await registrar(u.id, "orden.repuesto_editar", {
      ordenId,
      detalle: { lineaId, producto: r.antes.producto, antes: { cantidad: r.antes.cantidad, costoUnitario: r.antes.costoUnitario }, despues: datos, factura: f.hecho ?? f.aviso },
    });
    return { lineas: r.lineas, aviso: f.aviso };
  });
}

export function aprobarComo(ordenId: number, confirmaSinRepuestos: boolean, u: Usuario) {
  return conCandado(ordenId, async () => {
    const cfg = env();
    const r = await aprobarOrden(
      { odoo, telegram: enviarTelegram, autor: u.nombre, autorPartnerId: u.odooPartnerId, config: { chatTaller: cfg.TELEGRAM_CHAT_TALLER, chatErrores: cfg.TELEGRAM_CHAT_ERRORES } },
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
