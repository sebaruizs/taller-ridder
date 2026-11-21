// Sin ACCESO_AVISOS_SECRET en el entorno, asignar una tarea no llama a nadie (así se puede desplegar antes que Acceso).
import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taller-avisos-off-"));
Object.assign(process.env, { DATABASE_URL: `pglite://${dir}`, SESSION_SECRET: "x".repeat(40), ODOO_URL: "http://odoo.invalid", ODOO_DB: "prueba", ODOO_USER: "api", ODOO_API_KEY: "clave", ACCESO_URL: "https://acceso.invalid", ACCESO_AVISOS_SECRET: "" });

import { getDb, schema } from "@/lib/db";
import { avisarTareaAsignada, avisoTareaAsignada, enviarAviso } from "@/lib/avisos";

afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("avisos apagados", () => {
  it("no llama a Acceso", async () => {
    const llamada = vi.fn();
    vi.stubGlobal("fetch", llamada);
    const db = await getDb();
    await db.insert(schema.usuarios).values({ usuario: "diego.m", nombre: "Diego", rol: "mecanico", passwordHash: "x", odooPartnerId: 2009 });
    await avisarTareaAsignada(4366, 2009, 0);
    expect(await enviarAviso(avisoTareaAsignada(4366, "diego.m"))).toBe("apagado");
    expect(llamada).not.toHaveBeenCalled();
  }, 30_000);
});
