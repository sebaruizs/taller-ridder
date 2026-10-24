-- Se pasa de PIN a usuario y contraseña: los usuarios con PIN se descartan (la app no estaba en uso).
DELETE FROM "sesiones";--> statement-breakpoint
DELETE FROM "finalizacion_fotos";--> statement-breakpoint
DELETE FROM "finalizaciones";--> statement-breakpoint
DELETE FROM "log_acciones";--> statement-breakpoint
DELETE FROM "usuarios";--> statement-breakpoint
ALTER TABLE "usuarios" DROP COLUMN "pin_hash";
