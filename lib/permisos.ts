import type { Rol } from "./db/schema";

// Qué puede hacer cada rol por defecto.
export const ACCIONES = {
  "ordenes.ver_en_proceso": ["mecanico", "jefe", "admin"],
  "ordenes.ver_detalle": ["mecanico", "jefe", "admin"],
  "ordenes.finalizar": ["mecanico", "jefe", "admin"],
  "ordenes.ver_todas": ["jefe", "admin"],
  "ordenes.crear": ["jefe", "admin"],
  "ordenes.editar": ["jefe", "admin"],
  "ordenes.mover_estado": ["jefe", "admin"],
  "ordenes.aprobar": ["jefe", "admin"],
  "finalizaciones.ver_ajenas": ["jefe", "admin"],
  "vehiculos.buscar": ["jefe", "admin"],
  "vehiculos.historial": ["jefe", "admin"],
  "reportes.ver": ["jefe", "admin"],
  "solicitudes.crear": ["mecanico", "jefe", "admin"],
  "solicitudes.aprobar": ["jefe", "admin"],
  "inventario.ver": ["jefe", "admin"],
  "inventario.crear": ["jefe", "admin"],
  "inventario.editar_precio": ["jefe", "admin"],
  "compras.ver": ["jefe", "admin"],
  "compras.crear": ["jefe", "admin"],
  "usuarios.gestionar": ["admin"],
  "log.ver": ["admin"],
  "config.editar": ["admin"],
} as const satisfies Record<string, readonly Rol[]>;

export type Accion = keyof typeof ACCIONES;

// Módulos: el admin puede apagar uno entero a un usuario; adentro se ajusta cada permiso.
export const MODULOS = {
  taller: { nombre: "Taller", detalle: "Órdenes, tablero, verificación y motos" },
  inventario: { nombre: "Inventario", detalle: "Productos, stock, costos y precios" },
  compras: { nombre: "Compras", detalle: "Compras a proveedores y recepción de mercadería" },
} as const;

export type Modulo = keyof typeof MODULOS;
export const LISTA_MODULOS = Object.keys(MODULOS) as Modulo[];

// En permisosOff un módulo apagado se guarda como "modulo.<id>".
export const claveModulo = (m: Modulo) => `modulo.${m}` as const;

// A qué módulo pertenece cada acción (las de administración no son de ningún módulo).
export function moduloDeAccion(a: Accion): Modulo | null {
  if (a.startsWith("ordenes.") || a.startsWith("finalizaciones.") || a.startsWith("vehiculos.") || a.startsWith("reportes.") || a.startsWith("solicitudes.")) return "taller";
  if (a.startsWith("inventario.")) return "inventario";
  if (a.startsWith("compras.")) return "compras";
  return null;
}

