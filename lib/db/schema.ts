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

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const ROLES = ["mecanico", "jefe", "admin"] as const;
export type Rol = (typeof ROLES)[number];

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
  },
  (t) => [index("sesiones_usuario_idx").on(t.usuarioId)],
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
