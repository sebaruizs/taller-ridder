CREATE TABLE "solicitud_fotos" (
	"id" serial PRIMARY KEY NOT NULL,
	"solicitud_id" integer NOT NULL,
	"orden" integer NOT NULL,
	"nombre" text NOT NULL,
	"mimetype" text NOT NULL,
	"datos" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitudes" (
	"id" serial PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"usuario_id" integer NOT NULL,
	"vehiculo_id" integer NOT NULL,
	"chapa" text NOT NULL,
	"vehiculo" text NOT NULL,
	"tipo_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"odometro" real NOT NULL,
	"observacion" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"orden_id" integer,
	"reportada" boolean DEFAULT false NOT NULL,
	"error" text,
	"motivo" text,
	"resuelto_por" integer,
	"resuelto_nombre" text,
	"resuelto" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solicitud_fotos" ADD CONSTRAINT "solicitud_fotos_solicitud_id_solicitudes_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "solicitudes_clave_idx" ON "solicitudes" USING btree ("clave");--> statement-breakpoint
CREATE INDEX "solicitudes_estado_idx" ON "solicitudes" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "solicitudes_usuario_idx" ON "solicitudes" USING btree ("usuario_id");