ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_nombre_unique";--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "usuario" text NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "password_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "odoo_partner_nombre" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_usuario_unique" UNIQUE("usuario");