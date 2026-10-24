import type { Rol } from "./db/schema";

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
  "usuarios.gestionar": ["admin"],
  "log.ver": ["admin"],
  "config.editar": ["admin"],
} as const satisfies Record<string, readonly Rol[]>;

export type Accion = keyof typeof ACCIONES;

export function puede(rol: Rol, accion: Accion): boolean {
  return (ACCIONES[accion] as readonly Rol[]).includes(rol);
}

export const DURACION_SESION_DIAS: Record<Rol, number> = {
  mecanico: 30,
  jefe: 14,
  admin: 1,
};
