import { describe, expect, it } from "vitest";
import { remitenteNota } from "@/lib/odoo";

describe("remitente de las notas en Odoo", () => {
  it("si el autor tiene email no se toca nada", () => {
    expect(remitenteNota({ name: "Jeferson", email: "jeferson@ridder.com.py" }, "api@ridder.com.py")).toEqual({});
  });

  it("si el autor no tiene email, la nota sigue a su nombre con el email de la API", () => {
    expect(remitenteNota({ name: 'Angel "Tito" Ramos', email: false }, "api@ridder.com.py")).toEqual({ email_from: '"Angel Tito Ramos" <api@ridder.com.py>' });
  });

  it("sin email de respaldo, o si el contacto no existe, la nota sale a nombre de la API", () => {
    expect(remitenteNota({ name: "Angel", email: false }, null)).toEqual({ sinAutor: true });
    expect(remitenteNota(undefined, "api@ridder.com.py")).toEqual({ sinAutor: true });
  });
});
