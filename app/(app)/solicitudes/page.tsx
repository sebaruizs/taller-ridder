import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import { puedeU } from "@/lib/permisos";
import { listarSolicitudes, ordenesAbiertasDe, type Solicitud } from "@/lib/solicitudes";
import { TEXTO_ESTADO_SOLICITUD } from "@/lib/solicitudes-dominio";
import { cantidad } from "@/lib/formato";
import { Topbar } from "@/components/topbar";
import { ResolverSolicitud } from "./resolver";

const cuando = (d: Date) =>
  new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Asuncion" }).format(d);
const claseEstado = (s: Solicitud) => (s.estado === "rechazada" ? "badge-danger" : s.estado === "aprobada" && s.reportada ? "badge-ok" : "badge-warn");
const textoEstado = (s: Solicitud) => (s.estado === "aprobada" && !s.reportada ? "Aprobada · falta reportar" : TEXTO_ESTADO_SOLICITUD[s.estado]);

function Tarjeta({ s, mostrarMecanico, children }: { s: Solicitud; mostrarMecanico: boolean; children?: React.ReactNode }) {
  return (
    <article className="card stack" style={{ gap: 8 }}>
      <div className="row between">
        <span className="placa">{s.chapa}</span>
        <span className={`badge ${claseEstado(s)}`}>{textoEstado(s)}</span>
      </div>
      <div className="row between small">
        <strong>{mostrarMecanico ? s.mecanico : s.tipo}</strong>
        <span className="muted">{cuando(s.creado)}</span>
      </div>
      {mostrarMecanico && <div className="small muted">{s.tipo} · {cantidad(s.odometro)} km</div>}
      {!mostrarMecanico && <div className="small muted">{cantidad(s.odometro)} km</div>}
      <div className="small" style={{ whiteSpace: "pre-line" }}>{s.observacion}</div>
      {s.fotos.length > 0 && (
        <div className="reporte-fotos">
          {s.fotos.map((f, i) => (
            <a key={f} href={`/api/solicitudes/fotos/${f}`} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/solicitudes/fotos/${f}`} alt="" loading="lazy" width={48} height={48} />
            </a>
          ))}
        </div>
      )}
      {s.estado === "rechazada" && <div className="alert alert-danger small">Rechazada por {s.resueltoNombre}: {s.motivo}</div>}
      {s.estado === "aprobada" && s.reportada && s.ordenId && (
        <div className="small muted">
          Aprobada por {s.resueltoNombre} · orden #{s.ordenId}
        </div>
      )}
      {children}
    </article>
  );
}

export default async function Solicitudes(props: PageProps<"/solicitudes">) {
  const u = await exigirPagina(["solicitudes.crear", "solicitudes.aprobar"]);
  const sp = await props.searchParams;
  const aprueba = puedeU(u, "solicitudes.aprobar");
  const puedeSolicitar = puedeU(u, "solicitudes.crear");
  const lista = await listarSolicitudes({ usuarioId: aprueba ? undefined : u.id });
  const porResolver = aprueba ? lista.filter((s) => s.estado === "pendiente" || (s.estado === "aprobada" && !s.reportada)) : [];
  const resto = aprueba ? lista.filter((s) => !porResolver.includes(s)) : lista;
  const abiertas = porResolver.length ? await ordenesAbiertasDe(porResolver.map((s) => s.vehiculoId)) : [];

  return (
    <>
      <Topbar
        titulo="Solicitudes"
        nombre={u.nombre}
        rol={u.rol}
        accion={puedeSolicitar ? { href: "/solicitudes/nueva", texto: "Solicitar trabajo" } : undefined}
      />
      <main className="wrap stack inventario-wrap">
        {sp.enviada && (
          <div className="alert alert-ok" role="status">
            Solicitud enviada. El jefe de taller la va a revisar; acá ves si la aprueba o la rechaza.
          </div>
        )}
        {puedeSolicitar && <Link href="/solicitudes/nueva" className="btn btn-primary solo-movil">+ Solicitar trabajo</Link>}

        {aprueba && (
          <section className="stack" style={{ gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Para aprobar ({porResolver.length})</h2>
            {porResolver.length === 0 && <div className="card center muted">No hay solicitudes pendientes.</div>}
            <div className="grid-ordenes">
              {porResolver.map((s) => (
                <Tarjeta key={s.id} s={s} mostrarMecanico>
                  <ResolverSolicitud
                    id={s.id}
                    chapa={s.chapa}
                    aprobadaSinReportar={s.estado === "aprobada"}
                    error={s.error}
                    abiertas={s.estado === "pendiente" ? abiertas.filter((o) => o.vehiculoId === s.vehiculoId) : []}
                  />
                </Tarjeta>
              ))}
            </div>
          </section>
        )}

        <section className="stack" style={{ gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{aprueba ? "Resueltas" : "Mis solicitudes"}</h2>
          {resto.length === 0 && <div className="card center muted">{aprueba ? "Todavía no hay solicitudes resueltas." : "Todavía no enviaste solicitudes."}</div>}
          <div className="grid-ordenes">
            {resto.map((s) => <Tarjeta key={s.id} s={s} mostrarMecanico={aprueba} />)}
          </div>
        </section>
      </main>
    </>
  );
}
