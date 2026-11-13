import { fechaHora } from "@/lib/historial-formato";

// Lo que reportó el mecánico al finalizar: observación y fotos. Se ve en el detalle de la orden y al verificar.
export function ReporteMecanico({ reporte }: { reporte: { observacion: string | null; fotos: number[]; fecha: string | null } }) {
  return (
    <section className="card stack" style={{ gap: 10 }}>
      <div className="row between">
        <strong>Reporte del mecánico</strong>
        {reporte.fecha && <span className="small muted">{fechaHora(reporte.fecha)}</span>}
      </div>
      {reporte.observacion === null ? (
        <span className="small muted">Todavía no hay reporte del mecánico.</span>
      ) : (
        <div style={{ whiteSpace: "pre-line" }}>{reporte.observacion || <span className="muted">Sin observación</span>}</div>
      )}
      {reporte.fotos.length > 0 && (
        <div className="detalle-fotos">
          {reporte.fotos.map((f, i) => (
            <a key={f} href={`/api/fotos/${f}`} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/fotos/${f}?tam=mini`} alt="" loading="lazy" width={120} height={120} />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
