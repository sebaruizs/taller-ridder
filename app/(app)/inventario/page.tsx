import Link from "next/link";
import { z } from "zod";
import { exigirPagina } from "@/lib/auth";
import { puedeU } from "@/lib/permisos";
import { categoriasInventario, listarProductos, resumenInventario } from "@/lib/inventario";
import { cantidad, fecha, gs } from "@/lib/formato";
import { Topbar } from "@/components/topbar";
import { PrecioEditable } from "@/components/precio-editable";

const filtros = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  cat: z.coerce.number().int().positive().optional().catch(undefined),
  stock: z.enum(["todos", "con", "sin"]).default("todos").catch("todos"),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});

function enlace(f: z.infer<typeof filtros>, cambios: Partial<z.infer<typeof filtros>>) {
  const p = new URLSearchParams();
  const n = { ...f, ...cambios };
  if (n.q) p.set("q", n.q);
  if (n.cat) p.set("cat", String(n.cat));
  if (n.stock !== "todos") p.set("stock", n.stock);
  if (n.page > 1) p.set("page", String(n.page));
  const s = p.toString();
  return s ? `/inventario?${s}` : "/inventario";
}

export default async function Inventario(props: PageProps<"/inventario">) {
  const u = await exigirPagina("inventario.ver");
  const f = filtros.parse(await props.searchParams);
  const [resumen, categorias, lista] = await Promise.all([
    resumenInventario(),
    categoriasInventario(),
    listarProductos({ q: f.q, categoriaId: f.cat, stock: f.stock, pagina: f.page }),
  ]);
  const paginas = Math.max(1, Math.ceil(lista.total / lista.porPagina));
  const puedePrecio = puedeU(u, "inventario.editar_precio");

  return (
    <>
      <Topbar titulo="Inventario" nombre={u.nombre} rol={u.rol} />
      <main className="wrap stack inventario-wrap">
        {puedeU(u, "inventario.crear") && <Link href="/inventario/nuevo" className="btn btn-primary solo-movil">+ Nuevo producto</Link>}
        <section className="kpis">
          <div className="card kpi"><span className="small muted">Unidades en depósito</span><strong>{cantidad(resumen.unidades)}</strong></div>
          <div className="card kpi"><span className="small muted">Productos con stock</span><strong>{resumen.conStock}</strong></div>
          <div className="card kpi"><span className="small muted">Productos sin stock</span><strong>{resumen.sinStock}</strong></div>
        </section>

        <form className="filtros-inv" method="get" action="/inventario">
          <input className="input" type="search" name="q" defaultValue={f.q ?? ""} placeholder="Buscar por nombre o código" aria-label="Buscar producto" />
          <select className="input" name="cat" defaultValue={f.cat ?? ""} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.cantidad})</option>)}
          </select>
          <select className="input" name="stock" defaultValue={f.stock} aria-label="Stock">
            <option value="todos">Con y sin stock</option>
            <option value="con">Solo con stock</option>
            <option value="sin">Solo sin stock</option>
          </select>
          <button className="btn btn-primary">Filtrar</button>
          {(f.q || f.cat || f.stock !== "todos") && <Link className="btn btn-ghost" href="/inventario">Limpiar</Link>}
        </form>

        <div className="small muted">{lista.total === 1 ? "1 producto" : `${lista.total} productos`}</div>

        {lista.productos.length === 0 && <div className="card center muted">No hay productos con esos filtros.</div>}

        {lista.productos.length > 0 && (
          <>
            <table className="tabla solo-pc">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="num">Disponible</th>
                  <th className="num" title="Precio de la última compra (no se escribe en Odoo)">Costo</th>
                  <th className="num">Costo Odoo</th>
                  <th className="num">Precio</th>
                </tr>
              </thead>
              <tbody>
                {lista.productos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/inventario/${p.id}`} className="tabla-link">{p.nombre}</Link>
                      {p.codigo && <div className="tiny muted">{p.codigo}</div>}
                    </td>
                    <td className="small muted">{p.categoria ?? "—"}</td>
                    <td className={`num ${p.disponible <= 0 ? "rojo" : ""}`}>{cantidad(p.disponible)}</td>
                    <td className="num">
                      {gs(p.costo)}
                      <div className="tiny muted">{p.costoOrigen === "compra" ? `últ. compra ${fecha(p.costoFecha)}` : "sin compras"}</div>
                    </td>
                    <td className="num muted">{gs(p.costoOdoo)}</td>
                    <td className="num"><PrecioEditable productoId={p.id} precio={p.precio} costo={p.costo} puedeEditar={puedePrecio} variante="celda" /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="stack solo-movil-flex" style={{ gap: 10 }}>
              {lista.productos.map((p) => (
                <Link key={p.id} href={`/inventario/${p.id}`} className="card stack" style={{ gap: 6 }}>
                  <div className="row between" style={{ alignItems: "flex-start" }}>
                    <strong>{p.nombre}</strong>
                    <span className={`badge ${p.disponible <= 0 ? "badge-danger" : ""}`}>{cantidad(p.disponible)} {p.unidad === "Units" ? "u." : p.unidad ?? ""}</span>
                  </div>
                  <div className="small muted">{p.categoria ?? "Sin categoría"}{p.codigo ? ` · ${p.codigo}` : ""}</div>
                  <div className="row between small">
                    <span>Costo {gs(p.costo)}{p.costoOrigen === "odoo" ? " (Odoo)" : ""}</span>
                    <span>Precio {gs(p.precio)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {paginas > 1 && (
          <div className="row between">
            {f.page > 1 ? <Link className="btn" href={enlace(f, { page: f.page - 1 })}>Anterior</Link> : <span />}
            <span className="small muted">Página {f.page} de {paginas}</span>
            {f.page < paginas ? <Link className="btn" href={enlace(f, { page: f.page + 1 })}>Siguiente</Link> : <span />}
          </div>
        )}
      </main>
    </>
  );
}
