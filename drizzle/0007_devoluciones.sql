CREATE TABLE "devolucion_fotos" (
	"id" serial PRIMARY KEY NOT NULL,
	"devolucion_id" integer NOT NULL,
	"orden" integer NOT NULL,
	"mimetype" text NOT NULL,
	"datos" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devoluciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"vehiculo_id" integer NOT NULL,
	"chapa" text NOT NULL,
	"vehiculo" text DEFAULT '' NOT NULL,
	"chofer" text,
	"observacion" text NOT NULL,
	"fecha" text NOT NULL,
	"usuario_id" integer,
	"usuario_nombre" text NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devolucion_fotos" ADD CONSTRAINT "devolucion_fotos_devolucion_id_devoluciones_id_fk" FOREIGN KEY ("devolucion_id") REFERENCES "public"."devoluciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devolucion_fotos_devolucion_idx" ON "devolucion_fotos" USING btree ("devolucion_id");--> statement-breakpoint
CREATE INDEX "devoluciones_vehiculo_idx" ON "devoluciones" USING btree ("vehiculo_id");--> statement-breakpoint
CREATE INDEX "devoluciones_fecha_idx" ON "devoluciones" USING btree ("fecha");