// Cambio del precio de venta de un producto en Odoo, con nota de quién lo cambió.
import type { Many2one, OdooClient } from "./odoo";
import { NOTA_INTERNA, conAutor, escaparHtml } from "./taller";
import { ProductoInvalido } from "./crear-producto";

const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n)}`;

export function payloadNotaPrecio(p: { autor: string; producto: string; anterior: number; nuevo: number }) {
  return {
    body:
      `<p><b>${escaparHtml(p.autor)} cambió el precio de venta</b> (app del taller).</p>` +
      `<p>${escaparHtml(p.producto)}: ${gs(p.anterior)} → <b>${gs(p.nuevo)}</b></p>`,
    ...NOTA_INTERNA,
  };
}

export type ResultadoPrecio = { anterior: number; nuevo: number; cambio: boolean; aviso: string | null };

export async function cambiarPrecioVenta(
  odoo: Pick<OdooClient, "searchRead" | "write" | "messagePost">,
  productoId: number,
  nuevo: number,
  autor: { nombre: string; partnerId: number | null },
): Promise<ResultadoPrecio> {
  const [p] = await odoo.searchRead<{ id: number; display_name: string; list_price: number; product_tmpl_id: Many2one }>(
    "product.product",
    [["id", "=", productoId], ["active", "=", true]],
    ["id", "display_name", "list_price", "product_tmpl_id"],
    { limit: 1 },
  );
  if (!p) throw new ProductoInvalido("El producto no existe o está archivado en Odoo");
  const anterior = p.list_price;
  if (Math.round(anterior) === Math.round(nuevo)) return { anterior, nuevo, cambio: false, aviso: null };

  await odoo.write("product.product", [productoId], { list_price: nuevo });

  // El precio ya cambió: si la nota falla se avisa, no se deshace.
  let aviso: string | null = null;
  if (p.product_tmpl_id) {
    await odoo
      .messagePost("product.template", p.product_tmpl_id[0], conAutor(payloadNotaPrecio({ autor: autor.nombre, producto: p.display_name, anterior, nuevo }), autor.partnerId))
      .catch((e) => {
        aviso = `No se pudo publicar la nota de seguimiento: ${e instanceof Error ? e.message : String(e)}`;
      });
  }
  return { anterior, nuevo, cambio: true, aviso };
}
