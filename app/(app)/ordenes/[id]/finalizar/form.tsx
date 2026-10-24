"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DetalleOrden } from "@/lib/ordenes";
import { comprimirFoto } from "@/lib/comprimir";

type Foto = { id: string; blob: Blob; url: string };

const MAX_FOTOS = 12;
const fmt = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

function claveGuardada(ordenId: number): string {
  const k = `finalizar:${ordenId}`;
  try {
    const v = localStorage.getItem(k);
    if (v) return v;
    const nueva = crypto.randomUUID();
    localStorage.setItem(k, nueva);
    return nueva;
  } catch {
    return crypto.randomUUID();
  }
}

function olvidarClave(ordenId: number) {
  try {
    localStorage.removeItem(`finalizar:${ordenId}`);
  } catch {}
}

export function FormFinalizar({ orden, mecanico }: { orden: DetalleOrden; mecanico: string }) {
  const router = useRouter();
  const inputFotos = useRef<HTMLInputElement>(null);
  const [odometro, setOdometro] = useState("");
  const [confirmaKm, setConfirmaKm] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [procesando, setProcesando] = useState(0);
  const [observacion, setObservacion] = useState("");
  const [listaEntrega, setListaEntrega] = useState(orden.listaEntregaPorDefecto);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ msg: string; reintentable?: boolean } | null>(null);

  useEffect(() => () => fotos.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const km = Number(odometro.replace(/\D/g, ""));
  const kmMenor = km > 0 && orden.ultimoOdometro > 0 && km < orden.ultimoOdometro;
  const puedeEnviar = km > 0 && (!kmMenor || confirmaKm) && procesando === 0 && !enviando;

  const yaFinalizada = orden.estado !== "running";

  async function agregarFotos(files: FileList | null) {
    if (!files?.length) return;
    const lista = Array.from(files).slice(0, MAX_FOTOS - fotos.length);
    setProcesando((p) => p + lista.length);
    for (const file of lista) {
      try {
        const blob = await comprimirFoto(file);
        setFotos((fs) => [...fs, { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) }]);
      } catch {
        setError({ msg: "No se pudo leer una de las fotos. Probá sacarla de nuevo." });
      } finally {
        setProcesando((p) => p - 1);
      }
    }
    if (inputFotos.current) inputFotos.current.value = "";
  }

  function quitarFoto(id: string) {
    setFotos((fs) => {
      const f = fs.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.url);
      return fs.filter((x) => x.id !== id);
    });
  }

  // Reintentar = mismo envío con la misma clave; el servidor sigue desde el paso que falló.
  async function enviar() {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    const clave = claveGuardada(orden.id);
    try {
      const fd = new FormData();
      fd.set("clave", clave);
      fd.set("odometro", String(km));
      fd.set("observacion", observacion.trim());
      fd.set("listaEntrega", String(listaEntrega));
      fotos.forEach((f, i) => fd.append("fotos", f.blob, `foto-${i + 1}.jpg`));
      const r = await fetch(`/api/ordenes/${orden.id}/finalizar`, { method: "POST", body: fd });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (!d.reintentable) olvidarClave(orden.id);
        setError({ msg: d.error ?? "No se pudo finalizar", reintentable: d.reintentable });
        return;
      }
      olvidarClave(orden.id);
      router.replace(`/ordenes/${orden.id}/listo?clave=${clave}`);
    } catch {
      setError({ msg: "Se cortó la conexión.", reintentable: true });
    } finally {
      setEnviando(false);
    }
  }

  const chofer = useMemo(() => orden.chofer ?? "sin chofer asignado", [orden.chofer]);

  return (
    <main className="wrap stack" style={{ paddingTop: 0, gap: 16 }}>
      <div className="finalizar-grid">
      <div>
      <section className="card stack" style={{ gap: 8 }}>
        <div className="row between wrap-row">
          <span className="placa placa-lg">{orden.chapa}</span>
          {orden.dias !== null && <span className={`badge ${orden.dias > 7 ? "badge-danger" : ""}`}>{orden.dias} días en taller</span>}
        </div>
        <div className="small muted">{orden.vehiculo}</div>
        <div style={{ fontWeight: 600 }}>{orden.tipo ?? "Sin tipo"}</div>
        <div className="small">{orden.descripcion ?? <span className="muted">Sin descripción</span>}</div>
        <div className="small muted">Chofer: {chofer}</div>
      </section>

      {yaFinalizada && <div className="alert alert-warn">Esta orden ya no está en proceso.</div>}

      <div className="field">
        <label htmlFor="odo">Odómetro (km)</label>
        <input
          id="odo"
          className="input"
          inputMode="numeric"
          autoComplete="off"
          placeholder={orden.ultimoOdometro ? `Último: ${fmt(orden.ultimoOdometro)}` : "Ej: 15230"}
          value={odometro ? fmt(km) : ""}
          onChange={(e) => { setOdometro(e.target.value); setConfirmaKm(false); }}
          style={{ fontFamily: "var(--font-mono)", fontSize: 22 }}
        />
        <span className="small muted">
          {orden.ultimoOdometro ? `Último registrado: ${fmt(orden.ultimoOdometro)} km` : "No hay odómetro registrado para esta moto."}
        </span>
        {kmMenor && (
          <label className="alert alert-warn row" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={confirmaKm} onChange={(e) => setConfirmaKm(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
            <span>Es menor que el último ({fmt(orden.ultimoOdometro)} km). Revisá el número. Si está bien, marcá esta casilla.</span>
          </label>
        )}
      </div>
      </div>

      <div>
      <div className="field">
        <span className="label">Fotos <span className="muted small">(opcional)</span></span>
        <div className="fotos">
          {fotos.map((f, i) => (
            <div key={f.id} className="foto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`Foto ${i + 1}`} />
              <button type="button" onClick={() => quitarFoto(f.id)} aria-label={`Quitar foto ${i + 1}`}>×</button>
            </div>
          ))}
          {Array.from({ length: procesando }).map((_, i) => <div key={`p${i}`} className="foto skeleton" />)}
          {fotos.length + procesando < MAX_FOTOS && (
            <button type="button" className="foto-add" onClick={() => inputFotos.current?.click()}>
              <span style={{ fontSize: 28 }}>📷</span>
              Sacá una foto
            </button>
          )}
        </div>
        <input ref={inputFotos} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => agregarFotos(e.target.files)} />
      </div>

      <div className="field">
        <label htmlFor="obs">Observación <span className="muted small">(opcional)</span></label>
        <textarea id="obs" className="input" placeholder="Qué hiciste, qué repuestos cambiaste, qué falta…" value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={4000} />
      </div>

      <label className="check">
        <input type="checkbox" checked={listaEntrega} onChange={(e) => setListaEntrega(e.target.checked)} />
        <span>
          <strong>La moto queda lista para entregar al chofer</strong>
          <br />
          <span className="small muted">
            {listaEntrega ? "Pasa a «Listo para entrega»." : "Pasa a «Listo para verificar» y la moto queda «Para entregar»."}
          </span>
        </span>
      </label>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error.msg}
          {error.reintentable && <><br />Podés reintentar: lo que ya se guardó no se repite.</>}
        </div>
      )}

      <div className="bottom-bar">
        <div className="stack" style={{ gap: 6 }}>
          {error?.reintentable ? (
            <button className="btn btn-primary btn-block btn-lg" disabled={!puedeEnviar} onClick={() => enviar()}>
              {enviando ? "Guardando en Odoo…" : "Reintentar"}
            </button>
          ) : (
            <button className="btn btn-primary btn-block btn-lg" disabled={!puedeEnviar || yaFinalizada} onClick={() => enviar()}>
              {enviando ? "Guardando en Odoo…" : procesando ? "Procesando fotos…" : "Finalizar trabajo"}
            </button>
          )}
          <span className="tiny muted center">Finaliza como {mecanico}</span>
        </div>
      </div>
      </div>
      </div>
    </main>
  );
}
