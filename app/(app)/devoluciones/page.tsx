import Link from "next/link";
import { z } from "zod";
import { exigirPagina } from "@/lib/auth";
import { puedeU } from "@/lib/permisos";
import { listarDevoluciones } from "@/lib/devoluciones";
import { TIPOS_DEVOLUCION, TIPO_NOMBRE, porDia } from "@/lib/devoluciones-dominio";
import { hoyAsuncion } from "@/lib/taller";
import { fecha } from "@/lib/formato";
import { Topbar } from "@/components/topbar";
import { BorrarDevolucion } from "@/components/borrar-devolucion";

const filtros = z.object({
  q: z.string().trim().max(20).optional().catch(undefined),
  tipo: z.enum(TIPOS_DEVOLUCION).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});

function enlace(f: { q?: string; tipo?: string }, page = 1) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.tipo) p.set("tipo", f.tipo);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/devoluciones?${s}` : "/devoluciones";
}

// Devoluciones y recuperos: las motos que volvieron a la casa matriz, por día, con quién las recibió y sus fotos.
export default async function Devoluciones(props: PageProps<"/devoluciones">) {
  const u = await exigirPagina("devoluciones.ver");
  const f = filtros.parse(await props.searchParams);
  const lista = await listarDevoluciones({ q: f.q, tipo: f.tipo, pagina: f.page });
  const paginas = Math.max(1, Math.ceil(lista.total / lista.porPagina));
  const hoy = hoyAsuncion();
  const puedeRegistrar = puedeU(u, "devoluciones.registrar");
  const puedeBorrar = puedeU(u, "devoluciones.borrar");

  return (
    <>
      <Topbar titulo="Devoluciones y recuperos" />
      <main className="wrap stack" style={{ gap: 14 }}>
        <div className="row between wrap-row" style={{ gap: 10 }}>
          <nav className="chips tabs" aria-label="Tipo">
            <Link className="chip" href={enlace({ q: f.q })} aria-current={!f.tipo ? "page" : undefined}>Todas</Link>
            {TIPOS_DEVOLUCION.map((t) => (
              <Link key={t} className="chip" href={enlace({ q: f.q, tipo: t })} aria-current={f.tipo === t ? "page" : undefined}>{TIPO_NOMBRE[t]}</Link>
            ))}
          </nav>
          {puedeRegistrar && <Link className="btn btn-primary" href="/devoluciones/nueva">+ Registrar recepción</Link>}
        </div>
        <form className="row" action="/devoluciones" role="search">
          {f.tipo && <input type="hidden" name="tipo" value={f.tipo} />}
          <input className="input" name="q" defaultValue={f.q ?? ""} placeholder="Buscar por chapa" aria-label="Buscar por chapa" autoCapitalize="characters" autoComplete="off" style={{ maxWidth: 320 }} />
          <button className="btn">Buscar</button>
          {f.q && <Link className="btn btn-ghost" href={enlace({ tipo: f.tipo })}>Limpiar</Link>}
        </form>

        {lista.devoluciones.length === 0 ? (
          <div className="card small muted">
            {f.q || f.tipo ? "Ninguna recepción coincide con el filtro." : "Todavía no hay devoluciones ni recuperos registrados."}
            {puedeRegistrar && !f.q && !f.tipo && " Tocá «Registrar recepción» cuando llegue una moto."}
          </div>
        ) : (
          porDia(lista.devoluciones).map((dia) => (
            <section key={dia.fecha} className="stack" style={{ gap: 10 }}>
              <h2 className="devolucion-dia">
                {dia.fecha === hoy ? "Hoy" : fecha(dia.fecha)} <span className="small muted">{dia.items.length === 1 ? "1 moto" : `${dia.items.length} motos`}</span>
              </h2>
              <div className="devoluciones-grilla">
                {dia.items.map((d) => (
                  <article key={d.id} className="card stack" style={{ gap: 10 }}>
                    <div className="row between wrap-row">
                      <span className="placa">{d.chapa}</span>
                      <span className={`badge ${d.tipo === "recupero" ? "badge-warn" : ""}`}>{TIPO_NOMBRE[d.tipo]}</span>
                    </div>
                    {d.vehiculo && <div className="small muted">{d.vehiculo}</div>}
                    <div style={{ whiteSpace: "pre-line" }}>{d.observacion}</div>
                    <div className="devolucion-fotos">
                      {d.fotos.map((id, i) => (
                        <a key={id} href={`/api/devoluciones/fotos/${id}`} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1} de ${d.chapa}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/devoluciones/fotos/${id}?tam=mini`} alt="" loading="lazy" width={160} height={160} />
                        </a>
                      ))}
                    </div>
                    <div className="small muted">
                      Recibida por {d.por}
                      {d.chofer && <> · la tenía {d.chofer}</>}
                    </div>
                    {puedeBorrar && <BorrarDevolucion id={d.id} chapa={d.chapa} />}
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        {paginas > 1 && (
          <nav className="row between" aria-label="Páginas">
            {f.page > 1 ? <Link className="btn" href={enlace(f, f.page - 1)}>← Anteriores</Link> : <span />}
            <span className="small muted">Página {f.page} de {paginas}</span>
            {f.page < paginas ? <Link className="btn" href={enlace(f, f.page + 1)}>Siguientes →</Link> : <span />}
          </nav>
        )}
      </main>
    </>
  );
}
