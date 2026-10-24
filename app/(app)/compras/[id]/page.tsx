import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { puedeU } from "@/lib/permisos";
import { detalleCompra } from "@/lib/compras";
import { RECEPCION } from "@/lib/compras-dominio";
import { cantidad, fecha, gs } from "@/lib/formato";
import { Topbar } from "@/components/topbar";
import { Historial } from "@/components/historial";
import { BotonRecibir } from "./recibir";

export default async function Compra(props: PageProps<"/compras/[id]">) {
  const u = await exigirPagina("compras.ver");
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await props.searchParams;
  const c = await detalleCompra(id);
  if (!c) notFound();
  const verInventario = puedeU(u, "inventario.ver");

  return (
    <>
      <Topbar titulo={`Compra ${c.numero}`} volver="/compras" />
      <main className="wrap stack inventario-wrap" style={{ gap: 14 }}>
        {sp.creada === "1" && (
          <div className={`alert ${sp.avisos === "1" ? "alert-warn" : "alert-ok"}`} role="status">
            Compra cargada en Odoo{sp.avisos === "1" ? ", pero algo quedó pendiente: revisá la recepción y el historial." : sp.recibida === "1" ? " y recibida: la mercadería ya entró al stock." : "."}
          </div>
        )}

        <section className="kpis">
          <div className="card kpi"><span className="small muted">Proveedor</span><strong style={{ fontSize: 18 }}>{c.proveedor ?? "—"}</strong></div>
          <div className="card kpi"><span className="small muted">Fecha</span><strong>{fecha(c.fecha)}</strong></div>
          <div className="card kpi"><span className="small muted">Total</span><strong>{gs(c.total)}</strong></div>
          <div className="card kpi">
            <span className="small muted">Recepción</span>
            <strong className={c.recepcion === "full" ? "" : "rojo"}>{RECEPCION[c.recepcion] ?? c.recepcion}</strong>
          </div>
        </section>

        <section className="card stack" style={{ gap: 4 }}>
          <span className="small muted">Factura / remito: {c.referencia ?? "—"}</span>
          <span className="small muted">Cargada por: {c.cargadaPor ?? "—"}{c.desdeApp ? " (desde la app)" : ""}</span>
        </section>

        {c.puedeRecibir && puedeU(u, "compras.crear") && <BotonRecibir compraId={c.id} />}

        <section className="card stack" style={{ gap: 10 }}>
          <strong>Productos</strong>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Producto</th><th className="num">Pedido</th><th className="num">Recibido</th><th className="num">Precio unit.</th><th className="num">Subtotal</th></tr></thead>
              <tbody>
                {c.lineas.map((l) => (
                  <tr key={l.id}>
                    <td>{verInventario && l.productoId ? <Link className="tabla-link" href={`/inventario/${l.productoId}`}>{l.producto}</Link> : l.producto}</td>
                    <td className="num">{cantidad(l.cantidad)}</td>
                    <td className={`num ${l.recibido < l.cantidad ? "ambar" : ""}`}>{cantidad(l.recibido)}</td>
                    <td className="num">{gs(l.precio)}</td>
                    <td className="num">{gs(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.impuestos > 0 && <span className="small muted" style={{ textAlign: "right" }}>Subtotal {gs(c.subtotal)} · Impuestos {gs(c.impuestos)}</span>}
        </section>

        {c.recepciones.length > 0 && (
          <section className="card stack" style={{ gap: 6 }}>
            <strong>Recepciones</strong>
            {c.recepciones.map((r) => (
              <div key={r.id} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                <span>{r.numero}</span>
                <span className="muted">{r.estado}{r.fecha ? ` · ${fecha(r.fecha)}` : ""}</span>
              </div>
            ))}
          </section>
        )}

        <Historial ordenId={c.id} modelo="purchase.order" />
      </main>
    </>
  );
}
