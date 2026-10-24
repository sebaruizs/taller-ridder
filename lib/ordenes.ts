import "server-only";
import { odoo, m2oId } from "./odoo";
import {
  CAMPOS_ORDEN,
  CAMPOS_VEHICULO,
  MODELO_ORDEN,
  MODELO_VEHICULO,
  chapaDe,
  checkListaEntregaPorDefecto,
  diasEnTaller,
  dominioOrdenes,
  type EstadoOrden,
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
    fecha: o.date || null,
    fechaFin: o.service_end_date || null,
    dias: diasEnTaller(o.date),
  };
}

export async function listarOrdenes(f: { estado?: EstadoOrden; chapa?: string; tipoId?: number; partnerId?: number | null; pagina: number }) {
  const domain = dominioOrdenes(f);
  const [total, ordenes] = await Promise.all([
    odoo.searchCount(MODELO_ORDEN, domain),
    odoo.searchRead<OrdenOdoo>(MODELO_ORDEN, domain, [...CAMPOS_ORDEN], {
      limit: POR_PAGINA,
      offset: (f.pagina - 1) * POR_PAGINA,
      // Finalizadas: las más recientes primero; el resto, las que llevan más tiempo primero.
      order: f.estado === "done" ? "service_end_date desc nulls last, date desc, id desc" : "date asc, id asc",
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

export async function detalleOrden(id: number) {
  const r = await leerOrden(id);
  if (!r) return null;
  const { orden, vehiculo } = r;
  return {
    ...aLista(orden, vehiculo),
    estado: orden.state,
    odometroOrden: orden.odometer,
    ultimoOdometro: vehiculo.odometer,
    repuestos: orden.total_products_cost,
    vehiculoId: vehiculo.id,
    listaEntregaPorDefecto: checkListaEntregaPorDefecto(orden, vehiculo),
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
