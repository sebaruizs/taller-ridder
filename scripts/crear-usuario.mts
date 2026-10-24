// Uso: npm run usuario -- --nombre "Juan Pérez" --rol mecanico --pin 1234 [--partner 1685]
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";

config({ path: [".env.local", ".env"], quiet: true });

const { values } = parseArgs({
  options: { nombre: { type: "string" }, rol: { type: "string" }, pin: { type: "string" }, partner: { type: "string" } },
});

const datos = z
  .object({
    nombre: z.string().trim().min(2),
    rol: z.enum(["mecanico", "jefe", "admin"]),
    pin: z.string().regex(/^\d{4,6}$/),
    partner: z.coerce.number().int().positive().optional(),
  })
  .parse(values);

const { hash } = await import("@node-rs/argon2");
const { getDb, schema } = await import("../lib/db/index");
const db = await getDb();
const [u] = await db
  .insert(schema.usuarios)
  .values({ nombre: datos.nombre, rol: datos.rol, pinHash: await hash(datos.pin), odooPartnerId: datos.partner ?? null })
  .returning({ id: schema.usuarios.id });
console.log(`Usuario #${u.id} "${datos.nombre}" (${datos.rol}) creado.`);
process.exit(0);
