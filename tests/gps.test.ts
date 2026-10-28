import { describe, expect, it } from "vitest";
import { conTraccarAnterior, equiposPorChapa, imeisFueraDeLinea, leerNombre, payloadNotaEncendido, resultadoComando, type DispositivoTraccar } from "@/lib/gps-dominio";

const disp = (id: number, name: string, extra: Partial<DispositivoTraccar> = {}): DispositivoTraccar => ({ id, name, status: "online", lastUpdate: "2026-10-28T12:00:00Z", positionId: id * 10, ...extra });

describe("GPS: equipos de cada moto", () => {
  it("lee la chapa y el tipo del nombre en Traccar", () => {
    expect(leerNombre("816ABTI")).toEqual({ chapa: "816ABTI", tipo: "gps" });
    expect(leerNombre("816ABTI-TC")).toEqual({ chapa: "816ABTI", tipo: "tc" });
    // Con cualquier sufijo ya no es «la chapa sola»: no corta.
    expect(leerNombre("816abti - tc")).toEqual({ chapa: "816ABTI", tipo: "otro" });
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
      { uniqueId: "111", status: "offline", lastUpdate: "2026-10-28T09:00:00Z" },
      { uniqueId: "111", status: "online", lastUpdate: "2026-10-28T12:00:00Z" },
    ]);
    expect(r["816ABTI"][0].anterior).toEqual({ enLinea: true, ultimaConexion: "2026-10-28T12:00:00Z" });
    const viejo = conTraccarAnterior(base, [{ uniqueId: "111", status: "offline", lastUpdate: "2026-10-27T09:00:00Z" }]);
    expect(viejo["816ABTI"][0].anterior).toBeNull();
  });
});
