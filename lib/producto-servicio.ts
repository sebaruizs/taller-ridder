import "server-only";
import { odoo } from "./odoo";
import { registrar, type Usuario } from "./auth";
import { ProductoInvalido, crearProducto, type DatosProducto } from "./crear-producto";
import { cambiarPrecioVenta } from "./cambiar-precio";

// Un alta a la vez por nombre: evita dos productos si se toca dos veces "Crear".
const enCurso = new Set<string>();

export async function crearProductoComo(d: DatosProducto, u: Usuario) {
  const clave = d.nombre.trim().toLowerCase();
  if (enCurso.has(clave)) throw new ProductoInvalido("Ya se está creando este producto");
  enCurso.add(clave);
  try {
    const r = await crearProducto(d, { odoo, autor: u.nombre, autorPartnerId: u.odooPartnerId });
    await registrar(u.id, "producto.crear", { detalle: { productoId: r.productoId, ...d, avisos: r.avisos } });
    return r;
  } finally {
    enCurso.delete(clave);
  }
}

const precioEnCurso = new Set<number>();

export async function cambiarPrecioComo(productoId: number, precio: number, u: Usuario) {
  if (precioEnCurso.has(productoId)) throw new ProductoInvalido("Ya se está guardando un precio para este producto");
  precioEnCurso.add(productoId);
  try {
    const r = await cambiarPrecioVenta(odoo, productoId, precio, { nombre: u.nombre, partnerId: u.odooPartnerId });
    if (r.cambio) {
      await registrar(u.id, "producto.precio", { detalle: { productoId, anterior: r.anterior, nuevo: r.nuevo, aviso: r.aviso } });
    }
    return r;
  } finally {
    precioEnCurso.delete(productoId);
  }
}
