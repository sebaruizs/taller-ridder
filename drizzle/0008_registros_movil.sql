CREATE TABLE "registros_movil" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"creado" timestamp with time zone NOT NULL,
	"recibido" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" text NOT NULL,
	"motivo" text,
	"orden_id" integer,
	"vehiculo_id" integer,
	"datos" jsonb NOT NULL,
	"progreso" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"terminado" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "registros_movil" ADD CONSTRAINT "registros_movil_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registros_movil_orden_idx" ON "registros_movil" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "registros_movil_recibido_idx" ON "registros_movil" USING btree ("recibido");