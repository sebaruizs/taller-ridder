// Reglas de Finanzas (sin I/O). La empresa de cada moto es su Dueño en Odoo (fleet.vehicle.owner_id);
// las motos sin dueño se cuentan como de Redi EAS.
export const EMPRESA_POR_DEFECTO = { id: 1, nombre: "Redi EAS" } as const;

export type Periodo = { mes: string; desde: string; hasta: string };

// "2026-09" → del 2026-09-01 al 2026-09-30 (fechas de Odoo, sin hora).
export function periodoDeMes(mes: string): Periodo {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { mes, desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type Moto = { id: number; chapa: string; empresaId: number; empresa: string };
export type Cobro = { motoId: number | null; monto: number };
export type GastoTaller = { id: number; motoId: number | null; monto: number; fecha: string | null; tipo: string | null; estado: string };

export type FilaMoto = { motoId: number; chapa: string; cobrado: number; taller: number; resultado: number; ordenes: number };
export type ResumenEmpresa = { id: number; nombre: string; cobrado: number; taller: number; resultado: number; motos: FilaMoto[] };

export function empresaDeMoto(owner: [number, string] | false): { id: number; nombre: string } {
  return owner ? { id: owner[0], nombre: owner[1] } : EMPRESA_POR_DEFECTO;
}

// Reparte cobros y gastos de taller por empresa y por moto. Lo que no tiene moto queda en sinMoto.
export function agruparPorEmpresa(motos: Map<number, Moto>, cobros: Cobro[], gastos: GastoTaller[]) {
  const empresas = new Map<number, { nombre: string; filas: Map<number, FilaMoto> }>();
  const sinMoto = { cobrado: 0, taller: 0 };

  function fila(motoId: number): FilaMoto | null {
    const m = motos.get(motoId);
    if (!m) return null;
    let e = empresas.get(m.empresaId);
    if (!e) empresas.set(m.empresaId, (e = { nombre: m.empresa, filas: new Map() }));
    let f = e.filas.get(motoId);
    if (!f) e.filas.set(motoId, (f = { motoId, chapa: m.chapa, cobrado: 0, taller: 0, resultado: 0, ordenes: 0 }));
    return f;
  }

  for (const c of cobros) {
    const f = c.motoId ? fila(c.motoId) : null;
    if (f) f.cobrado += c.monto;
    else sinMoto.cobrado += c.monto;
  }
  for (const g of gastos) {
    const f = g.motoId ? fila(g.motoId) : null;
    if (f) {
      f.taller += g.monto;
      f.ordenes += 1;
    } else sinMoto.taller += g.monto;
  }

  const resumen: ResumenEmpresa[] = [...empresas].map(([id, e]) => {
    const filas = [...e.filas.values()].map((f) => ({ ...f, resultado: f.cobrado - f.taller })).sort((a, b) => a.resultado - b.resultado);
    const cobrado = filas.reduce((s, f) => s + f.cobrado, 0);
    const taller = filas.reduce((s, f) => s + f.taller, 0);
    return { id, nombre: e.nombre, cobrado, taller, resultado: cobrado - taller, motos: filas };
  });
  resumen.sort((a, b) => b.cobrado - a.cobrado);
  return { empresas: resumen, sinMoto };
}

export const ESTADO_ORDEN_FIN: Record<string, string> = {
  new: "Nuevo",
  running: "En proceso",
  cancelled: "Listo para verificar",
  to_be_paid: "Listo para entrega",
  done: "Finalizado",
};

// Para descargar el cierre: CSV con ; (Excel en español) y montos sin separador de miles.
export function csvCierre(empresa: ResumenEmpresa, periodo: Periodo): string {
  const filas = [
    ["Empresa", empresa.nombre],
    ["Período", `${periodo.desde} a ${periodo.hasta}`],
    [],
    ["Moto", "Cobrado", "Gasto taller", "Resultado", "Órdenes de taller"],
    ...empresa.motos.map((m) => [m.chapa, m.cobrado, m.taller, m.resultado, m.ordenes]),
    [],
    ["Total", empresa.cobrado, empresa.taller, empresa.resultado],
  ];
  return filas.map((f) => f.map((v) => (typeof v === "number" ? String(Math.round(v)) : `"${String(v).replace(/"/g, '""')}"`)).join(";")).join("\r\n");
}
