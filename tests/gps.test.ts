import { describe, expect, it } from "vitest";
import { conSoloEnAnterior, conTraccarAnterior, equiposPorChapa, faltanEquipos, muestraMonedaGoogle, imeisFueraDeLinea, leerNombre, payloadNotaEncendido, resultadoComando, type DispositivoTraccar } from "@/lib/gps-dominio";

const disp = (id: number, name: string, extra: Partial<DispositivoTraccar> = {}): DispositivoTraccar => ({ id, name, status: "online", lastUpdate: "2026-10-28T12:00:00Z", positionId: id * 10, ...extra });

describe("GPS: equipos de cada moto", () => {
  it("lee la chapa y el tipo del nombre en Traccar", () => {
    expect(leerNombre("816ABTI")).toEqual({ chapa: "816ABTI", tipo: "gps" });
    expect(leerNombre("816ABTI-TC")).toEqual({ chapa: "816ABTI", tipo: "tc" });
    // Como en Cobranzas: «-MC» también es el TC, con o sin espacios.
    expect(leerNombre("816abti - tc")).toEqual({ chapa: "816ABTI", tipo: "tc" });
    expect(leerNombre("436ABUI-MC")).toEqual({ chapa: "436ABUI", tipo: "tc" });
    expect(leerNombre("236ABXV-Monedas")).toEqual({ chapa: "236ABXV", tipo: "monedas" });
    // Con cualquier otro agregado ya no es «la chapa sola»: no corta.
    expect(leerNombre("816ABTI - Repuesto")).toEqual({ chapa: "816ABTI", tipo: "otro" });
    expect(leerNombre("236ABXV - Monedas")).toEqual({ chapa: "236ABXV", tipo: "monedas" });
  });

  it("agrupa por chapa, ignora archivados y deja primero el que corta", () => {
    const r = equiposPorChapa(
      ["816abti", "236ABXV"],
      [disp(2, "816ABTI-TC"), disp(1, "816ABTI"), disp(3, "236ABXV - Monedas"), disp(4, "999XXX"), disp(5, "236ABXV", { attributes: { "ridder.archived": true } })],
      [
        { id: 10, deviceId: 1, protocol: "gt06", fixTime: "2026-10-28T11:59:00Z", latitude: -25.3, longitude: -57.6, speed: 10, attributes: { ignition: true, blocked: false, batteryLevel: 80 } },
        { id: 20, deviceId: 2, fixTime: "", speed: 0, attributes: {} },
      ],
    );
    expect(Object.keys(r).sort()).toEqual(["236ABXV", "816ABTI"]);
    expect(r["816ABTI"].map((e) => [e.nombre, e.corta])).toEqual([["816ABTI", true], ["816ABTI-TC", false]]);
    expect(r["816ABTI"][0]).toMatchObject({ encendido: true, bloqueado: false, kmh: 19, enMovimiento: true, bateria: 80, protocolo: "gt06", ubicacion: { lat: -25.3, lon: -57.6 } });
    // Sin dato de relé: desconocido, no "desbloqueado".
    expect(r["816ABTI"][1]).toMatchObject({ bloqueado: null, encendido: null, enMovimiento: false });
    expect(r["236ABXV"].map((e) => e.tipo)).toEqual(["monedas"]);
  });

  it("explica si el comando llegó o quedó en cola", () => {
    expect(resultadoComando(200, "bloquear").enCola).toBe(false);
    expect(resultadoComando(202, "desbloquear")).toMatchObject({ enCola: true });
    expect(payloadNotaEncendido({ autor: "Derlis", accion: "bloquear", equipo: "816ABTI", enCola: true }).body).toContain("bloqueó el encendido");
    expect(payloadNotaEncendido({ autor: "Derlis", accion: "bloquear", equipo: "816ABTI", enCola: false, enAnterior: true }).body).toContain("en el Traccar anterior");
  });
});

