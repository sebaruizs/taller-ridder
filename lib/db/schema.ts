import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  customType,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { TIPOS_DEVOLUCION } from "../devoluciones-dominio";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const ROLES = ["mecanico", "jefe", "cobrador", "admin"] as const;
export type Rol = (typeof ROLES)[number];

// Tema de pantalla de cada usuario. "sistema" sigue al celular o la PC.
export const TEMAS = ["claro", "oscuro", "sistema"] as const;
export type Tema = (typeof TEMAS)[number];

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  usuario: text("usuario").notNull().unique(),
  nombre: text("nombre").notNull(),
  rol: text("rol", { enum: ROLES }).notNull(),
  passwordHash: text("password_hash").notNull(),
  odooPartnerId: integer("odoo_partner_id"),
  odooPartnerNombre: text("odoo_partner_nombre"),
  permisosOff: jsonb("permisos_off").$type<string[]>().notNull().default([]),
  activo: boolean("activo").notNull().default(true),
  tema: text("tema", { enum: TEMAS }).notNull().default("claro"),
  // "cobranzas": la cuenta la creó y la mantiene Cobranzas por la API; "acceso": la creó Ridder Acceso; null: se creó acá.
  origen: text("origen", { enum: ["cobranzas", "acceso"] }),
  intentosFallidos: integer("intentos_fallidos").notNull().default(0),
  bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
  creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
});

export const sesiones = pgTable(
  "sesiones",
  {
    id: text("id").primaryKey(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expira: timestamp("expira", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
    // Id público de la sesión de Ridder Acceso que abrió esta (`s`, 32 hex). Acceso la cierra al salir
    // (POST /api/acceso/sesiones/<s>/cerrar). Null en el login propio y en las entradas sin ACCESO_SOLO.
    accesoSesion: text("acceso_sesion"),
  },
  (t) => [index("sesiones_usuario_idx").on(t.usuarioId), index("sesiones_acceso_idx").on(t.accesoSesion)],
);

export const finalizaciones = pgTable(
  "finalizaciones",
  {
    id: serial("id").primaryKey(),
    clave: text("clave").notNull(),
    ordenId: integer("orden_id").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    odometro: real("odometro").notNull(),
    observacion: text("observacion").notNull().default(""),
    camposOk: boolean("campos_ok").notNull().default(false),
    fotosOk: boolean("fotos_ok").notNull().default(false),
    attachmentIds: jsonb("attachment_ids").$type<number[]>().notNull().default([]),
    notaOk: boolean("nota_ok").notNull().default(false),
    estadoOk: boolean("estado_ok").notNull().default(false),
    telegramOk: boolean("telegram_ok").notNull().default(false),
    resumen: jsonb("resumen").$type<Record<string, unknown>>(),
    error: text("error"),
    intentos: integer("intentos").notNull().default(0),
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
    terminado: timestamp("terminado", { withTimezone: true }),
  },
  (t) => [uniqueIndex("finalizaciones_clave_idx").on(t.clave), index("finalizaciones_orden_idx").on(t.ordenId)],
);

export const finalizacionFotos = pgTable("finalizacion_fotos", {
  id: serial("id").primaryKey(),
  finalizacionId: integer("finalizacion_id")
    .notNull()
    .references(() => finalizaciones.id, { onDelete: "cascade" }),
  orden: integer("orden").notNull(),
  nombre: text("nombre").notNull(),
  mimetype: text("mimetype").notNull(),
  datos: bytea("datos").notNull(),
  attachmentId: integer("attachment_id"),
});

export const logAcciones = pgTable(
  "log_acciones",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id").references(() => usuarios.id),
    accion: text("accion").notNull(),
    ordenId: integer("orden_id"),
    vehiculoId: integer("vehiculo_id"),
    detalle: jsonb("detalle").$type<Record<string, unknown>>(),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("log_fecha_idx").on(t.fecha)],
);

export const config = pgTable("config", {
  clave: text("clave").primaryKey(),
  valor: jsonb("valor").notNull(),
});

// Devoluciones y recuperos: la moto que vuelve a la casa matriz, quién la recibió, cómo llegó y sus fotos.
// Vive acá (no en Odoo); Cobranzas la lee por la API para el perfil del vehículo.

export const devoluciones = pgTable(
  "devoluciones",
  {
    id: serial("id").primaryKey(),
    tipo: text("tipo", { enum: TIPOS_DEVOLUCION }).notNull(),
    vehiculoId: integer("vehiculo_id").notNull(),
    chapa: text("chapa").notNull(),
    vehiculo: text("vehiculo").notNull().default(""),
    // Quién la tenía según Odoo al momento de recibirla.
    chofer: text("chofer"),
    observacion: text("observacion").notNull(),
    // Día de la recepción, en hora de Asunción (AAAA-MM-DD).
    fecha: text("fecha").notNull(),
    usuarioId: integer("usuario_id").references(() => usuarios.id),
    usuarioNombre: text("usuario_nombre").notNull(),
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("devoluciones_vehiculo_idx").on(t.vehiculoId), index("devoluciones_fecha_idx").on(t.fecha)],
);

export const devolucionFotos = pgTable(
  "devolucion_fotos",
  {
    id: serial("id").primaryKey(),
    devolucionId: integer("devolucion_id")
      .notNull()
      .references(() => devoluciones.id, { onDelete: "cascade" }),
    orden: integer("orden").notNull(),
    mimetype: text("mimetype").notNull(),
    datos: bytea("datos").notNull(),
  },
  (t) => [index("devolucion_fotos_devolucion_idx").on(t.devolucionId)],
);

// API móvil (Ridder App): cada registro que manda el teléfono, por el id que creó el teléfono. Un id repetido se
// contesta con el resultado guardado y no se vuelve a aplicar (ver lib/movil.ts y contratos/SINCRONIZACION.md).
// "aplicando": se aceptó pero falta terminar de escribirlo en Odoo; el reintento del teléfono sigue desde ahí.
export const ESTADOS_REGISTRO_MOVIL = ["aplicando", "aceptado", "rechazado"] as const;

export const registrosMovil = pgTable(
  "registros_movil",
  {
    id: text("id").primaryKey(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    tipo: text("tipo").notNull(),
    // Hora del teléfono: para mostrar y ordenar. La hora oficial es "recibido".
    creado: timestamp("creado", { withTimezone: true }).notNull(),
    recibido: timestamp("recibido", { withTimezone: true }).notNull().defaultNow(),
    estado: text("estado", { enum: ESTADOS_REGISTRO_MOVIL }).notNull(),
    motivo: text("motivo"),
    ordenId: integer("orden_id"),
    vehiculoId: integer("vehiculo_id"),
    // Lo que mandó el teléfono, sin las fotos.
    datos: jsonb("datos").$type<Record<string, unknown>>().notNull(),
    // Pasos ya hechos en Odoo (adjuntos creados, nota publicada…), para seguir sin duplicar.
    progreso: jsonb("progreso").$type<Record<string, unknown>>().notNull().default({}),
    terminado: timestamp("terminado", { withTimezone: true }),
  },
  (t) => [index("registros_movil_orden_idx").on(t.ordenId), index("registros_movil_recibido_idx").on(t.recibido)],
);
