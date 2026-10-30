import { z } from "zod";
import { NoAutorizado, exigir } from "@/lib/auth";
import { puedeU } from "@/lib/permisos";
import { errorJson, json, manejar } from "@/lib/api";
import { odoo } from "@/lib/odoo";
import { buscarProductosCompra } from "@/lib/compras";
import { productoNuevoEnCompra } from "@/lib/crear-compra";
import { esquemaProducto } from "@/lib/crear-producto";
import { crearProductoComo } from "@/lib/producto-servicio";

const query = z.object({ q: z.string().trim().min(2, "Escribí al menos 2 letras").max(60) });

export const GET = manejar(async (req) => {
  await exigir("compras.crear");
  const { q } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json({ productos: await buscarProductosCompra(q) });
});

// «Crear producto nuevo» desde la compra: hace falta poder cargar compras y crear productos.
export const POST = manejar(async (req) => {
  const u = await exigir("compras.crear");
  if (!puedeU(u, "inventario.crear")) throw new NoAutorizado(403);
  const d = esquemaProducto.parse(await req.json());
  const r = await productoNuevoEnCompra(() => crearProductoComo({ ...d, codigo: d.codigo || null }, u), odoo);
  if (!r.creado) return errorJson("Ya existe un producto con ese nombre o código", 409, { existentes: r.existentes, productos: r.productos });
  return json({ producto: r.producto, avisos: r.avisos }, 201);
});