describe("GPS: Traccar anterior", () => {
  const nuevo = (id: number, extra: Partial<DispositivoTraccar>) => disp(id, "816ABTI", { status: "offline", lastUpdate: "2026-10-28T10:00:00Z", uniqueId: "111", ...extra });
  it("solo consulta los fuera de línea con IMEI", () => {
    const r = equiposPorChapa(["816ABTI", "236ABXV"], [nuevo(1, {}), disp(2, "236ABXV", { uniqueId: "222" })], []);
    expect(imeisFueraDeLinea(r)).toEqual(["111"]);
  });
  it("usa el device más reciente del mismo IMEI y solo si reportó después que en el nuevo", () => {
    const base = equiposPorChapa(["816ABTI"], [nuevo(1, {})], []);
    const r = conTraccarAnterior(base, [
      { id: 90, uniqueId: "111", status: "offline", lastUpdate: "2026-10-28T09:00:00Z" },
      { id: 91, uniqueId: "111", status: "online", lastUpdate: "2026-10-28T12:00:00Z" },
    ]);
    expect(r["816ABTI"][0].anterior).toEqual({ id: 91, enLinea: true, ultimaConexion: "2026-10-28T12:00:00Z" });
    const viejo = conTraccarAnterior(base, [{ id: 90, uniqueId: "111", status: "offline", lastUpdate: "2026-10-27T09:00:00Z" }]);
    expect(viejo["816ABTI"][0].anterior).toBeNull();
  });
});

describe("GPS: equipos que solo están en el Traccar anterior", () => {
  it("agrega por nombre los que faltan en el nuevo, marcados del anterior", () => {
    const base = equiposPorChapa(["512ABVR"], [disp(1, "512ABVR-TC", { status: "offline" })], []);
    expect(faltanEquipos(base, ["512ABVR"])).toBe(true);
    const r = conSoloEnAnterior(
      base,
      ["512ABVR"],
      [
        disp(70, "512ABVR", { lastUpdate: "2026-10-27T09:00:00Z", status: "offline" }),
        disp(71, "512ABVR", { lastUpdate: "2026-10-29T12:00:00Z" }),
        disp(72, "512ABVR-TC"),
        disp(73, "999XXX"),
      ],
      [{ id: 710, deviceId: 71, fixTime: "2026-10-29T12:00:00Z", speed: 0, attributes: { blocked: false } }],
    );
    // El TC ya estaba en el nuevo: no se duplica. El GPS que corta viene del anterior (el más reciente).
    expect(r["512ABVR"].map((e) => [e.nombre, e.id, e.anterior?.id ?? null])).toEqual([["512ABVR", 71, 71], ["512ABVR-TC", 1, null]]);
    expect(r["512ABVR"][0]).toMatchObject({ corta: true, enLinea: false, bloqueado: false, anterior: { enLinea: true, ultimaConexion: "2026-10-29T12:00:00Z" } });
  });
  it("no busca si la chapa ya tiene GPS, TC y moneda en el nuevo", () => {
    const completo = equiposPorChapa(["816ABTI"], [disp(1, "816ABTI"), disp(2, "816ABTI-TC"), disp(3, "816ABTI - Monedas")], []);
    expect(faltanEquipos(completo, ["816ABTI"])).toBe(false);
  });
});

describe("GPS: Moneda Google", () => {
  it("solo si el Sheets dice que tiene y Traccar no la tiene o no reporta", () => {
    const enLinea = equiposPorChapa(["236ABXV"], [disp(3, "236ABXV - Monedas")], [])["236ABXV"];
    const fuera = equiposPorChapa(["236ABXV"], [disp(3, "236ABXV - Monedas", { status: "offline" })], [])["236ABXV"];
    expect(muestraMonedaGoogle([], "Moneda Google")).toBe(true);
    expect(muestraMonedaGoogle(fuera, "IOS")).toBe(true);
    expect(muestraMonedaGoogle(enLinea, "Moneda Google")).toBe(false);
    expect(muestraMonedaGoogle([], undefined)).toBe(false);
  });
});
