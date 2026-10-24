import Link from "next/link";
import { z } from "zod";
import { exigirPagina } from "@/lib/auth";
import { puedeU } from "@/lib/permisos";
import { listarCompras, resumenCompras } from "@/lib/compras";
import { proveedoresOdoo } from "@/lib/inventario";
import { RECEPCION } from "@/lib/compras-dominio";
import { fecha, gs, gsCorto } from "@/lib/formato";
import { Topbar } from "@/components/topbar";

const filtros = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  prov: z.coerce.number().int().positive().optional().catch(undefined),
  rec: z.enum(["todas", "pendientes", "recibidas"]).default("todas").catch("todas"),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});

function enlace(f: z.infer<typeof filtros>, page: number) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.prov) p.set("prov", String(f.prov));
  if (f.rec !== "todas") p.set("rec", f.rec);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/compras?${s}` : "/compras";
}

const claseRecepcion = (r: string) => (r === "full" ? "badge-ok" : "badge-danger");

export default async function Compras(props: PageProps<"/compras">) {
  const u = await exigirPagina("compras.ver");
  const f = filtros.parse(await props.searchParams);
  const [resumen, proveedores, lista] = await Promise.all([
    resumenCompras(),
    proveedoresOdoo(),
    listarCompras({ q: f.q, proveedorId: f.prov, recepcion: f.rec, pagina: f.page }),
  ]);
  const paginas = Math.max(1, Math.ceil(lista.total / lista.porPagina));

  return (
    <>
      <Topbar titulo="Compras" nombre={u.nombre} rol={u.rol} accion={puedeU(u, "compras.crear") ? { href: "/compras/nueva", texto: "Nueva compra" } : undefined} />
      <main className="wrap stack inventario-wrap">
        {puedeU(u, "compras.crear") && <Link href="/compras/nueva" className="btn btn-primary solo-movil">+ Nueva compra</Link>}

        <section className="kpis">
          <div className="card kpi"><span className="small muted">Comprado este mes</span><strong>{gsCorto(resumen.totalMes)}</strong></div>
          <div className="card kpi"><span className="small muted">Compras este mes</span><strong>{resumen.comprasMes}</strong></div>
          <Link href="/compras?rec=pendientes" className="card kpi"><span className="small muted">Pendientes de recibir</span><strong className={resumen.pendientes ? "rojo" : ""}>{resumen.pendientes}</strong></Link>
          <div className="card kpi"><span className="small muted">Total histórico</span><strong>{gsCorto(resumen.totalHistorico)}</strong></div>
        </section>

        <form className="filtros-inv" method="get" action="/compras">
          <input className="input" type="search" name="q" defaultValue={f.q ?? ""} placeholder="Buscar por número, proveedor o factura" aria-label="Buscar compra" />
          <select className="input" name="prov" defaultValue={f.prov ?? ""} aria-label="Proveedor">
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select className="input" name="rec" defaultValue={f.rec} aria-label="Recepción">
            <option value="todas">Recibidas y pendientes</option>
            <option value="pendientes">Pendientes de recibir</option>
            <option value="recibidas">Recibidas</option>
          </select>
          <button className="btn btn-primary">Filtrar</button>
          {(f.q || f.prov || f.rec !== "todas") && <Link className="btn btn-ghost" href="/compras">Limpiar</Link>}
        </form>

        <div className="small muted">{lista.total === 1 ? "1 compra" : `${lista.total} compras`}</div>
        {lista.compras.length === 0 && <div className="card center muted">No hay compras con esos filtros.</div>}

        {lista.compras.length > 0 && (
          <>
            <table className="tabla solo-pc">
              <thead>
                <tr><th>Número</th><th>Fecha</th><th>Proveedor</th><th>Factura / remito</th><th>Recepción</th><th>Cargada por</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {lista.compras.map((c) => (
                  <tr key={c.id}>
                    <td><Link className="tabla-link" href={`/compras/${c.id}`}>{c.numero}</Link></td>
                    <td>{fecha(c.fecha)}</td>
                    <td>{c.proveedor ?? "—"}</td>
                    <td className="muted">{c.referencia ?? "—"}</td>
                    <td><span className={`badge ${claseRecepcion(c.recepcion)}`}>{RECEPCION[c.recepcion] ?? c.recepcion}</span></td>
                    <td className="small">{c.cargadaPor ?? "—"}{c.desdeApp ? " · app" : ""}</td>
                    <td className="num">{gs(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="stack solo-movil-flex" style={{ gap: 10 }}>
              {lista.compras.map((c) => (
                <Link key={c.id} href={`/compras/${c.id}`} className="card stack" style={{ gap: 6 }}>
                  <div className="row between"><strong>{c.numero}</strong><span className={`badge ${claseRecepcion(c.recepcion)}`}>{RECEPCION[c.recepcion] ?? c.recepcion}</span></div>
                  <div className="small">{c.proveedor ?? "—"}</div>
                  <div className="row between small muted"><span>{fecha(c.fecha)}</span><strong style={{ color: "var(--ink)" }}>{gs(c.total)}</strong></div>
                </Link>
              ))}
            </div>
          </>
        )}

        {paginas > 1 && (
          <div className="row between">
            {f.page > 1 ? <Link className="btn" href={enlace(f, f.page - 1)}>Anterior</Link> : <span />}
            <span className="small muted">Página {f.page} de {paginas}</span>
            {f.page < paginas ? <Link className="btn" href={enlace(f, f.page + 1)}>Siguiente</Link> : <span />}
          </div>
        )}
      </main>
    </>
  );
}
