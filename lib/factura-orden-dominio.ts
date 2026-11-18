// La factura en borrador de una orden ya finalizada, cuando después se le cambia un repuesto.
//
// Cómo nace esa factura (no la crea Taller): al pasar la orden a Finalizado, Odoo avisa a n8n (flujo «Descontar de
// stock y notificar el presupuesto», webhook taller-listo). Odoo arma una venta (sale.order con fleet_service_id) con
// los repuestos al precio de venta del producto, y n8n genera la factura en borrador y le saca las líneas cuyo nombre
// contiene alguna de estas palabras. Acá se repite esa regla: si cambia en n8n, hay que cambiarla también acá.
//
// Lo que se edita después desde Taller va a la factura con el COSTO UNITARIO cargado en la orden (decisión de
// Sebastián, 18/11/2026): las líneas que nadie toca conservan el precio con el que nacieron.
export const NO_SE_FACTURA = ["aceite", "filtro", "relay", "gps"] as const;

export function seFactura(producto: string): boolean {
  const n = producto.toLowerCase();
  return !NO_SE_FACTURA.some((p) => n.includes(p));
}

type Valores = { cantidad: number; costoUnitario: number };

/** Lo que cambió en la orden: producto, cantidad y costo unitario. */
export type CambioFactura =
  | ({ tipo: "agregar"; productoId: number; producto: string } & Valores)
  | ({ tipo: "quitar"; productoId: number; producto: string } & Valores)
  | { tipo: "editar"; productoId: number; producto: string; antes: Valores; despues: Valores };

export type FacturaOdoo = { id: number; nombre: string | null; estado: string };
export type LineaFactura = { id: number; productoId: number; cantidad: number };

/** Cómo está la orden en Odoo: sus ventas, las facturas de cliente de esas ventas (sin las canceladas) y las líneas del borrador. */
export type Situacion = { ventas: number; facturas: FacturaOdoo[]; lineas: LineaFactura[] };

export type ComandoLinea = [0, 0, Record<string, unknown>] | [1, number, Record<string, unknown>] | [2, number, 0];

export type PlanFactura =
  | { accion: "nada" }
  | { accion: "aviso"; aviso: string }
  | { accion: "escribir"; facturaId: number; comandos: ComandoLinea[]; hecho: string; aviso?: string };

const cant = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);
const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;

/** Pura: qué hay que hacerle a la factura en borrador por un cambio de repuesto. Nunca toca una factura confirmada. */
export function planFactura(c: CambioFactura, s: Situacion): PlanFactura {
  if (c.tipo === "editar" && c.antes.cantidad === c.despues.cantidad && c.antes.costoUnitario === c.despues.costoUnitario) return { accion: "nada" };
  // Lo que n8n saca de la factura nunca estuvo en ella.
  if (!seFactura(c.producto)) return { accion: "nada" };
  // Sin venta la orden todavía no se facturó: cuando se finalice, la factura sale con los repuestos de ese momento.
  if (s.ventas === 0) return { accion: "nada" };
  if (s.ventas > 1) return { accion: "aviso", aviso: "La orden tiene más de una venta en Odoo: la factura no se tocó. Revisala en Odoo." };

  const confirmada = s.facturas.find((f) => f.estado !== "draft");
  if (confirmada) {
    return { accion: "aviso", aviso: `La factura ${confirmada.nombre || "de esta orden"} ya está confirmada: el cambio no se reflejó en ella.` };
  }
  if (s.facturas.length === 0) {
    if (c.tipo === "quitar") return { accion: "nada" };
    return { accion: "aviso", aviso: "Esta orden no tiene factura en borrador: el cambio no se facturó. Si corresponde cobrarlo, hacelo en Odoo." };
  }
  if (s.facturas.length > 1) return { accion: "aviso", aviso: "La orden tiene más de una factura en borrador: no se tocó ninguna. Revisalas en Odoo." };
  const facturaId = s.facturas[0].id;

  if (c.tipo === "agregar") {
    return {
      accion: "escribir",
      facturaId,
      // Sin impuestos, como las demás líneas que genera la venta del taller.
      comandos: [[0, 0, { product_id: c.productoId, quantity: c.cantidad, price_unit: c.costoUnitario, tax_ids: [[6, 0, []]] }]],
      hecho: `se agregó ${cant(c.cantidad)} × ${c.producto} a ${gs(c.costoUnitario)}`,
    };
  }

  const cantidadAntes = c.tipo === "editar" ? c.antes.cantidad : c.cantidad;
  const delProducto = s.lineas.filter((l) => l.productoId === c.productoId);
  // Si el producto está en más de una línea, vale la que tiene la cantidad de antes.
  const linea = delProducto.length === 1 ? delProducto[0] : delProducto.find((l) => l.cantidad === cantidadAntes);
  if (!linea) {
    return {
      accion: "aviso",
      aviso: delProducto.length
        ? `${c.producto} está en varias líneas de la factura en borrador: no se cambió. Revisala en Odoo.`
        : `${c.producto} no está en la factura en borrador: no se cambió.`,
    };
  }
  if (c.tipo === "editar") {
    return {
      accion: "escribir",
      facturaId,
      comandos: [[1, linea.id, { quantity: c.despues.cantidad, price_unit: c.despues.costoUnitario }]],
      hecho: `${c.producto} quedó en ${cant(c.despues.cantidad)} × ${gs(c.despues.costoUnitario)}`,
    };
  }
  return {
    accion: "escribir",
    facturaId,
    comandos: [[2, linea.id, 0]],
    hecho: `se quitó ${cant(linea.cantidad)} × ${c.producto}`,
    aviso: s.lineas.length === 1 ? "La factura en borrador quedó sin líneas: si no corresponde cobrar nada, borrala en Odoo." : undefined,
  };
}
