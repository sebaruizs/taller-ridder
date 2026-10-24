import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { exigirPagina } from "@/lib/auth";
import { comprasDeProducto, detalleProducto, movimientosDeProducto, usoEnTaller } from "@/lib/inventario";
import { cantidad, fecha, gs } from "@/lib/formato";
import { puedeAlguna, puedeU } from "@/lib/permisos";
import { Topbar } from "@/components/topbar";
import { PrecioEditable } from "@/components/precio-editable";
import { Historial } from "@/components/historial";

const PESTANAS = [
  { id: "compras", nombre: "Compras" },
  { id: "movimientos", nombre: "Movimientos" },
  { id: "taller", nombre: "Uso en taller" },
  { id: "historial", nombre: "Historial" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

export default async function Producto(props: PageProps<"/inventario/[id]">) {
  const u = await exigirPagina("inventario.ver");
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await props.searchParams;
  const tab: Pestana = z.enum(["compras", "movimientos", "taller", "historial"]).catch("compras").parse(sp.tab);
  const creado = sp.creado === "1";
  const conAvisos = sp.avisos === "1";
  const p = await detalleProducto(id);
  if (!p) notFound();

  return (
    <>
      <Topbar titulo="Producto" volver="/inventario" />
      <main className="wrap stack inventario-wrap" style={{ gap: 14 }}>
        {creado && (
          <div className={`alert ${conAvisos ? "alert-warn" : "alert-ok"}`} role="status">
            Producto creado en Odoo{conAvisos ? ", pero no se pudo cargar el proveedor o la nota de seguimiento. Revisalo en Odoo." : ", con una nota de quién lo cargó."}
          </div>
        )}
        <section className="card stack" style={{ gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{p.nombre}</h2>
          <span className="small muted">{p.categoria ?? "Sin categoría"}{p.codigo ? ` · Código ${p.codigo}` : ""}{p.unidad ? ` · ${p.unidad === "Units" ? "Unidades" : p.unidad}` : ""}</span>
        </section>

        <section className="kpis">
          <div className="card kpi"><span className="small muted">Disponible</span><strong className={p.disponible <= 0 ? "rojo" : ""}>{cantidad(p.disponible)}</strong></div>
          <div className="card kpi">
            <span className="small muted">Costo (última compra)</span>
            <strong>{gs(p.costo)}</strong>
            <span className="tiny muted">
              {p.costoOrigen === "compra" ? `${fecha(p.costoFecha)}${p.costoProveedor ? ` · ${p.costoProveedor}` : ""}` : "Sin compras: se usa el costo de Odoo"}
            </span>
          </div>
          <div className="card kpi">
            <span className="small muted">Costo en Odoo</span>
            <strong>{gs(p.costoOdoo)}</strong>
            <span className="tiny muted">La app no lo modifica</span>
          </div>
          <div className="card kpi"><span className="small muted">Precio de venta</span><PrecioEditable productoId={p.id} precio={p.precio} costo={p.costo} puedeEditar={puedeU(u, "inventario.editar_precio")} variante="kpi" /></div>
          <div className="card kpi"><span className="small muted">Valor en stock</span><strong>{gs(p.valor)}</strong></div>
        </section>

        <nav className="tabs" aria-label="Pestañas del producto">
          {PESTANAS.map((t) => (
            <Link key={t.id} href={`/inventario/${id}?tab=${t.id}`} className="chip" aria-current={tab === t.id ? "page" : undefined} scroll={false}>
              {t.nombre}
            </Link>
          ))}
        </nav>

        {tab === "compras" && <Compras id={id} sellerIds={p.sellerIds} />}
        {tab === "movimientos" && <Movimientos id={id} />}
        {tab === "historial" && (p.tmplId ? <Historial ordenId={p.tmplId} modelo="product.template" /> : <div className="card muted">Sin historial.</div>)}
        {tab === "taller" && <Taller id={id} verOrdenes={puedeAlguna(u, ["ordenes.aprobar", "ordenes.editar"])} />}
      </main>
    </>
  );
}

async function Compras({ id, sellerIds }: { id: number; sellerIds: number[] }) {
  const { compras, proveedores } = await comprasDeProducto(id, sellerIds);
  return (
    <>
      <section className="card stack" style={{ gap: 10 }}>
        <strong>Órdenes de compra</strong>
        {compras.length === 0 && <span className="small muted">No hay compras registradas en Odoo.</span>}
        {compras.length > 0 && (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr><th>Fecha</th><th>Orden</th><th>Proveedor</th><th className="num">Cantidad</th><th className="num">Recibido</th><th className="num">Precio unit.</th><th className="num">Subtotal</th></tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id}>
                    <td>{fecha(c.fecha)}</td>
                    <td>{c.orden}</td>
                    <td>{c.proveedor ?? "—"}</td>
                    <td className="num">{cantidad(c.cantidad)}</td>
                    <td className={`num ${c.recibido < c.cantidad ? "ambar" : ""}`}>{cantidad(c.recibido)}</td>
                    <td className="num">{gs(c.precio)}</td>
                    <td className="num">{gs(c.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card stack" style={{ gap: 10 }}>
        <strong>Proveedores</strong>
        {proveedores.length === 0 && <span className="small muted">Sin proveedores cargados para este producto.</span>}
        {proveedores.map((s) => (
          <div key={s.id} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <span><strong>{s.proveedor}</strong>{s.minimo > 1 ? ` · mínimo ${cantidad(s.minimo)}` : ""}{s.demora ? ` · ${s.demora} días` : ""}</span>
            <span>{gs(s.precio)}</span>
          </div>
        ))}
      </section>
    </>
  );
}

async function Movimientos({ id }: { id: number }) {
  const movs = await movimientosDeProducto(id);
  return (
    <section className="card stack" style={{ gap: 10 }}>
      <strong>Últimos movimientos de stock</strong>
      {movs.length === 0 && <span className="small muted">Sin movimientos.</span>}
      {movs.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th className="num">Cantidad</th><th>Referencia</th><th>Origen</th><th>Contacto</th></tr>
            </thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td>{fecha(m.fecha)}</td>
                  <td><span className={`badge ${m.tipo === "entrada" ? "badge-ok" : m.tipo === "salida" ? "badge-danger" : ""}`}>{m.tipo === "entrada" ? "Entrada" : m.tipo === "salida" ? "Salida" : "Interno"}</span></td>
                  <td className="num">{m.tipo === "salida" ? "−" : m.tipo === "entrada" ? "+" : ""}{cantidad(m.cantidad)}</td>
                  <td>{m.referencia}</td>
                  <td className="muted">{m.origen ?? "—"}</td>
                  <td>{m.contacto ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function Taller({ id, verOrdenes }: { id: number; verOrdenes: boolean }) {
  const usos = await usoEnTaller(id);
  return (
    <section className="card stack" style={{ gap: 10 }}>
      <strong>Usado en órdenes de taller</strong>
      {usos.length === 0 && <span className="small muted">Todavía no se usó en ninguna orden.</span>}
      {usos.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Orden</th><th>Moto</th><th>Tipo</th><th className="num">Cantidad</th><th className="num">Costo</th></tr>
            </thead>
            <tbody>
              {usos.map((x) => (
                <tr key={x.id}>
                  <td>{fecha(x.fecha)}</td>
                  <td>{verOrdenes ? <Link className="tabla-link" href={`/verificar/${x.ordenId}`}>#{x.ordenId}</Link> : `#${x.ordenId}`}</td>
                  <td><span className="placa" style={{ fontSize: 13, padding: "1px 6px", borderWidth: 1.5 }}>{x.chapa}</span></td>
                  <td className="small">{x.tipo ?? "—"}</td>
                  <td className="num">{cantidad(x.cantidad)}</td>
                  <td className="num">{gs(x.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
