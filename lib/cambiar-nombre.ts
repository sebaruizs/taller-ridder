// Cambio del nombre de un producto en Odoo, con nota de quién lo cambió.
import { z } from "zod";
import type { Many2one, OdooClient } from "./odoo";
import { NOTA_INTERNA, conAutor, escaparHtml } from "./taller";
import { ProductoDuplicado, ProductoInvalido } from "./crear-producto";

// Mismas reglas que el alta. Los espacios repetidos se juntan para que no queden dos nombres que se ven iguales.
export const esquemaNombre = z
  .string({ error: "Escribí el nombre del producto" })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(3, "Escribí el nombre del producto").max(120, "El nombre es demasiado largo (máximo 120 letras)"));

export function payloadNotaNombre(p: { autor: string; anterior: string; nuevo: string }) {
  return {
    body:
      `<p><b>${escaparHtml(p.autor)} cambió el nombre del producto</b> (app del taller).</p>` +
      `<p>${escaparHtml(p.anterior)} → <b>${escaparHtml(p.nuevo)}</b></p>`,
    ...NOTA_INTERNA,
  };
}

// productoIds: todos los productos que comparten ese nombre (las variantes de la misma plantilla), para anotarlo en cada uno.
export type ResultadoNombre = { anterior: string; nuevo: string; cambio: boolean; aviso: string | null; productoIds: number[] };

export async function cambiarNombreProducto(
  odoo: Pick<OdooClient, "searchRead" | "read" | "write" | "messagePost">,
  productoId: number,
  nombre: string,
  autor: { nombre: string; partnerId: number | null },
): Promise<ResultadoNombre> {
  const nuevo = esquemaNombre.parse(nombre);
  // El "antes" sale de una lectura fresca de Odoo. "name" es el nombre solo; display_name puede traer el código.
  const [p] = await odoo.searchRead<{ id: number; name: string; product_tmpl_id: Many2one }>(
    "product.product",
    [["id", "=", productoId], ["active", "=", true]],
    ["id", "name", "product_tmpl_id"],
    { limit: 1 },
  );
  if (!p || !p.product_tmpl_id) throw new ProductoInvalido("El producto no existe o está archivado en Odoo");
  const tmplId = p.product_tmpl_id[0];
  const anterior = p.name;
  if (anterior === nuevo) return { anterior, nuevo, cambio: false, aviso: null, productoIds: [productoId] };

  // Duplicados: otro producto con el mismo nombre (sin importar mayúsculas), incluidos archivados.
  const existentes = await odoo.searchRead<{ id: number; display_name: string; default_code: string | false }>(
    "product.product",
    [["name", "=ilike", nuevo], ["product_tmpl_id", "!=", tmplId], ["active", "in", [true, false]]],
    ["id", "display_name", "default_code"],
    { limit: 5 },
  );
  if (existentes.length) {
    throw new ProductoDuplicado(existentes.map((e) => ({ id: e.id, nombre: e.display_name, codigo: e.default_code || null })));
  }

  // El nombre es de la plantilla: si tiene variantes, cambia en todas.
  const variantes = await odoo.searchRead<{ id: number }>("product.product", [["product_tmpl_id", "=", tmplId], ["active", "in", [true, false]]], ["id"], { limit: 200 });
  const productoIds = [...new Set([productoId, ...variantes.map((v) => v.id)])];

  await odoo.write("product.template", [tmplId], { name: nuevo });

  // El nombre ya cambió: si algo de lo que sigue falla se avisa, no se deshace.
  const avisos: string[] = [];
  const [leido] = await odoo.read<{ name: string }>("product.template", [tmplId], ["name"]).catch(() => []);
  if (leido && leido.name !== nuevo) avisos.push(`Odoo guardó el nombre como «${leido.name}».`);
  await odoo.messagePost("product.template", tmplId, conAutor(payloadNotaNombre({ autor: autor.nombre, anterior, nuevo }), autor.partnerId)).catch((e) => {
    avisos.push(`No se pudo publicar la nota de seguimiento: ${e instanceof Error ? e.message : String(e)}`);
  });
  return { anterior, nuevo: leido?.name ?? nuevo, cambio: true, aviso: avisos.length ? avisos.join(" ") : null, productoIds };
}