// Permisos que el admin puede quitarle a un usuario puntual. Cada uno agrupa acciones internas.
export const PERMISOS = {
  ver_ordenes: { modulo: "taller", nombre: "Ver motos en proceso", detalle: "Lista de órdenes en proceso y su detalle", acciones: ["ordenes.ver_en_proceso", "ordenes.ver_detalle"] },
  finalizar: { modulo: "taller", nombre: "Finalizar trabajos", detalle: "Cargar odómetro, fotos y observación y cerrar el trabajo", acciones: ["ordenes.finalizar"] },
  solicitar: { modulo: "taller", nombre: "Solicitar trabajos", detalle: "Reportar un trabajo que no está en la lista; el jefe lo aprueba", acciones: ["solicitudes.crear"] },
  crear: { modulo: "taller", nombre: "Cargar órdenes nuevas", detalle: "Buscar la moto y crear la orden", acciones: ["ordenes.crear", "vehiculos.buscar"] },
  tablero: { modulo: "taller", nombre: "Tablero", detalle: "Ver el kanban y pasar órdenes de Nuevo a En proceso", acciones: ["ordenes.ver_todas", "ordenes.mover_estado"] },
  repuestos: { modulo: "taller", nombre: "Cargar repuestos", detalle: "Agregar y quitar repuestos al verificar", acciones: ["ordenes.editar"] },
  reportes: { modulo: "taller", nombre: "Reportes de mecánicos", detalle: "Lista de todos los trabajos reportados, con fotos y observación", acciones: ["reportes.ver"] },
  aprobar_solicitudes: { modulo: "taller", nombre: "Aprobar solicitudes", detalle: "Aprobar o rechazar los trabajos que solicitan los mecánicos", acciones: ["solicitudes.aprobar"] },
  aprobar: { modulo: "taller", nombre: "Aprobar verificación", detalle: "Cerrar la orden: pasa a Finalizado", acciones: ["ordenes.aprobar"] },
  inventario: { modulo: "inventario", nombre: "Ver productos", detalle: "Productos, stock, costos, precios y sus compras", acciones: ["inventario.ver"] },
  crear_productos: { modulo: "inventario", nombre: "Crear productos", detalle: "Dar de alta productos nuevos en Odoo", acciones: ["inventario.crear"] },
  editar_precios: { modulo: "inventario", nombre: "Editar precios", detalle: "Cambiar el precio de venta de los productos en Odoo", acciones: ["inventario.editar_precio"] },
  compras: { modulo: "compras", nombre: "Ver compras", detalle: "Lista y detalle de las compras a proveedores", acciones: ["compras.ver"] },
  cargar_compras: { modulo: "compras", nombre: "Cargar compras", detalle: "Crear compras en Odoo y recibir la mercadería (entra al stock)", acciones: ["compras.crear"] },
} as const satisfies Record<string, { modulo: Modulo; nombre: string; detalle: string; acciones: readonly Accion[] }>;

export type Permiso = keyof typeof PERMISOS;
export const LISTA_PERMISOS = Object.keys(PERMISOS) as Permiso[];

export type Sujeto = { rol: Rol; permisosOff?: readonly string[] | null };

export function puede(rol: Rol, accion: Accion): boolean {
  return (ACCIONES[accion] as readonly Rol[]).includes(rol);
}

// El admin siempre puede todo: así nunca queda nadie afuera de la administración.
export function puedeU(u: Sujeto, accion: Accion): boolean {
  if (!puede(u.rol, accion)) return false;
  if (u.rol === "admin" || !u.permisosOff?.length) return true;
  const modulo = moduloDeAccion(accion);
  if (modulo && u.permisosOff.includes(claveModulo(modulo))) return false;
  return !u.permisosOff.some((p) => (PERMISOS[p as Permiso]?.acciones as readonly Accion[] | undefined)?.includes(accion));
}

export function puedeAlguna(u: Sujeto, acciones: readonly Accion[]): boolean {
  return acciones.some((a) => puedeU(u, a));
}

// Permisos que tiene sentido mostrar para un rol (los que ese rol tiene por defecto).
export function permisosDelRol(rol: Rol): Permiso[] {
  if (rol === "admin") return [];
  return LISTA_PERMISOS.filter((p) => (PERMISOS[p].acciones as readonly Accion[]).every((a) => puede(rol, a)));
}

// Módulos que tiene sentido mostrar para un rol: los que tienen algún permiso para ese rol.
export function modulosDelRol(rol: Rol): Modulo[] {
  const permisos = permisosDelRol(rol);
  return LISTA_MODULOS.filter((m) => permisos.some((p) => PERMISOS[p].modulo === m));
}

export function limpiarPermisosOff(rol: Rol, off: readonly string[]): string[] {
  const validos = new Set<string>([...permisosDelRol(rol), ...modulosDelRol(rol).map(claveModulo)]);
  return [...new Set(off)].filter((p) => validos.has(p));
}

