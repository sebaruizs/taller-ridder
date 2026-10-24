import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { exigirPagina } from "@/lib/auth";
import { buscarFinalizacion } from "@/lib/finalizar-servicio";
import type { Resumen } from "@/lib/finalizar";
import { ESTADOS, formatoKm } from "@/lib/taller";
import { puede } from "@/lib/permisos";

export default async function Listo(props: PageProps<"/ordenes/[id]/listo">) {
  const u = await exigirPagina("ordenes.finalizar");
  const clave = z.string().uuid().safeParse((await props.searchParams).clave);
  if (!clave.success) notFound();
  const fin = await buscarFinalizacion(clave.data);
  if (!fin || !fin.resumen || (fin.usuarioId !== u.id && !puede(u.rol, "finalizaciones.ver_ajenas"))) notFound();
  const r = fin.resumen as unknown as Resumen;

  return (
    <main className="wrap"><div className="stack form-angosto" style={{ paddingTop: 24, gap: 16, margin: "0 auto" }}>
      <div className="success-mark" aria-hidden>✓</div>
      <h1 className="center" style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>Trabajo finalizado</h1>
      <p className="center muted" style={{ margin: 0 }}>Quedó cargado en Odoo.</p>

      <section className="card">
        <div className="center" style={{ marginBottom: 14 }}>
          <span className="placa placa-lg">{r.chapa}</span>
        </div>
        <dl className="resumen" style={{ margin: 0 }}>
          <dt>Tarea</dt>
          <dd>{r.tipo ?? "—"}</dd>
          <dt>Odómetro</dt>
          <dd>{formatoKm(r.odometro)} km</dd>
          <dt>Fotos</dt>
          <dd>{r.fotos === 0 ? "Sin fotos" : r.fotos === 1 ? "1 foto" : `${r.fotos} fotos`}</dd>
          <dt>Observación</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{r.observacion || "—"}</dd>
          <dt>Nuevo estado</dt>
          <dd>{ESTADOS[r.estado]}</dd>
        </dl>
      </section>

      {!r.avisoTelegram && (
        <div className="alert alert-warn small">No se pudo avisar por Telegram. El trabajo sí quedó en Odoo; avisale al jefe de taller.</div>
      )}

      <div className="bottom-bar">
        <div>
          <Link href="/ordenes" className="btn btn-primary btn-block btn-lg">Volver a la lista</Link>
        </div>
      </div>
    </div></main>
  );
}
