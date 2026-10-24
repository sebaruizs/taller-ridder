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
  "inventario.ver": ["jefe", "admin"],
  "inventario.crear": ["jefe", "admin"],
  "inventario.editar_precio": ["jefe", "admin"],
  "usuarios.gestionar": ["admin"],
  "log.ver": ["admin"],
  "config.editar": ["admin"],
} as const satisfies Record<string, readonly Rol[]>;

export type Accion = keyof typeof ACCIONES;

// Permisos que el admin puede quitarle a un usuario puntual. Cada uno agrupa acciones internas.
export const PERMISOS = {
  ver_ordenes: { nombre: "Ver motos en proceso", detalle: "Lista de órdenes en proceso y su detalle", acciones: ["ordenes.ver_en_proceso", "ordenes.ver_detalle"] },
  finalizar: { nombre: "Finalizar trabajos", detalle: "Cargar odómetro, fotos y observación y cerrar el trabajo", acciones: ["ordenes.finalizar"] },
  crear: { nombre: "Cargar órdenes nuevas", detalle: "Buscar la moto y crear la orden", acciones: ["ordenes.crear", "vehiculos.buscar"] },
  tablero: { nombre: "Tablero", detalle: "Ver el kanban y pasar órdenes de Nuevo a En proceso", acciones: ["ordenes.ver_todas", "ordenes.mover_estado"] },
  repuestos: { nombre: "Cargar repuestos", detalle: "Agregar y quitar repuestos al verificar", acciones: ["ordenes.editar"] },
  aprobar: { nombre: "Aprobar verificación", detalle: "Cerrar la orden: pasa a Finalizado", acciones: ["ordenes.aprobar"] },
  inventario: { nombre: "Inventario", detalle: "Ver productos, stock, costos, precios y compras", acciones: ["inventario.ver"] },
  crear_productos: { nombre: "Crear productos", detalle: "Dar de alta productos nuevos en Odoo", acciones: ["inventario.crear"] },
  editar_precios: { nombre: "Editar precios", detalle: "Cambiar el precio de venta de los productos en Odoo", acciones: ["inventario.editar_precio"] },
} as const satisfies Record<string, { nombre: string; detalle: string; acciones: readonly Accion[] }>;

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

export function limpiarPermisosOff(rol: Rol, off: readonly string[]): Permiso[] {
  const validos = new Set(permisosDelRol(rol));
  return [...new Set(off)].filter((p): p is Permiso => validos.has(p as Permiso));
}

// Pantallas según permisos: alimenta el menú y la pantalla de inicio.
export const SECCIONES = ["Taller", "Inventario", "Compras"] as const;
export type Seccion = (typeof SECCIONES)[number];

export const PANTALLAS = [
  { href: "/ordenes/nueva", nombre: "+ Nueva orden", seccion: "Taller", acciones: ["ordenes.crear"] },
  { href: "/tablero", nombre: "Tablero", seccion: "Taller", acciones: ["ordenes.ver_todas"] },
  { href: "/ordenes", nombre: "Motos en proceso", seccion: "Taller", acciones: ["ordenes.ver_en_proceso"] },
  { href: "/verificar", nombre: "Para verificar", seccion: "Taller", acciones: ["ordenes.aprobar", "ordenes.editar"] },
  { href: "/admin/usuarios", nombre: "Usuarios", seccion: "Taller", acciones: ["usuarios.gestionar"] },
  { href: "/inventario/nuevo", nombre: "+ Nuevo producto", seccion: "Inventario", acciones: ["inventario.crear"] },
  { href: "/inventario", nombre: "Productos", seccion: "Inventario", acciones: ["inventario.ver"] },
] as const satisfies readonly { href: string; nombre: string; seccion: Seccion; acciones: readonly Accion[] }[];

export type Pantalla = { href: string; nombre: string; seccion: Seccion };

export function pantallasDe(u: Sujeto): Pantalla[] {
  return PANTALLAS.filter((p) => puedeAlguna(u, p.acciones)).map(({ href, nombre, seccion }) => ({ href, nombre, seccion }));
}

// Primera pantalla útil para el usuario; "/cuenta" siempre está, así nunca hay bucles de redirección.
export function inicioDe(u: Sujeto): string {
  const orden = ["/ordenes", "/tablero", "/verificar", "/ordenes/nueva", "/inventario", "/admin/usuarios"];
  const mias = new Set(pantallasDe(u).map((p) => p.href as string));
  return orden.find((h) => mias.has(h)) ?? "/cuenta";
}

export const DURACION_SESION_DIAS: Record<Rol, number> = {
  mecanico: 30,
  jefe: 14,
  admin: 1,
};
