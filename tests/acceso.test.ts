import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VIDA_ENLACE_MS, armarEnlace, firmarAcceso, marcarUsada, verificarEnlace } from "@/lib/acceso-dominio";
import { mensajeAcceso } from "@/lib/acceso-mensajes";

const SECRETO = "clave-de-prueba-de-treinta-y-dos-caracteres!";
const AHORA = 1_800_000_000_000;
const enlace = (usuario = "derlis.g", vence = AHORA + VIDA_ENLACE_MS, secreto = SECRETO) => armarEnlace(secreto, usuario, vence);

describe("enlace firmado de Ridder Acceso", () => {
  it("acepta el enlace tal como lo arma Acceso", () => {
    // La referencia del contrato, escrita aparte para no probar el código contra sí mismo.
    const u = "derlis.g";
    const vence = AHORA + 120000;
    const firma = createHmac("sha256", SECRETO).update(`acceso|${u}|${vence}`).digest("hex");
    const t = `${Buffer.from(u).toString("base64url")}.${vence}.${firma}`;
    expect(verificarEnlace(t, SECRETO, AHORA)).toEqual({ ok: true, usuario: u, vence, firma });
    expect(t).toBe(enlace());
  });

  it("rechaza una firma hecha con otra clave o para otro origen", () => {
    expect(verificarEnlace(enlace("derlis.g", AHORA + 60_000, "otra-clave-de-treinta-y-dos-caracteres!!"), SECRETO, AHORA)).toEqual({ ok: false, motivo: "invalido" });
    const vence = AHORA + 60_000;
    const deTaller = createHmac("sha256", SECRETO).update(`taller|derlis.g|${vence}`).digest("hex");
    expect(verificarEnlace(`${Buffer.from("derlis.g").toString("base64url")}.${vence}.${deTaller}`, SECRETO, AHORA).ok).toBe(false);
  });

  it("rechaza si se cambia el usuario o el vencimiento sin volver a firmar", () => {
    const [, vence, firma] = enlace().split(".");
    expect(verificarEnlace(`${Buffer.from("admin").toString("base64url")}.${vence}.${firma}`, SECRETO, AHORA).ok).toBe(false);
    expect(verificarEnlace(`${Buffer.from("derlis.g").toString("base64url")}.${Number(vence) + 1}.${firma}`, SECRETO, AHORA).ok).toBe(false);
  });

  it("rechaza el vencido y el que vence a más de 2 minutos", () => {
    expect(verificarEnlace(enlace("derlis.g", AHORA), SECRETO, AHORA)).toEqual({ ok: false, motivo: "vencido" });
    expect(verificarEnlace(enlace("derlis.g", AHORA - 1), SECRETO, AHORA)).toEqual({ ok: false, motivo: "vencido" });
    expect(verificarEnlace(enlace("derlis.g", AHORA + VIDA_ENLACE_MS + 1), SECRETO, AHORA)).toEqual({ ok: false, motivo: "invalido" });
    expect(verificarEnlace(enlace("derlis.g", AHORA + VIDA_ENLACE_MS), SECRETO, AHORA).ok).toBe(true);
    expect(verificarEnlace(enlace("derlis.g", AHORA + 1), SECRETO, AHORA).ok).toBe(true);
  });

  it("rechaza lo que no tiene la forma del enlace", () => {
    for (const t of [null, undefined, "", "a.b", "a.b.c.d", "x".repeat(500), `${Buffer.from("derlis.g").toString("base64url")}.${AHORA + 1000}.zz`, `!!.${AHORA + 1000}.${"a".repeat(64)}`, `${Buffer.from("derlis.g").toString("base64url")}.1e12.${"a".repeat(64)}`]) {
      expect(verificarEnlace(t, SECRETO, AHORA)).toEqual({ ok: false, motivo: "invalido" });
    }
  });

  it("rechaza un usuario que no es un nombre de usuario de Taller, aunque esté bien firmado", () => {
    for (const u of ["Derlis.G", "de", "con espacio", "x' or 1=1", "ñandú"]) {
      expect(verificarEnlace(enlace(u), SECRETO, AHORA)).toEqual({ ok: false, motivo: "invalido" });
    }
  });

  it("la firma en mayúsculas no pasa (Acceso la manda en minúsculas)", () => {
    const [u, vence, firma] = enlace().split(".");
    expect(verificarEnlace(`${u}.${vence}.${firma.toUpperCase()}`, SECRETO, AHORA).ok).toBe(false);
  });
});

describe("un solo uso", () => {
  it("la segunda vez que llega la misma firma se rechaza", () => {
    const firma = firmarAcceso(SECRETO, "uso.unico", AHORA + 1000);
    expect(marcarUsada(firma, AHORA + 1000, AHORA)).toBe(true);
    expect(marcarUsada(firma, AHORA + 1000, AHORA + 500)).toBe(false);
  });
  it("otra firma del mismo usuario sí pasa", () => {
    expect(marcarUsada(firmarAcceso(SECRETO, "uso.unico", AHORA + 2000), AHORA + 2000, AHORA)).toBe(true);
  });
  it("las vencidas se olvidan (ya no pasarían por vencidas)", () => {
    const firma = firmarAcceso(SECRETO, "se.olvida", AHORA + 100);
    expect(marcarUsada(firma, AHORA + 100, AHORA)).toBe(true);
    expect(marcarUsada(firma, AHORA + 100, AHORA + 101)).toBe(true);
  });
});

describe("mensajes del login", () => {
  it("solo muestra motivos conocidos", () => {
    expect(mensajeAcceso("sin_usuario")).toMatch(/No tenés usuario en Taller/);
    expect(mensajeAcceso("vencido")).toMatch(/venció/);
    expect(mensajeAcceso("<script>")).toBeNull();
    expect(mensajeAcceso("constructor")).toBeNull();
    expect(mensajeAcceso(null)).toBeNull();
  });
});
