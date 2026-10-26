import Link from "next/link";
import { z } from "zod";
import { exigirPagina } from "@/lib/auth";
import { listarReportes, type Reporte } from "@/lib/reportes";
import { mecanicosOdoo } from "@/lib/usuarios";
import { ESTADOS, type EstadoOrden } from "@/lib/taller";
import { fechaHora } from "@/lib/historial-formato";
import { cantidad, fecha } from "@/lib/formato";
import { Topbar } from "@/components/topbar";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const filtros = z.object({
  q: z.string().trim().max(20).optional().catch(undefined),
  mec: z.coerce.number().int().positive().optional().catch(undefined),
  desde: z.string().regex(FECHA_RE).optional().catch(undefined),
  hasta: z.string().regex(FECHA_RE).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});

function enlace(f: z.infer<typeof filtros>, page: number) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.mec) p.set("mec", String(f.mec));
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/reportes?${s}` : "/reportes";
}

const cuando = (r: Reporte) => (r.fecha ? fechaHora(r.fecha) : fecha(r.dia));
const claseEstado = (e: string) => (e === "done" ? "badge-ok" : e === "cancelled" ? "badge-warn" : "");

function Fotos({ r }: { r: Reporte }) {
  if (!r.fotos.length) return <span className="small muted">Sin fotos</span>;
  return (
    <div className="reporte-fotos">
      {r.fotos.map((id, i) => (
        <a key={id} href={`/api/fotos/${id}`} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1} de ${r.chapa}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/fotos/${id}?tam=mini`} alt="" loading="lazy" width={48} height={48} />
        </a>
      ))}
    </div>
  );
}

export default async function Reportes(props: PageProps<"/reportes">) {
  const u = await exigirPagina("reportes.ver");
  const f = filtros.parse(await props.searchParams);
  const [mecanicos, lista] = await Promise.all([
    mecanicosOdoo().catch(() => []),
    listarReportes({ q: f.q, mecanicoId: f.mec, desde: f.desde, hasta: f.hasta, pagina: f.page }),
  ]);
  const paginas = Math.max(1, Math.ceil(lista.total / lista.porPagina));
  const hayFiltros = Boolean(f.q || f.mec || f.desde || f.hasta);

  return (
    <>
      <Topbar titulo="Reportes" nombre={u.nombre} rol={u.rol} />
      <main className="wrap stack inventario-wrap">
        <form className="filtros-inv filtros-reportes" method="get" action="/reportes">
          <input className="input" type="search" name="q" defaultValue={f.q ?? ""} placeholder="Chapa" aria-label="Buscar por chapa" autoCapitalize="characters" />
          <select className="input" name="mec" defaultValue={f.mec ?? ""} aria-label="Mecánico">
            <option value="">Todos los mecánicos</option>
            {mecanicos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <input className="input" type="date" name="desde" defaultValue={f.desde ?? ""} aria-label="Desde" />
          <input className="input" type="date" name="hasta" defaultValue={f.hasta ?? ""} aria-label="Hasta" />
          <button className="btn btn-primary">Filtrar</button>
          {hayFiltros && <Link className="btn btn-ghost" href="/reportes">Limpiar</Link>}
        </form>

        <div className="small muted">{lista.total === 1 ? "1 reporte" : `${cantidad(lista.total)} reportes`}</div>
        {lista.reportes.length === 0 && <div className="card center muted">No hay reportes con esos filtros.</div>}

        {lista.reportes.length > 0 && (
          <>
            <table className="tabla solo-pc tabla-reportes">
              <thead>
                <tr><th>Fecha</th><th>Mecánico</th><th>Chapa</th><th className="num">Odómetro</th><th>Fotos</th><th>Observación</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {lista.reportes.map((r) => (
                  <tr key={r.ordenId}>
                    <td style={{ whiteSpace: "nowrap" }}>{cuando(r)}</td>
                    <td>{r.mecanico ? <span className="badge">{r.mecanico}</span> : <span className="muted">—</span>}</td>
                    <td><Link href={`/ordenes/${r.ordenId}?de=reportes`} className="placa placa-sm placa-link">{r.chapa}</Link></td>
                    <td className="num">{r.odometro ? cantidad(r.odometro) : "—"}</td>
                    <td><Fotos r={r} /></td>
                    <td className="reporte-obs" title={r.observacion ?? undefined}>
                      {r.observacion || <span className="muted">{r.observacion === null ? "Sin nota de reporte" : "Sin observación"}</span>}
                      {r.tipo && <div className="tiny muted">{r.tipo} · orden #{r.ordenId}</div>}
                    </td>
                    <td><span className={`badge ${claseEstado(r.estado)}`}>{ESTADOS[r.estado as EstadoOrden] ?? r.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="stack solo-movil-flex" style={{ gap: 10 }}>
              {lista.reportes.map((r) => (
                <article key={r.ordenId} className="card stack" style={{ gap: 8 }}>
                  <div className="row between">
                    <Link href={`/ordenes/${r.ordenId}?de=reportes`} className="placa placa-link">{r.chapa}</Link>
                    <span className="small muted">{cuando(r)}</span>
                  </div>
                  <div className="row between small">
                    <strong>{r.mecanico ?? "Sin mecánico"}</strong>
                    <span className="muted">{r.odometro ? `${cantidad(r.odometro)} km` : ""}</span>
                  </div>
                  {r.observacion && <div className="small" style={{ whiteSpace: "pre-line" }}>{r.observacion}</div>}
                  <Fotos r={r} />
                  <div className="row between tiny muted">
                    <span>{r.tipo ?? ""} · #{r.ordenId}</span>
                    <span className={`badge ${claseEstado(r.estado)}`}>{ESTADOS[r.estado as EstadoOrden] ?? r.estado}</span>
                  </div>
                </article>
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
