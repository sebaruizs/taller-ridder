import { cambiosDe, type CambioRegistro } from "@/lib/registro-cambios";
import { gs } from "@/lib/formato";

const MONTOS = new Set(["Precio de venta", "Costo"]);
const VISIBLES = 5;

const fechaHora = new Intl.DateTimeFormat("es-PY", { timeZone: "America/Asuncion", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function Valor({ campo, valor, fuerte }: { campo: string; valor: unknown; fuerte?: boolean }) {
  if (valor === null || valor === undefined || valor === "") return <span className="muted">vacío</span>;
  const texto = typeof valor === "number" && MONTOS.has(campo) ? gs(valor) : String(valor);
  return fuerte ? <strong>{texto}</strong> : <span>{texto}</span>;
}

function Renglon({ c }: { c: CambioRegistro }) {
  return (
    <article className="registro-item stack" style={{ gap: 4 }}>
      <div className="registro-cab">
        <strong className="small">{c.titulo}</strong>
        <span className="tiny muted">{c.autor} · {fechaHora.format(c.fecha)}</span>
      </div>
      {c.origen && <span className="tiny muted">{c.origen}</span>}
      {c.campos.map((f) => (
        <div key={f.campo} className="small registro-campo">
          <span className="muted">{f.campo}</span>
          <span style={{ overflowWrap: "anywhere" }}>
            {c.titulo === "Producto creado" ? null : <><Valor campo={f.campo} valor={f.antes} /> → </>}
            <Valor campo={f.campo} valor={f.despues} fuerte />
          </span>
        </div>
      ))}
      {c.aviso && <span className="tiny" style={{ color: "var(--danger)" }}>{c.aviso}</span>}
    </article>
  );
}

// Lo que se cambió desde esta app sobre un objeto ("producto:46"), con quién, cuándo y el antes y después.
export async function RegistroCambios({ objeto }: { objeto: string }) {
  const cambios = await cambiosDe(objeto).catch(() => null);
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Registro de cambios">
      <strong>Registro de cambios</strong>
      {cambios === null && <span className="small muted">No se pudo leer el registro de cambios.</span>}
      {cambios?.length === 0 && <span className="small muted">Todavía no se cambió nada desde la app.</span>}
      {cambios?.slice(0, VISIBLES).map((c) => <Renglon key={c.id} c={c} />)}
      {cambios && cambios.length > VISIBLES && (
        <details className="registro-mas">
          <summary className="small">Ver los {cambios.length}</summary>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            {cambios.slice(VISIBLES).map((c) => <Renglon key={c.id} c={c} />)}
          </div>
        </details>
      )}
      <span className="tiny muted">Cambios hechos desde esta app. Lo que se cambia directo en Odoo aparece abajo, en el historial de Odoo.</span>
    </section>
  );
}
