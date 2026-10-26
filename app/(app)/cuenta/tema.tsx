"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tema } from "@/lib/db/schema";

const OPCIONES: { id: Tema; nombre: string; detalle: string; dataTheme: string }[] = [
  { id: "claro", nombre: "Claro", detalle: "Fondo blanco", dataTheme: "light" },
  { id: "oscuro", nombre: "Oscuro", detalle: "Fondo azul oscuro", dataTheme: "dark" },
  { id: "sistema", nombre: "Automático", detalle: "Igual que tu celular o PC", dataTheme: "system" },
];

export function ElegirTema({ inicial }: { inicial: Tema }) {
  const router = useRouter();
  const [tema, setTema] = useState(inicial);
  const [error, setError] = useState<string | null>(null);

  async function elegir(nuevo: Tema) {
    if (nuevo === tema) return;
    const anterior = tema;
    // Se ve al instante; si no se puede guardar, vuelve al anterior.
    const aplicar = (t: Tema) => {
      setTema(t);
      document.documentElement.dataset.theme = OPCIONES.find((o) => o.id === t)!.dataTheme;
    };
    aplicar(nuevo);
    setError(null);
    try {
      const r = await fetch("/api/cuenta/tema", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema: nuevo }) });
      if (r.status === 401) return router.replace("/ingresar");
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      aplicar(anterior);
      setError("No se pudo guardar. Probá de nuevo.");
    }
  }

  return (
    <section className="card stack" style={{ gap: 10 }}>
      <strong>Apariencia</strong>
      <div className="temas" role="radiogroup" aria-label="Tema de la pantalla">
        {OPCIONES.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={tema === o.id} className="tema-opcion" onClick={() => elegir(o.id)}>
            <span className={`tema-muestra tema-muestra-${o.id}`} aria-hidden="true" />
            <strong className="small">{o.nombre}</strong>
            <span className="tiny muted">{o.detalle}</span>
          </button>
        ))}
      </div>
      <span className="tiny muted">Se guarda en tu cuenta: lo ves igual en todos tus dispositivos.</span>
      {error && <div className="alert alert-danger small" role="alert">{error}</div>}
    </section>
  );
}
