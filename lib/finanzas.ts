import "server-only";
import { odoo, type Many2one } from "./odoo";
import { MODELO_ORDEN, chapaDe } from "./taller";
import { EMPRESA_POR_DEFECTO, agruparPorEmpresa, empresaDeMoto, type Cobro, type GastoTaller, type Moto, type Periodo } from "./finanzas-dominio";

// Solo lectura: Finanzas no escribe nada en Odoo.

// Cobrado = pagos de clientes con fecha en el período, repartidos según las facturas que pagaron
// (cada factura tiene su moto). Se usa la conciliación para que un pago que cubre varias facturas
// se reparta bien.
async function cobrosDelPeriodo(p: Periodo): Promise<{ cobros: Cobro[]; totalPagos: number }> {
  const [parciales, [pagos]] = await Promise.all([
    odoo.searchRead<{ amount: number; debit_move_id: Many2one }>(
      "account.partial.reconcile",
      [["credit_move_id.payment_id", "!=", false], ["credit_move_id.date", ">=", p.desde], ["credit_move_id.date", "<=", p.hasta]],
      ["amount", "debit_move_id"],
      { limit: 100_000 },
    ),
    odoo.readGroup<{ amount: number }>(
      "account.payment",
      [["payment_type", "=", "inbound"], ["state", "in", ["paid", "in_process"]], ["date", ">=", p.desde], ["date", "<=", p.hasta]],
      ["amount:sum"],
      [],
    ),
  ]);
  const lineaIds = [...new Set(parciales.map((x) => (x.debit_move_id ? x.debit_move_id[0] : 0)).filter(Boolean))];
  const lineas = lineaIds.length ? await odoo.read<{ id: number; move_id: Many2one }>("account.move.line", lineaIds, ["id", "move_id"]) : [];
  const facturaIds = [...new Set(lineas.map((l) => (l.move_id ? l.move_id[0] : 0)).filter(Boolean))];
  const facturas = facturaIds.length ? await odoo.read<{ id: number; fleet_id: Many2one }>("account.move", facturaIds, ["id", "fleet_id"]) : [];
  const motoDeFactura = new Map(facturas.map((f) => [f.id, f.fleet_id ? f.fleet_id[0] : null]));
  const motoDeLinea = new Map(lineas.map((l) => [l.id, l.move_id ? (motoDeFactura.get(l.move_id[0]) ?? null) : null]));
  return {
    cobros: parciales.map((x) => ({ motoId: x.debit_move_id ? (motoDeLinea.get(x.debit_move_id[0]) ?? null) : null, monto: x.amount })),
    totalPagos: pagos?.amount ?? 0,
  };
}

// Gasto de taller = costo de las órdenes de servicio (repuestos) con fecha en el período.
async function gastosDelPeriodo(p: Periodo): Promise<GastoTaller[]> {
  const filas = await odoo.searchRead<{ id: number; vehicle_id: Many2one; amount: number; date: string | false; service_type_id: Many2one; state: string }>(
    MODELO_ORDEN,
    [["date", ">=", p.desde], ["date", "<=", p.hasta], ["amount", "!=", 0]],
    ["id", "vehicle_id", "amount", "date", "service_type_id", "state"],
    { limit: 20_000, order: "date desc, id desc" },
  );
  return filas.map((o) => ({
    id: o.id,
    motoId: o.vehicle_id ? o.vehicle_id[0] : null,
    monto: o.amount,
    fecha: o.date || null,
    tipo: o.service_type_id ? o.service_type_id[1] : null,
    estado: o.state,
  }));
}

async function motosDe(ids: number[]): Promise<Map<number, Moto>> {
  if (!ids.length) return new Map();
  // read trae también las motos archivadas, que pueden tener cobros del período.
  const filas = await odoo.read<{ id: number; license_plate: string | false; display_name: string; owner_id: Many2one }>(
    "fleet.vehicle",
    ids,
    ["id", "license_plate", "display_name", "owner_id"],
  );
  return new Map(
    filas.map((v) => {
      const e = empresaDeMoto(v.owner_id);
      return [v.id, { id: v.id, chapa: chapaDe(v), empresaId: e.id, empresa: e.nombre }];
    }),
  );
}

const cache = new Map<string, { hasta: number; valor: Promise<Awaited<ReturnType<typeof calcular>>> }>();

async function calcular(p: Periodo) {
  const [{ cobros, totalPagos }, gastos] = await Promise.all([cobrosDelPeriodo(p), gastosDelPeriodo(p)]);
  const ids = [...new Set([...cobros, ...gastos].map((x) => x.motoId).filter((x): x is number => x !== null))];
  const motos = await motosDe(ids);
  const { empresas, sinMoto } = agruparPorEmpresa(motos, cobros, gastos);
  const cobradoAsignado = cobros.reduce((s, c) => s + c.monto, 0);
  return {
    periodo: p,
    empresas,
    sinMoto,
    // Pagos que todavía no están conciliados con una factura: no se sabe de qué moto son.
    pagosSinFactura: Math.max(0, totalPagos - cobradoAsignado),
    gastos: gastos.map((g) => ({ ...g, chapa: g.motoId ? (motos.get(g.motoId)?.chapa ?? "—") : "—", empresaId: g.motoId ? (motos.get(g.motoId)?.empresaId ?? null) : null })),
    calculado: new Date().toISOString(),
  };
}

// Leer un mes de cobros lleva varios segundos: se guarda 5 minutos por período.
export function reporteFinanzas(p: Periodo, { refrescar = false } = {}) {
  const clave = `${p.desde}|${p.hasta}`;
  const c = cache.get(clave);
  if (c && c.hasta > Date.now() && !refrescar) return c.valor;
  const valor = calcular(p);
  cache.set(clave, { hasta: Date.now() + 5 * 60_000, valor });
  valor.catch(() => cache.delete(clave));
  return valor;
}

export type ReporteFinanzas = Awaited<ReturnType<typeof reporteFinanzas>>;

// Empresas = dueños de motos en Odoo (incluye motos archivadas). Rápido: un read_group.
export async function empresasOdoo(): Promise<{ id: number; nombre: string }[]> {
  const grupos = await odoo.readGroup<{ owner_id: Many2one }>("fleet.vehicle", [["active", "in", [true, false]]], ["owner_id"], ["owner_id"]);
  const mapa = new Map<number, string>([[EMPRESA_POR_DEFECTO.id, EMPRESA_POR_DEFECTO.nombre]]);
  for (const g of grupos) if (g.owner_id) mapa.set(g.owner_id[0], g.owner_id[1]);
  return [...mapa].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
