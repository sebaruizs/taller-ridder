import "server-only";
import { odoo } from "./odoo";
import { registrar, type Usuario } from "./auth";
import { ProductoInvalido, crearProducto, type DatosProducto } from "./crear-producto";
import { cambiarPrecioVenta } from "./cambiar-precio";
import { cambiarNombreProducto } from "./cambiar-nombre";
import { objetoProducto } from "./registro-cambios";

// Un alta a la vez por nombre: evita dos productos si se toca dos veces "Crear".
const enCurso = new Set<string>();

export async function crearProductoComo(d: DatosProducto, u: Usuario) {
  const clave = d.nombre.trim().toLowerCase();
  if (enCurso.has(clave)) throw new ProductoInvalido("Ya se está creando este producto");
  enCurso.add(clave);
  try {
    const r = await crearProducto(d, { odoo, autor: u.nombre, autorPartnerId: u.odooPartnerId });
    await registrar(u.id, "producto.crear", {
      detalle: { productoId: r.productoId, ...d, avisos: r.avisos },
      objeto: objetoProducto(r.productoId),
      usuarioNombre: u.nombre,
      despues: { Nombre: d.nombre.trim(), ...(d.codigo ? { Código: d.codigo } : {}), Costo: d.costo, "Precio de venta": d.precio },
    });
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
      await registrar(u.id, "producto.precio", {
        detalle: { productoId, anterior: r.anterior, nuevo: r.nuevo, aviso: r.aviso },
        objeto: objetoProducto(productoId),
        usuarioNombre: u.nombre,
        antes: { "Precio de venta": r.anterior },
        despues: { "Precio de venta": r.nuevo },
      });
    }
    return r;
  } finally {
    precioEnCurso.delete(productoId);
  }
}

const nombreEnCurso = new Set<number>();

export async function cambiarNombreComo(productoId: number, nombre: string, u: Usuario) {
  if (nombreEnCurso.has(productoId)) throw new ProductoInvalido("Ya se está guardando un nombre para este producto");
  nombreEnCurso.add(productoId);
  try {
    const r = await cambiarNombreProducto(odoo, productoId, nombre, { nombre: u.nombre, partnerId: u.odooPartnerId });
    if (!r.cambio) return r;
    // El nombre ya cambió en Odoo: si el registro propio falla se avisa, no se le dice al usuario que no se guardó.
    try {
      // Un renglón por cada variante: el nombre cambió en todas y cada una tiene su ficha.
      for (const id of r.productoIds) {
        await registrar(u.id, "producto.nombre", {
          detalle: { productoId: id, anterior: r.anterior, nuevo: r.nuevo, aviso: r.aviso, ...(id === productoId ? {} : { desdeProducto: productoId }) },
          objeto: objetoProducto(id),
          usuarioNombre: u.nombre,
          antes: { Nombre: r.anterior },
          despues: { Nombre: r.nuevo },
        });
      }
    } catch (e) {
      console.error("No se pudo anotar el cambio de nombre", productoId, e);
      return { ...r, aviso: [r.aviso, "El nombre se cambió en Odoo, pero no se pudo anotar en el registro de cambios."].filter(Boolean).join(" ") };
    }
    return r;
  } finally {
    nombreEnCurso.delete(productoId);
  }
}
