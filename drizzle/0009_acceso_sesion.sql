ALTER TABLE "sesiones" ADD COLUMN "acceso_sesion" text;--> statement-breakpoint
CREATE INDEX "sesiones_acceso_idx" ON "sesiones" USING btree ("acceso_sesion");