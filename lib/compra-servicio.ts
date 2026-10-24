import "server-only";
import { odoo } from "./odoo";
import { registrar, type Usuario } from "./auth";
import { CompraInvalida, crearCompra, recibirCompra } from "./crear-compra";
import type { DatosCompra } from "./compras-dominio";

const enCurso = new Set<string>();

async function conCandado<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  if (enCurso.has(clave)) throw new CompraInvalida("Ya se está guardando esta compra. Esperá un momento.");
  enCurso.add(clave);
  try {
    return await fn();
  } finally {
    enCurso.delete(clave);
  }
}

// Fecha y hora en UTC con el formato de Odoo.
const ahoraOdoo = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export function crearCompraComo(d: DatosCompra, u: Usuario) {
  return conCandado(`compra:${d.clave}`, async () => {
    const r = await crearCompra(d, odoo, { nombre: u.nombre, partnerId: u.odooPartnerId }, ahoraOdoo());
    await registrar(u.id, "compra.crear", {
      detalle: { compraId: r.compraId, numero: r.numero, proveedorId: d.proveedorId, lineas: d.lineas, recibida: r.recibida, avisos: r.avisos },
    });
    return r;
  });
}

export function recibirCompraComo(compraId: number, u: Usuario) {
  return conCandado(`recibir:${compraId}`, async () => {
    const aviso = await recibirCompra(odoo, compraId, { nombre: u.nombre, partnerId: u.odooPartnerId });
    await registrar(u.id, "compra.recibir", { detalle: { compraId, aviso } });
    return { aviso };
  });
}
