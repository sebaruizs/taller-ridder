import type { Rol } from "./db/schema";

// Qué puede hacer cada rol por defecto.
// «revisor» tiene las mismas que el jefe para poder VER todo (varias pantallas de solo ver están detrás de un permiso
// de escribir), pero el servidor le rechaza cualquier escritura: lib/solo-lectura.ts. No tiene las dos que no abren
// ninguna pantalla y actúan fuera de Taller: eliminar órdenes y bloquear el encendido.
export const ACCIONES = {
  "ordenes.ver_en_proceso": ["mecanico", "jefe", "revisor", "admin"],
  "ordenes.ver_detalle": ["mecanico", "jefe", "revisor", "admin"],
  "ordenes.finalizar": ["mecanico", "jefe", "revisor", "admin"],
  "ordenes.ver_todas": ["jefe", "revisor", "cobrador", "admin"],
  "ordenes.crear": ["jefe", "revisor", "cobrador", "admin"],
  "ordenes.editar": ["jefe", "revisor", "admin"],
  "ordenes.mover_estado": ["jefe", "revisor", "admin"],
  "ordenes.aprobar": ["jefe", "revisor", "admin"],
  // Borrar la orden en Odoo (con sus repuestos). Las finalizadas no se borran.
  "ordenes.eliminar": ["jefe", "admin"],
  "finalizaciones.ver_ajenas": ["jefe", "revisor", "admin"],
  "vehiculos.buscar": ["jefe", "revisor", "cobrador", "admin"],
  "vehiculos.historial": ["jefe", "revisor", "admin"],
  "reportes.ver": ["jefe", "revisor", "admin"],
  "reportes.cambiar_mecanico": ["jefe", "revisor", "admin"],
  // Ver el estado de los GPS (Traccar) y la moneda de cada moto.
  "gps.ver": ["mecanico", "jefe", "revisor", "cobrador", "admin"],
  // Bloquear o desbloquear el encendido de la moto por GPS (Traccar).
  "gps.encendido": ["jefe", "admin"],
  // Devoluciones y recuperos: la moto que vuelve a la casa matriz, con fotos y observación.
  "devoluciones.ver": ["jefe", "revisor", "admin"],
  "devoluciones.registrar": ["jefe", "revisor", "admin"],
  "devoluciones.borrar": ["admin"],
  "inventario.ver": ["jefe", "revisor", "admin"],
  "inventario.crear": ["jefe", "revisor", "admin"],
  "inventario.editar_precio": ["jefe", "revisor", "admin"],
  "inventario.editar_nombre": ["jefe", "revisor", "admin"],
  "compras.ver": ["jefe", "revisor", "admin"],
  "compras.crear": ["jefe", "revisor", "admin"],
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
  if (a.startsWith("ordenes.") || a.startsWith("finalizaciones.") || a.startsWith("vehiculos.") || a.startsWith("reportes.") || a.startsWith("gps.") || a.startsWith("devoluciones.")) return "taller";
  if (a.startsWith("inventario.")) return "inventario";
  if (a.startsWith("compras.")) return "compras";
  return null;
}

