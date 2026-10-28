"use client";
import Link from "next/link";
import { useState } from "react";
import type { DetalleOrden } from "@/lib/ordenes";
import { ESTADOS, type EstadoOrden, type LineaRepuesto } from "@/lib/taller";
import { TablaRepuestos, gs, useRepuestos } from "@/components/repuestos-orden";
import { PanelGps } from "@/components/gps-tarjeta";

type Aprobada = { chapa: string; lineas: LineaRepuesto[]; avisos: string[] };

export function VerificarOrden({
  orden,
  lineasIniciales,
  puedeRepuestos,
  puedeAprobar,
  gps,
  historial,
}: {
  orden: DetalleOrden;
  lineasIniciales: LineaRepuesto[];
  puedeRepuestos: boolean;
  puedeAprobar: boolean;
  gps: { puedeBloquear: boolean } | null;
  historial: React.ReactNode;
}) {
  const rep = useRepuestos(orden.id, lineasIniciales);
  const lineas = rep.lineas;
  const { total, ocupado, error } = rep;
  const [sinRepuestos, setSinRepuestos] = useState(false);
  const [aprobada, setAprobada] = useState<Aprobada | null>(null);

  // Aprobar solo en «Listo para verificar»; los repuestos se cargan en cualquier estado.
  const editable = orden.estado === "cancelled";
  const estadoTexto = ESTADOS[orden.estado as EstadoOrden] ?? orden.estado;

  async function aprobar() {
    const d = await rep.llamar(`/api/ordenes/${orden.id}/aprobar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmaSinRepuestos: sinRepuestos }),
    });
    if (d) setAprobada(d as unknown as Aprobada);
  }

  if (aprobada) {
    return (
      <main className="wrap">
        <div className="stack form-angosto" style={{ gap: 16, margin: "0 auto", paddingTop: 16 }}>
          <div className="success-mark" aria-hidden>✓</div>
          <h2 className="center" style={{ margin: 0 }}>Orden verificada</h2>
          <div className="center"><span className="placa placa-lg">{aprobada.chapa}</span></div>
          <p className="center muted" style={{ margin: 0 }}>
            Quedó «Finalizada» con {aprobada.lineas.length === 1 ? "1 repuesto" : `${aprobada.lineas.length} repuestos`} ({gs(aprobada.lineas.reduce((s, l) => s + l.total, 0))}).
          </p>
          {aprobada.avisos.map((a) => <div key={a} className="alert alert-warn small">{a}</div>)}
          <Link className="btn btn-primary btn-lg" href="/verificar">Volver a Para verificar</Link>
        </div>
      </main>
    );
  }

  const listoParaAprobar = puedeAprobar && editable && !ocupado && (lineas.length > 0 || sinRepuestos);

  return (
    <main className="wrap wrap-ancho">
      <div className="finalizar-grid">
        <div>
          <section className="card stack" style={{ gap: 8 }}>
            <div className="row between wrap-row">
              <span className="placa placa-lg">{orden.chapa}</span>
              {orden.dias !== null && <span className="badge">{orden.dias} días en taller</span>}
            </div>
            <div className="small muted">{orden.vehiculo}</div>
            <div style={{ fontWeight: 600 }}>{orden.tipo ?? "Sin tipo"}</div>
            <div className="small">{orden.descripcion ?? <span className="muted">Sin descripción</span>}</div>
            <div className="small muted">Mecánico: {orden.mecanico ?? "sin asignar"}</div>
            <div className="small muted">Chofer: {orden.chofer ?? "sin chofer asignado"}</div>
            {orden.cliente && <div className="small muted">{orden.cliente}</div>}
            {orden.odometroOrden > 0 && <div className="small muted">Odómetro al finalizar: {new Intl.NumberFormat("es-PY").format(orden.odometroOrden)} km</div>}
          </section>
          {!editable && (
            <div className="alert small" style={{ background: "var(--surface-2)" }}>
              Esta orden está en «{estadoTexto}». {puedeRepuestos ? "Podés cargar o quitar repuestos; la aprobación se hace cuando pase a «Listo para verificar»." : "La aprobación se hace cuando pase a «Listo para verificar»."}
            </div>
          )}
        </div>

        <div>

          {editable && puedeAprobar && lineas.length === 0 && (
            <label className="check">
              <input type="checkbox" checked={sinRepuestos} onChange={(e) => setSinRepuestos(e.target.checked)} />
              <span><strong>No se usaron repuestos</strong><br /><span className="small muted">Marcalo solo si el trabajo no llevó ningún repuesto.</span></span>
            </label>
          )}

          {error && <div className="alert alert-danger" role="alert">{error}</div>}

          {editable && puedeAprobar && (
            <div className="bottom-bar">
              <div className="stack" style={{ gap: 6 }}>
                <button className="btn btn-primary btn-block btn-lg" disabled={!listoParaAprobar} onClick={aprobar}>
                  {ocupado ? "Guardando en Odoo…" : "Aprobar · pasa a Finalizado"}
                </button>
                <span className="tiny muted center">Total repuestos: {gs(total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="stack" style={{ gap: 14, marginTop: 14 }}>
        {gps && <PanelGps ordenId={orden.id} chapa={orden.chapa} puedeBloquear={gps.puedeBloquear} />}
        <TablaRepuestos r={rep} editable={puedeRepuestos} alAgregar={() => setSinRepuestos(false)} conError={false} />
        {historial}
      </div>
    </main>
  );
}
