"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// En Reportes, el jefe corrige qué mecánico hizo el trabajo. Pide confirmación; el cambio queda en la
// auditoría y como nota en la orden.
export function CambiarMecanico({
  ordenId,
  chapa,
  mecanico,
  mecanicoId,
  mecanicos,
}: {
  ordenId: number;
  chapa: string;
  mecanico: string | null;
  mecanicoId: number | null;
  mecanicos: { id: number; nombre: string }[];
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  // El mecánico actual puede no tener ya la etiqueta en Odoo: igual se muestra.
  const opciones = mecanicoId && !mecanicos.some((m) => m.id === mecanicoId) ? [{ id: mecanicoId, nombre: mecanico ?? `#${mecanicoId}` }, ...mecanicos] : mecanicos;

  async function cambiar(e: React.ChangeEvent<HTMLSelectElement>) {
    const select = e.currentTarget;
    const nuevo = opciones.find((m) => m.id === Number(select.value));
    if (!nuevo) return;
    if (!confirm(`¿Cambiar el mecánico de ${chapa} de ${mecanico ?? "sin asignar"} a ${nuevo.nombre}?\n\nQueda registrado en la orden.`)) {
      select.value = mecanicoId ? String(mecanicoId) : "";
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/ordenes/${ordenId}/mecanico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mecanicoId: nuevo.id }),
      });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        select.value = mecanicoId ? String(mecanicoId) : "";
        return alert(d.error ?? "No se pudo cambiar el mecánico");
      }
      if (d.aviso) alert(`Se cambió el mecánico, pero: ${d.aviso}`);
      router.refresh();
    } catch {
      select.value = mecanicoId ? String(mecanicoId) : "";
      alert("Sin conexión. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <select
      className="input cambiar-mecanico"
      aria-label={`Mecánico de ${chapa}`}
      defaultValue={mecanicoId ?? ""}
      key={mecanicoId ?? 0}
      disabled={enviando}
      onChange={cambiar}
    >
      {!mecanicoId && <option value="">Sin mecánico</option>}
      {opciones.map((m) => (
        <option key={m.id} value={m.id}>
          {m.nombre}
        </option>
      ))}
    </select>
  );
}
