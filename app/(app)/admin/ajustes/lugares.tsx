"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { leerCoordenadas, type LugarMapa } from "@/lib/ajustes-dominio";
import { Mapa } from "@/components/mapa";

// Lugares fijos que se marcan en el mapa del GPS (la oficina, el taller…). Se agregan con nombre y coordenadas
// (pegadas de Google Maps) o tocando el mapa.
export function FormLugares({ inicial }: { inicial: LugarMapa[] }) {
  const router = useRouter();
  const [lugares, setLugares] = useState(inicial);
  const [nombre, setNombre] = useState("");
  const [coords, setCoords] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null);
  const punto = leerCoordenadas(coords);
  const puedeAgregar = !!nombre.trim() && !!punto && lugares.length < 20;

  async function guardar(lista: LugarMapa[]) {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/admin/ajustes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lugares: lista }),
      });
      if (res.status === 401) return router.replace("/ingresar");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setAviso({ ok: false, msg: d.error ?? "No se pudo guardar" });
      setLugares(lista);
      setAviso({ ok: true, msg: "Se guardaron los lugares del mapa." });
    } catch {
      setAviso({ ok: false, msg: "Sin conexión. Probá de nuevo." });
    } finally {
      setGuardando(false);
    }
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeAgregar || guardando) return;
    await guardar([...lugares, { nombre: nombre.trim(), ...punto! }]);
    setNombre("");
    setCoords("");
  }

  function quitar(i: number) {
    if (confirm(`¿Quitar «${lugares[i].nombre}» del mapa?`)) void guardar(lugares.filter((_, j) => j !== i));
  }

  return (
    <form className="stack form-angosto" style={{ gap: 14, marginBottom: 14 }} onSubmit={agregar}>
        <section className="card stack" style={{ gap: 12 }}>
          <strong>Lugares del mapa</strong>
          <span className="small muted">Se marcan en el mapa del GPS de cada orden, para ver dónde está la moto respecto a la oficina.</span>
          {lugares.length ? (
            <ul className="lugares-lista">
              {lugares.map((l, i) => (
                <li key={`${l.nombre}-${i}`}>
                  <span>
                    <strong>{l.nombre}</strong>{" "}
                    <span className="tiny muted gps-hora">
                      {l.lat}, {l.lon}
                    </span>
                  </span>
                  <button type="button" className="btn btn-peligro" disabled={guardando} onClick={() => quitar(i)}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span className="small muted">Todavía no hay lugares.</span>
          )}
          <div className="field">
            <label htmlFor="l-nombre">Nombre</label>
            <input id="l-nombre" className="input" value={nombre} maxLength={60} placeholder="Oficina" onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="l-coords">Coordenadas</label>
            <input id="l-coords" className="input" value={coords} placeholder="-25.2867, -57.6470" onChange={(e) => setCoords(e.target.value)} />
            <span className="small muted">
              En Google Maps, tocá el lugar con el botón derecho y copiá los números de arriba; también sirve el enlace. O tocá el mapa de abajo.
            </span>
            {coords.trim() && !punto && <span className="small" style={{ color: "var(--danger)" }}>No se entienden las coordenadas.</span>}
          </div>
          <Mapa
            titulo="Lugares del mapa"
            alto={280}
            alTocar={(p) => setCoords(`${p.lat}, ${p.lon}`)}
            puntos={[
              ...lugares.map((l) => ({ ...l, tipo: "lugar" as const })),
              ...(punto ? [{ ...punto, nombre: nombre.trim() || "Nuevo lugar", tipo: "equipo" as const }] : []),
            ]}
          />
          <button className="btn btn-primary" disabled={!puedeAgregar || guardando}>
            {guardando ? "Guardando…" : "Agregar lugar"}
          </button>
          {aviso && <div className={`alert small ${aviso.ok ? "alert-ok" : "alert-danger"}`} role="status">{aviso.msg}</div>}
        </section>
    </form>
  );
}
