import { Suspense } from "react";
import Link from "next/link";
import { z } from "zod";
import { exigirPagina } from "@/lib/auth";
import { empresasOdoo, reporteFinanzas } from "@/lib/finanzas";
import { ESTADO_ORDEN_FIN, MES_RE, periodoDeMes, type Periodo } from "@/lib/finanzas-dominio";
import { hoyAsuncion } from "@/lib/taller";
import { fecha, gs } from "@/lib/formato";
import { Topbar } from "@/components/topbar";

const NOMBRE_MES = new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric", timeZone: "UTC" });
const nombreMes = (mes: string) => NOMBRE_MES.format(new Date(`${mes}-01T12:00:00Z`));
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default async function Finanzas(props: PageProps<"/finanzas">) {
  const u = await exigirPagina("finanzas.ver");
  const mesActual = hoyAsuncion().slice(0, 7);
  const f = z
    .object({
      mes: z.string().regex(MES_RE).refine((m) => m <= mesActual).catch(mesActual),
      empresa: z.coerce.number().int().positive().optional().catch(undefined),
    })
    .parse(await props.searchParams);
  const periodo = periodoDeMes(f.mes);
  const empresas = await empresasOdoo();

  return (
    <>
      <Topbar titulo="Finanzas" nombre={u.nombre} rol={u.rol} />
      <main className="wrap stack inventario-wrap">
        <form className="filtros-inv" method="get" action="/finanzas">
          <input className="input" type="month" name="mes" defaultValue={f.mes} max={mesActual} aria-label="Mes" required />
          <select className="input" name="empresa" defaultValue={f.empresa ?? ""} aria-label="Empresa">
            <option value="">Todas las empresas</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <button className="btn btn-primary">Ver</button>
        </form>

        <Suspense key={`${f.mes}-${f.empresa ?? ""}`} fallback={<div className="card muted center">Leyendo cobros y órdenes de taller de {nombreMes(f.mes)} en Odoo…</div>}>
          {f.empresa ? <Empresa periodo={periodo} empresaId={f.empresa} nombre={empresas.find((e) => e.id === f.empresa)?.nombre ?? "Empresa"} /> : <Todas periodo={periodo} />}
        </Suspense>
      </main>
    </>
  );
}

function Kpis({ cobrado, taller }: { cobrado: number; taller: number }) {
  const resultado = cobrado - taller;
  return (
    <section className="kpis">
      <div className="card kpi"><span className="small muted">Cobrado</span><strong>{gs(cobrado)}</strong></div>
      <div className="card kpi"><span className="small muted">Gasto de taller</span><strong>{gs(taller)}</strong></div>
      <div className="card kpi"><span className="small muted">Resultado</span><strong className={resultado < 0 ? "rojo" : ""}>{gs(resultado)}</strong></div>
    </section>
  );
}

function Nota({ calculado }: { calculado: string }) {
  const hora = new Intl.DateTimeFormat("es-PY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Asuncion" }).format(new Date(calculado));
  return (
    <p className="small muted" style={{ margin: 0 }}>
      Cobrado: pagos recibidos en el mes, repartidos por la moto de la factura que pagaron. Gasto de taller: costo de repuestos de las
      órdenes de servicio del mes. La empresa es el Dueño de la moto en Odoo; las motos sin dueño cuentan como Redi EAS. Datos de Odoo de las {hora}
    </p>
  );
}