// Permisos que el admin puede quitarle a un usuario puntual. Cada uno agrupa acciones internas.
export const PERMISOS = {
  ver_ordenes: { modulo: "taller", nombre: "Ver motos en proceso", detalle: "Lista de órdenes en proceso y su detalle", acciones: ["ordenes.ver_en_proceso", "ordenes.ver_detalle"] },
  finalizar: { modulo: "taller", nombre: "Finalizar trabajos", detalle: "Cargar odómetro, fotos y observación y cerrar el trabajo", acciones: ["ordenes.finalizar"] },
  crear: { modulo: "taller", nombre: "Cargar órdenes nuevas", detalle: "Buscar la moto y crear la orden", acciones: ["ordenes.crear", "vehiculos.buscar"] },
  tablero: { modulo: "taller", nombre: "Tablero", detalle: "Ver el kanban y el detalle de cualquier orden", acciones: ["ordenes.ver_todas"] },
  mover_tablero: { modulo: "taller", nombre: "Mover en el tablero", detalle: "Pasar órdenes de Nuevo a En proceso", acciones: ["ordenes.mover_estado"] },
  repuestos: { modulo: "taller", nombre: "Cargar repuestos", detalle: "Agregar y quitar repuestos al verificar", acciones: ["ordenes.editar"] },
  reportes: { modulo: "taller", nombre: "Reportes de mecánicos", detalle: "Lista de todos los trabajos reportados, con fotos y observación", acciones: ["reportes.ver"] },
  cambiar_mecanico: { modulo: "taller", nombre: "Cambiar el mecánico", detalle: "Corregir en Reportes qué mecánico hizo el trabajo (queda en el historial)", acciones: ["reportes.cambiar_mecanico"] },
  aprobar: { modulo: "taller", nombre: "Aprobar verificación", detalle: "Cerrar la orden: pasa a Finalizado", acciones: ["ordenes.aprobar"] },
  eliminar: { modulo: "taller", nombre: "Eliminar órdenes", detalle: "Borrar órdenes de Odoo, salvo las finalizadas", acciones: ["ordenes.eliminar"] },
  gps: { modulo: "taller", nombre: "Ver GPS", detalle: "Estado de los GPS y la moneda de cada moto en las tarjetas", acciones: ["gps.ver"] },
  encendido: { modulo: "taller", nombre: "Bloquear el encendido", detalle: "Bloquear o desbloquear el encendido de la moto por GPS", acciones: ["gps.encendido"] },
  devoluciones: { modulo: "taller", nombre: "Ver devoluciones y recuperos", detalle: "Lista de las motos devueltas o recuperadas, con sus fotos", acciones: ["devoluciones.ver"] },
  registrar_devoluciones: { modulo: "taller", nombre: "Registrar devoluciones y recuperos", detalle: "Cargar la recepción de una moto con fotos y observación", acciones: ["devoluciones.registrar"] },
  inventario: { modulo: "inventario", nombre: "Ver productos", detalle: "Productos, stock, costos, precios y sus compras", acciones: ["inventario.ver"] },
  crear_productos: { modulo: "inventario", nombre: "Crear productos", detalle: "Dar de alta productos nuevos en Odoo", acciones: ["inventario.crear"] },
  editar_precios: { modulo: "inventario", nombre: "Editar precios", detalle: "Cambiar el precio de venta de los productos en Odoo", acciones: ["inventario.editar_precio"] },
  editar_nombres: { modulo: "inventario", nombre: "Editar nombres", detalle: "Cambiar el nombre de los productos en Odoo (queda en el registro de cambios)", acciones: ["inventario.editar_nombre"] },
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
  { href: "/devoluciones", nombre: "Devoluciones", seccion: "Taller", acciones: ["devoluciones.ver"] },
  { href: "/admin/usuarios", nombre: "Usuarios", seccion: "Configuración", acciones: ["usuarios.gestionar"] },
  { href: "/admin/ajustes", nombre: "Ajustes", seccion: "Configuración", acciones: ["config.editar"] },
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
  cobrador: 14,
  revisor: 14,
  admin: 1,
};

// Con ACCESO_SOLO, la sesión que se abre desde Ridder Acceso dura lo mismo que la de Acceso: 14 días para todos los
// roles, también admin (CONTRATO.md de Acceso, 5.1). El login propio de emergencia sigue con DURACION_SESION_DIAS.
export const DURACION_SESION_ACCESO_DIAS = 14;

// Lo que va en el menú: sin las pantallas de alta, salvo que sea lo único del módulo
// (por ejemplo, alguien que solo puede cargar órdenes y no ver listas).
export function menuDe(pantallas: readonly Pantalla[]): Pantalla[] {
  return pantallas.filter((p) => !p.alta || !pantallas.some((o) => o.seccion === p.seccion && !o.alta));
}
