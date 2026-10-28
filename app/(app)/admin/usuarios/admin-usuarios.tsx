"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UsuarioAdmin, ContactoOdoo } from "@/lib/usuarios";
import type { Rol } from "@/lib/db/schema";
import { MODULOS, PERMISOS, claveModulo, modulosDelRol, permisosDelRol, resumenPermisosOff, type Modulo } from "@/lib/permisos";

const ROL_NOMBRE: Record<Rol, string> = { mecanico: "Mecánico", jefe: "Jefe de taller", cobrador: "Cobrador", admin: "Admin" };
// Orden de los grupos en la lista; los inactivos van todos juntos al final.
const ORDEN_ROLES: Rol[] = ["admin", "jefe", "cobrador", "mecanico"];

type Form = {
  id: number | null;
  usuario: string;
  nombre: string;
  rol: Rol;
  odooPartnerId: number | null;
  password: string;
  activo: boolean;
  permisosOff: string[];
};

const VACIO: Form = { id: null, usuario: "", nombre: "", rol: "mecanico", odooPartnerId: null, password: "", activo: true, permisosOff: [] };

export function AdminUsuarios({ inicial, yo }: { inicial: UsuarioAdmin[]; yo: number }) {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState(inicial);
  const [contactos, setContactos] = useState<ContactoOdoo[] | null>(null);
  const [errorContactos, setErrorContactos] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [intentoContactos, setIntentoContactos] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/admin/mecanicos-odoo", { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setContactos(d.contactos);
        setErrorContactos(null);
      })
      .catch((e) => e.name !== "AbortError" && setErrorContactos(e.message || "No se pudo leer Odoo"));
    return () => ctrl.abort();
  }, [intentoContactos]);

  async function recargar() {
    const r = await fetch("/api/admin/usuarios");
    if (r.status === 401) return router.replace("/ingresar");
    const d = await r.json();
    if (r.ok) setUsuarios(d.usuarios);
  }

  function editar(u: UsuarioAdmin) {
    setAviso(null);
    setError(null);
    setForm({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, odooPartnerId: u.odooPartnerId, password: "", activo: u.activo, permisosOff: u.permisosOff ?? [] });
  }

  function elegirContacto(id: number | null) {
    if (!form) return;
    const c = contactos?.find((x) => x.id === id);
    setForm({ ...form, odooPartnerId: id, nombre: form.nombre || c?.nombre || "" });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form || guardando) return;
    setGuardando(true);
    setError(null);
    const body = { nombre: form.nombre, rol: form.rol, odooPartnerId: form.odooPartnerId, activo: form.activo, password: form.password, permisosOff: form.permisosOff };
    try {
      const r = form.id
        ? await fetch(`/api/admin/usuarios/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/admin/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, usuario: form.usuario }) });
      if (r.status === 401) return router.replace("/ingresar");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "No se pudo guardar");
      setAviso(form.id ? `Se guardaron los cambios de ${form.nombre}.` : `Se creó el usuario «${form.usuario.trim().toLowerCase()}».`);
      setForm(null);
      await recargar();
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const contactoNombre = (u: UsuarioAdmin) => u.odooPartnerNombre ?? (u.odooPartnerId ? `#${u.odooPartnerId}` : null);
  const usados = new Set(usuarios.filter((u) => u.id !== form?.id && u.activo).map((u) => u.odooPartnerId));

  if (form) {
    const nuevo = form.id === null;
    return (
      <main className="wrap"><div className="stack form-angosto" style={{ gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{nuevo ? "Nuevo usuario" : `Editar ${form.usuario}`}</h2>
        <form className="stack" style={{ gap: 14 }} onSubmit={guardar}>
          {nuevo && (
            <div className="field">
              <label htmlFor="f-usuario">Usuario</label>
              <input id="f-usuario" className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="ej: carlos.ramirez"
                value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} required />
              <span className="small muted">Con esto ingresa. Sin espacios; no se puede cambiar después.</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="f-rol">Rol</label>
            <select id="f-rol" className="input" value={form.rol} disabled={form.id === yo}
              onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
              {(Object.keys(ROL_NOMBRE) as Rol[]).map((r) => <option key={r} value={r}>{ROL_NOMBRE[r]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-contacto">Contacto en Odoo {form.rol !== "mecanico" && <span className="muted small">(opcional)</span>}</label>
            {errorContactos ? (
              <div className="alert alert-danger small stack" style={{ gap: 8 }}>
                <span>No se pudo leer la lista de Odoo: {errorContactos}</span>
                <button type="button" className="btn" onClick={() => { setErrorContactos(null); setIntentoContactos((n) => n + 1); }}>Reintentar</button>
              </div>
            ) : (
              <select id="f-contacto" className="input" value={form.odooPartnerId ?? ""} disabled={!contactos}
                onChange={(e) => elegirContacto(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{contactos ? "Sin contacto" : "Cargando contactos de Odoo…"}</option>
                {form.odooPartnerId && contactos && !contactos.some((c) => c.id === form.odooPartnerId) && (
                  <option value={form.odooPartnerId}>#{form.odooPartnerId} (ya no tiene la etiqueta)</option>
                )}
                {contactos?.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}{usados.has(c.id) ? " · ya vinculado" : ""}</option>
                ))}
              </select>
            )}
            <span className="small muted">Contactos con la etiqueta «mecanico». Queda como Responsable de la orden al finalizar.</span>
          </div>
          <div className="field">
            <label htmlFor="f-nombre">Nombre visible</label>
            <input id="f-nombre" className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </div>
          {modulosDelRol(form.rol).length > 0 && (
            <fieldset className="stack" style={{ gap: 10, border: 0, margin: 0, padding: 0 }}>
              <legend className="label" style={{ padding: 0, marginBottom: 4 }}>Permisos por módulo</legend>
              <span className="small muted">Apagá un módulo entero o destildá lo que esta persona no debe poder hacer.</span>
              {modulosDelRol(form.rol).map((m) => (
                <PermisosModulo key={m} modulo={m} rol={form.rol} off={form.permisosOff} onChange={(permisosOff) => setForm({ ...form, permisosOff })} />
              ))}
            </fieldset>
          )}
          {form.rol === "admin" && <div className="small muted">El admin tiene siempre todos los permisos.</div>}
          <div className="field">
            <label htmlFor="f-pass">{nuevo ? "Contraseña" : "Nueva contraseña"}</label>
            <input id="f-pass" className="input" type="text" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder={nuevo ? "Mínimo 8 caracteres" : "Dejá vacío para no cambiarla"}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={nuevo} minLength={8} />
            {!nuevo && <span className="small muted">Si la cambiás, se cierra su sesión en todos los dispositivos.</span>}
          </div>
          {!nuevo && form.id !== yo && (
            <label className="check">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              <span><strong>Activo</strong><br /><span className="small muted">Si lo desactivás, no puede ingresar y se cierra su sesión.</span></span>
            </label>
          )}
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <div className="row">
            <button type="button" className="btn" onClick={() => { setForm(null); setError(null); }}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </div></main>
    );
  }

  return (
    <main className="wrap stack" style={{ paddingTop: 0 }}>
      {aviso && <div className="alert alert-ok">{aviso}</div>}
      {[...ORDEN_ROLES.map((r) => ({ titulo: ROL_NOMBRE[r], lista: usuarios.filter((u) => u.activo && u.rol === r) })), { titulo: "Inactivos", lista: usuarios.filter((u) => !u.activo) }]
        .filter((g) => g.lista.length > 0)
        .map((g) => (
          <section key={g.titulo} className="card lista-usuarios">
            <header className="row between lista-usuarios-titulo">
              <strong>{g.titulo}</strong>
              <span className="small muted">{g.lista.length}</span>
            </header>
            <div className="lista-usuarios-cols small muted" aria-hidden>
              <span>Nombre</span><span>Usuario</span><span>Contacto en Odoo</span><span>Permisos quitados</span>
            </div>
            {[...g.lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((u) => (
              <button key={u.id} type="button" className="lista-usuarios-fila" data-inactivo={!u.activo || undefined} onClick={() => editar(u)}>
                <strong>{u.nombre}{!u.activo && <span className="tiny muted"> · {ROL_NOMBRE[u.rol]}</span>}</strong>
                <span className="small muted">{u.usuario}</span>
                <span className="small muted">{contactoNombre(u) ?? "Sin contacto"}</span>
                <span className="small" style={{ color: "var(--warn)" }}>
                  {u.rol !== "admin" && (u.permisosOff?.length ?? 0) > 0 ? `Sin: ${resumenPermisosOff(u.permisosOff).join(", ")}` : ""}
                </span>
              </button>
            ))}
          </section>
        ))}
      <div className="bottom-bar">
        <div className="accion-corta">
          <button className="btn btn-primary btn-block btn-lg" onClick={() => { setAviso(null); setError(null); setForm({ ...VACIO }); }}>
            Nuevo usuario
          </button>
        </div>
      </div>
    </main>
  );
}

// Un módulo con su interruptor y, adentro, sus permisos. Apagar el módulo conserva lo tildado
// adentro, así al volver a prenderlo queda como estaba.
function PermisosModulo({ modulo, rol, off, onChange }: { modulo: Modulo; rol: Rol; off: string[]; onChange: (off: string[]) => void }) {
  const clave = claveModulo(modulo);
  const prendido = !off.includes(clave);
  const permisos = permisosDelRol(rol).filter((p) => PERMISOS[p].modulo === modulo);
  const alternar = (k: string, on: boolean) => onChange(on ? off.filter((x) => x !== k) : [...off, k]);
  return (
    <section className="card stack modulo-permisos" style={{ gap: 10 }} data-apagado={!prendido || undefined}>
      <label className="row between" style={{ gap: 10, cursor: "pointer" }}>
        <span><strong>{MODULOS[modulo].nombre}</strong><br /><span className="small muted">{MODULOS[modulo].detalle}</span></span>
        <input type="checkbox" role="switch" className="interruptor" aria-label={`Módulo ${MODULOS[modulo].nombre}`} checked={prendido} onChange={(e) => alternar(clave, e.target.checked)} />
      </label>
      {prendido ? (
        <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          {permisos.map((p) => (
            <label key={p} className="row" style={{ alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                style={{ width: 22, height: 22, flex: "none", accentColor: "var(--accent)" }}
                checked={!off.includes(p)}
                onChange={(e) => alternar(p, e.target.checked)}
              />
              <span><strong>{PERMISOS[p].nombre}</strong><br /><span className="small muted">{PERMISOS[p].detalle}</span></span>
            </label>
          ))}
        </div>
      ) : (
        <span className="small muted">Sin acceso a {MODULOS[modulo].nombre}: no lo ve en el menú.</span>
      )}
    </section>
  );
}
