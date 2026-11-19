ALTER TABLE "log_acciones" ADD COLUMN "objeto" text;--> statement-breakpoint
ALTER TABLE "log_acciones" ADD COLUMN "antes" jsonb;--> statement-breakpoint
ALTER TABLE "log_acciones" ADD COLUMN "despues" jsonb;--> statement-breakpoint
ALTER TABLE "log_acciones" ADD COLUMN "usuario_nombre" text;--> statement-breakpoint
CREATE INDEX "log_objeto_idx" ON "log_acciones" USING btree ("objeto");--> statement-breakpoint
-- Lo que ya estaba anotado de productos pasa a verse en el registro de cambios de cada producto.
UPDATE "log_acciones" SET "objeto" = 'producto:' || ("detalle"->>'productoId') WHERE "accion" IN ('producto.crear', 'producto.precio') AND "detalle"->>'productoId' IS NOT NULL;--> statement-breakpoint
UPDATE "log_acciones" SET "antes" = jsonb_build_object('Precio de venta', "detalle"->'anterior'), "despues" = jsonb_build_object('Precio de venta', "detalle"->'nuevo') WHERE "accion" = 'producto.precio' AND "detalle"->'anterior' IS NOT NULL AND "detalle"->'nuevo' IS NOT NULL;--> statement-breakpoint
UPDATE "log_acciones" SET "despues" = jsonb_build_object('Nombre', "detalle"->'nombre', 'Costo', "detalle"->'costo', 'Precio de venta', "detalle"->'precio') WHERE "accion" = 'producto.crear' AND "detalle"->'nombre' IS NOT NULL;--> statement-breakpoint
UPDATE "log_acciones" l SET "usuario_nombre" = u."nombre" FROM "usuarios" u WHERE l."usuario_id" = u."id" AND l."objeto" IS NOT NULL;
