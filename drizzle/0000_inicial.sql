CREATE TABLE "config" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finalizacion_fotos" (
	"id" serial PRIMARY KEY NOT NULL,
	"finalizacion_id" integer NOT NULL,
	"orden" integer NOT NULL,
	"nombre" text NOT NULL,
	"mimetype" text NOT NULL,
	"datos" "bytea" NOT NULL,
	"attachment_id" integer
);
--> statement-breakpoint
CREATE TABLE "finalizaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"orden_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"odometro" real NOT NULL,
	"observacion" text DEFAULT '' NOT NULL,
	"lista_entrega" boolean NOT NULL,
	"campos_ok" boolean DEFAULT false NOT NULL,
	"fotos_ok" boolean DEFAULT false NOT NULL,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nota_ok" boolean DEFAULT false NOT NULL,
	"estado_ok" boolean DEFAULT false NOT NULL,
	"telegram_ok" boolean DEFAULT false NOT NULL,
	"resumen" jsonb,
	"error" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	"terminado" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "log_acciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"accion" text NOT NULL,
	"orden_id" integer,
	"vehiculo_id" integer,
	"detalle" jsonb,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"expira" timestamp with time zone NOT NULL,
	"user_agent" text,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"rol" text NOT NULL,
	"pin_hash" text NOT NULL,
	"odoo_partner_id" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "finalizacion_fotos" ADD CONSTRAINT "finalizacion_fotos_finalizacion_id_finalizaciones_id_fk" FOREIGN KEY ("finalizacion_id") REFERENCES "public"."finalizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalizaciones" ADD CONSTRAINT "finalizaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_acciones" ADD CONSTRAINT "log_acciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finalizaciones_clave_idx" ON "finalizaciones" USING btree ("clave");--> statement-breakpoint
CREATE INDEX "finalizaciones_orden_idx" ON "finalizaciones" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "log_fecha_idx" ON "log_acciones" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" USING btree ("usuario_id");