async function Todas({ periodo }: { periodo: Periodo }) {
  const r = await reporteFinanzas(periodo);
  const cobrado = r.empresas.reduce((s, e) => s + e.cobrado, 0);
  const taller = r.empresas.reduce((s, e) => s + e.taller, 0);
  return (
    <>
      <Kpis cobrado={cobrado} taller={taller} />
      <div className="grid-finanzas">
        {r.empresas.map((e) => (
          <Link key={e.id} href={`/finanzas?mes=${periodo.mes}&empresa=${e.id}`} className="card stack" style={{ gap: 8 }}>
            <div className="row between"><strong style={{ fontSize: 17 }}>{e.nombre}</strong><span className="badge">{e.motos.length === 1 ? "1 moto" : `${e.motos.length} motos`}</span></div>
            <div className="row between small"><span className="muted">Cobrado</span><span>{gs(e.cobrado)}</span></div>
            <div className="row between small"><span className="muted">Gasto de taller</span><span>{gs(e.taller)}</span></div>
            <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span className="small muted">Resultado</span><strong className={e.resultado < 0 ? "rojo" : ""}>{gs(e.resultado)}</strong>
            </div>
            <span className="small" style={{ color: "var(--accent)" }}>Ver cierre →</span>
          </Link>
        ))}
      </div>
      {(r.pagosSinFactura > 0 || r.sinMoto.cobrado > 0 || r.sinMoto.taller > 0) && (
        <section className="card stack" style={{ gap: 4 }}>
          <strong>Sin asignar a una empresa</strong>
          {r.sinMoto.cobrado > 0 && <span className="small">Cobros de facturas sin moto: {gs(r.sinMoto.cobrado)}</span>}
          {r.pagosSinFactura > 0 && <span className="small">Pagos sin conciliar con una factura: {gs(r.pagosSinFactura)}</span>}
          {r.sinMoto.taller > 0 && <span className="small">Órdenes de taller sin moto: {gs(r.sinMoto.taller)}</span>}
          <span className="small muted">No entran en ninguna empresa hasta que se corrijan en Odoo.</span>
        </section>
      )}
      <Nota calculado={r.calculado} />
    </>
  );
}

async function Empresa({ periodo, empresaId, nombre }: { periodo: Periodo; empresaId: number; nombre: string }) {
  const r = await reporteFinanzas(periodo);
  const e = r.empresas.find((x) => x.id === empresaId);
  const gastos = r.gastos.filter((g) => g.empresaId === empresaId);
  return (
    <>
      <div className="row between wrap-row" style={{ gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Cierre {nombre} · {mayuscula(nombreMes(periodo.mes))}</h2>
        {e && <a className="btn" href={`/api/finanzas/csv?mes=${periodo.mes}&empresa=${empresaId}`}>Descargar CSV</a>}
      </div>
      <Kpis cobrado={e?.cobrado ?? 0} taller={e?.taller ?? 0} />
      {!e && <div className="card muted center">Sin cobros ni gastos de taller en este mes.</div>}

      {e && (
        <section className="card stack" style={{ gap: 10 }}>
          <strong>Por moto ({e.motos.length})</strong>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Moto</th><th className="num">Cobrado</th><th className="num">Gasto taller</th><th className="num">Resultado</th><th className="num">Órdenes</th></tr></thead>
              <tbody>
                {e.motos.map((m) => (
                  <tr key={m.motoId}>
                    <td>{m.chapa}</td>
                    <td className="num">{gs(m.cobrado)}</td>
                    <td className="num">{m.taller ? gs(m.taller) : "—"}</td>
                    <td className={`num ${m.resultado < 0 ? "rojo" : ""}`}>{gs(m.resultado)}</td>
                    <td className="num">{m.ordenes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {gastos.length > 0 && (
        <section className="card stack" style={{ gap: 10 }}>
          <strong>Órdenes de taller ({gastos.length})</strong>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Orden</th><th>Moto</th><th>Tipo</th><th>Estado</th><th className="num">Costo</th></tr></thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td>{fecha(g.fecha)}</td>
                    <td>#{g.id}</td>
                    <td>{g.chapa}</td>
                    <td className="muted">{g.tipo ?? "—"}</td>
                    <td className="small">{ESTADO_ORDEN_FIN[g.estado] ?? g.estado}</td>
                    <td className="num">{gs(g.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Nota calculado={r.calculado} />
    </>
  );
}