// Texto corto de lo que tiene apagado un usuario, para la lista de Usuarios.
export function resumenPermisosOff(off: readonly string[]): string[] {
  const modulosOff = new Set(LISTA_MODULOS.filter((m) => off.includes(claveModulo(m))));
  const res = [...modulosOff].map((m) => `módulo ${MODULOS[m].nombre}`);
  for (const p of off) {
    const permiso = PERMISOS[p as Permiso];
    if (permiso && !modulosOff.has(permiso.modulo)) res.push(permiso.nombre);
  }
  return res;
}

// Pantallas según permisos: alimenta el menú y la pantalla de inicio.
export const SECCIONES = ["Taller", "Inventario", "Compras"] as const;
// "Configuración" no va en el menú principal: se abre con el engranaje junto al nombre.
export type Seccion = (typeof SECCIONES)[number] | "Configuración";

export const PANTALLAS = [
  { href: "/ordenes/nueva", nombre: "Nueva orden", seccion: "Taller", acciones: ["ordenes.crear"], alta: true },
  { href: "/tablero", nombre: "Tablero", seccion: "Taller", acciones: ["ordenes.ver_todas"] },
  { href: "/ordenes", nombre: "Motos en proceso", seccion: "Taller", acciones: ["ordenes.ver_en_proceso"] },
  { href: "/verificar", nombre: "Para verificar", seccion: "Taller", acciones: ["ordenes.aprobar", "ordenes.editar"] },
  { href: "/reportes", nombre: "Reportes", seccion: "Taller", acciones: ["reportes.ver"] },
  { href: "/solicitudes/nueva", nombre: "Solicitar trabajo", seccion: "Taller", acciones: ["solicitudes.crear"], alta: true },
  { href: "/solicitudes", nombre: "Solicitudes", seccion: "Taller", acciones: ["solicitudes.crear", "solicitudes.aprobar"] },
  { href: "/admin/usuarios", nombre: "Usuarios", seccion: "Configuración", acciones: ["usuarios.gestionar"] },
  { href: "/inventario/nuevo", nombre: "Nuevo producto", seccion: "Inventario", acciones: ["inventario.crear"], alta: true },
  { href: "/inventario", nombre: "Productos", seccion: "Inventario", acciones: ["inventario.ver"] },
  { href: "/compras/nueva", nombre: "Nueva compra", seccion: "Compras", acciones: ["compras.crear"], alta: true },
  { href: "/compras", nombre: "Compras", seccion: "Compras", acciones: ["compras.ver"] },
] as const satisfies readonly { href: string; nombre: string; seccion: Seccion; acciones: readonly Accion[]; alta?: boolean }[];

// alta: pantalla de "nuevo"; en el menú no aparece, se entra con el botón de cada módulo.
export type Pantalla = { href: string; nombre: string; seccion: Seccion; alta: boolean };

export function pantallasDe(u: Sujeto): Pantalla[] {
  return PANTALLAS.filter((p) => puedeAlguna(u, p.acciones)).map((p) => ({ href: p.href, nombre: p.nombre, seccion: p.seccion, alta: "alta" in p }));
}

// Primera pantalla útil para el usuario; "/cuenta" siempre está, así nunca hay bucles de redirección.
export function inicioDe(u: Sujeto): string {
  const orden = ["/ordenes", "/tablero", "/verificar", "/ordenes/nueva", "/reportes", "/inventario", "/compras", "/admin/usuarios"];
  const mias = new Set(pantallasDe(u).map((p) => p.href as string));
  return orden.find((h) => mias.has(h)) ?? "/cuenta";
}

export const DURACION_SESION_DIAS: Record<Rol, number> = {
  mecanico: 30,
  jefe: 14,
  admin: 1,
};

// Lo que va en el menú: sin las pantallas de alta, salvo que sea lo único del módulo
// (por ejemplo, alguien que solo puede cargar órdenes y no ver listas).
export function menuDe(pantallas: readonly Pantalla[]): Pantalla[] {
  return pantallas.filter((p) => !p.alta || !pantallas.some((o) => o.seccion === p.seccion && !o.alta));
}
