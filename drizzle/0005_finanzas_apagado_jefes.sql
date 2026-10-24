-- Módulo Finanzas nuevo: a los jefes que ya existen les arranca apagado; el admin lo prende a quien corresponda.
UPDATE "usuarios" SET "permisos_off" = "permisos_off" || '["modulo.finanzas"]'::jsonb
WHERE "rol" = 'jefe' AND NOT ("permisos_off" @> '["modulo.finanzas"]'::jsonb);
