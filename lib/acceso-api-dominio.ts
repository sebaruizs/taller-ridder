import { z } from "zod";
import { ROLES, type Rol } from "./db/schema";

// API con la que Ridder Acceso (app.ridder.com.py, «Personas y permisos») da de alta, actualiza y da de baja usuarios:
//   PUT /api/acceso/usuarios/<usuario>   crea o actualiza (idempotente)
//   GET /api/acceso/usuarios/<usuario>   estado
// Lo que no está en este esquema (contraseña, permisos apagados, tema) no se puede cambiar por acá.
export const usuarioAccesoSchema = z.object({
  nombre: z.string({ error: "Falta el nombre" }).trim().min(2, "Falta el nombre").max(80, "El nombre es demasiado largo"),
  rol: z.enum(ROLES, { error: "Rol inválido: tiene que ser admin, jefe, mecanico o cobrador" }),
  activo: z.boolean({ error: "Falta activo (true o false)" }),
  // null o ausente = no viene: el contacto que tenga el usuario no se toca.
  odooPartnerId: z.number({ error: "odooPartnerId tiene que ser un número" }).int().positive().nullish(),
  // Los manda Acceso para los tres módulos; Taller no los guarda.
  documento: z.string().max(40).nullish(),
  telefono: z.string().max(40).nullish(),
});

export type DatosAcceso = z.infer<typeof usuarioAccesoSchema>;
export type ActualAcceso = { nombre: string; rol: Rol; activo: boolean; odooPartnerId: number | null };
export type CambiosAcceso = { nombre?: string; rol?: Rol; activo?: boolean; odooPartnerId?: number };

// Qué cambia en un usuario que ya existe: solo nombre, rol, activo y el contacto si viene. Vacío = no hay nada que guardar.
export function cambiosDe(actual: ActualAcceso, datos: DatosAcceso): CambiosAcceso {
  const c: CambiosAcceso = {};
  if (datos.nombre !== actual.nombre) c.nombre = datos.nombre;
  if (datos.rol !== actual.rol) c.rol = datos.rol;
  if (datos.activo !== actual.activo) c.activo = datos.activo;
  if (datos.odooPartnerId && datos.odooPartnerId !== actual.odooPartnerId) c.odooPartnerId = datos.odooPartnerId;
  return c;
}

// Un mecánico sin contacto de Odoo no puede recibir órdenes: es la misma regla de la pantalla Usuarios.
export function faltaContactoMecanico(rol: Rol, contactoFinal: number | null | undefined): boolean {
  return rol === "mecanico" && !contactoFinal;
}

// Desactivar o cambiar el rol cierra las sesiones, igual que desde la pantalla Usuarios.
export function cierraSesiones(c: CambiosAcceso): boolean {
  return c.activo === false || c.rol !== undefined;
}

// La baja o el cambio de rol que dejaría a Taller sin ningún admin activo no se hace.
export function dejaSinAdmin(actual: ActualAcceso, datos: DatosAcceso, otrosAdminsActivos: number): boolean {
  const eraAdmin = actual.rol === "admin" && actual.activo;
  const sigueAdmin = datos.rol === "admin" && datos.activo;
  return eraAdmin && !sigueAdmin && otrosAdminsActivos === 0;
}
