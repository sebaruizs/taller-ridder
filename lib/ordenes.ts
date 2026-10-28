import "server-only";
import { odoo, m2oId } from "./odoo";
import {
  CAMPOS_ORDEN,
  CAMPOS_VEHICULO,
  MODELO_ORDEN,
  MODELO_VEHICULO,
  chapaDe,
  clienteDesde,
  diasEnTaller,
  textoCliente,
  tieneChofer,
  dominioOrdenes,
  type FiltroOrdenes,
  type OrdenOdoo,
  type VehiculoOdoo,
} from "./taller";

export const POR_PAGINA = 30;

export type OrdenLista = {
  id: number;
  chapa: string;
  vehiculo: string;
  tipo: string | null;
  tipoId: number | null;
  descripcion: string | null;
  mecanico: string | null;
  mecanicoId: number | null;
  chofer: string | null;
  choferId: number | null;
  vehiculoId: number | null;
  estado: string;
  odometro: number;
  monto: number;
  totalRepuestos: number;
  fecha: string | null;
  fechaFin: string | null;
  dias: number | null;
};

async function vehiculosPorId(ids: number[]): Promise<Map<number, VehiculoOdoo>> {
  if (!ids.length) return new Map();
  const filas = await odoo.searchRead<VehiculoOdoo>(
    MODELO_VEHICULO,
    [["id", "in", ids], ["active", "in", [true, false]]],
    [...CAMPOS_VEHICULO],
    { limit: ids.length },
  );
  return new Map(filas.map((v) => [v.id, v]));
}

function aLista(o: OrdenOdoo, v: VehiculoOdoo | undefined): OrdenLista {
  return {
    id: o.id,
    chapa: v ? chapaDe(v) : o.vehicle_id ? chapaDe({ license_plate: false, display_name: o.vehicle_id[1] }) : "—",
    vehiculo: v?.display_name ?? (o.vehicle_id ? o.vehicle_id[1] : ""),
    tipo: o.service_type_id ? o.service_type_id[1] : null,
    tipoId: m2oId(o.service_type_id),
    descripcion: o.description || null,
    mecanico: o.vendor_id ? o.vendor_id[1] : null,
    mecanicoId: m2oId(o.vendor_id),
    chofer: o.purchaser_id ? o.purchaser_id[1] : v?.driver_id ? v.driver_id[1] : null,
    choferId: m2oId(o.purchaser_id) ?? m2oId(v?.driver_id ?? false),
    vehiculoId: m2oId(o.vehicle_id),
    estado: o.state,
    odometro: o.odometer,
    monto: o.amount,
    totalRepuestos: o.total_products_cost,
    fecha: o.date || null,
    fechaFin: o.service_end_date || null,
    dias: diasEnTaller(o.date),
  };
}

export async function listarOrdenes(f: FiltroOrdenes & { pagina: number }) {
  const domain = dominioOrdenes(f);
  const [total, ordenes] = await Promise.all([
    odoo.searchCount(MODELO_ORDEN, domain),
    odoo.searchRead<OrdenOdoo>(MODELO_ORDEN, domain, [...CAMPOS_ORDEN], {
      limit: POR_PAGINA,
      offset: (f.pagina - 1) * POR_PAGINA,
      // Finalizadas: las más recientes primero; el resto, las que llevan más tiempo primero.
      // Todas (búsquedas de Cobranzas): de la más reciente a la más vieja.
      order:
        f.estado === "done" ? "service_end_date desc nulls last, date desc, id desc" : f.estado === "todos" ? "date desc, id desc" : "date asc, id asc",
    }),
  ]);
  const vehiculos = await vehiculosPorId([...new Set(ordenes.map((o) => m2oId(o.vehicle_id)).filter((x): x is number => !!x))]);
  return {
    total,
    pagina: f.pagina,
    porPagina: POR_PAGINA,
    ordenes: ordenes.map((o) => aLista(o, vehiculos.get(m2oId(o.vehicle_id) ?? 0))),
  };
}

export async function leerOrden(id: number): Promise<{ orden: OrdenOdoo; vehiculo: VehiculoOdoo } | null> {
  const [orden] = await odoo.read<OrdenOdoo>(MODELO_ORDEN, [id], [...CAMPOS_ORDEN]).catch(() => []);
  if (!orden || !orden.vehicle_id) return null;
  const vehiculo = (await vehiculosPorId([orden.vehicle_id[0]])).get(orden.vehicle_id[0]);
  if (!vehiculo) return null;
  return { orden, vehiculo };
}

// Primera factura y primera moto asignada del chofer. Si Odoo falla, simplemente no se muestra.
async function choferClienteDesde(partnerId: number | null): Promise<string | null> {
  if (!partnerId) return null;
  const [facturas, asignaciones] = await Promise.all([
    odoo.searchRead<{ invoice_date: string | false }>(
      "account.move",
      [["partner_id", "=", partnerId], ["move_type", "=", "out_invoice"], ["state", "=", "posted"]],
      ["invoice_date"],
      { limit: 1, order: "invoice_date asc" },
    ),
    odoo.searchRead<{ date_start: string | false }>("fleet.vehicle.assignation.log", [["driver_id", "=", partnerId]], ["date_start"], {
      limit: 1,
      order: "date_start asc",
    }),
  ]).catch(() => [[], []] as const);
  return clienteDesde([facturas[0]?.invoice_date, asignaciones[0]?.date_start]);
}

export async function detalleOrden(id: number) {
  const r = await leerOrden(id);
  if (!r) return null;
  const { orden, vehiculo } = r;
  const desde = await choferClienteDesde(m2oId(orden.purchaser_id) ?? m2oId(vehiculo.driver_id));
  return {
    ...aLista(orden, vehiculo),
    estado: orden.state,
    odometroOrden: orden.odometer,
    ultimoOdometro: vehiculo.odometer,
    repuestos: orden.total_products_cost,
    vehiculoId: vehiculo.id,
    tieneChofer: tieneChofer(orden, vehiculo),
    clienteDesde: desde,
    cliente: desde ? textoCliente(desde) : null,
  };
}

export type DetalleOrden = NonNullable<Awaited<ReturnType<typeof detalleOrden>>>;

type TipoServicio = { id: number; name: string };
let tiposCache: { hasta: number; tipos: TipoServicio[] } | undefined;

export async function tiposServicio(): Promise<TipoServicio[]> {
  if (tiposCache && tiposCache.hasta > Date.now()) return tiposCache.tipos;
  const tipos = await odoo.searchRead<TipoServicio>("fleet.service.type", [], ["id", "name"], { limit: 200, order: "name asc" });
  tiposCache = { hasta: Date.now() + 10 * 60_000, tipos };
  return tipos;
}
