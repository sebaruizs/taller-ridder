import { describe, expect, it } from "vitest";
import { quienHizo, WebhookInvalido } from "@/lib/webhook-cobranzas";

describe("X-Ridder-Usuario", () => {
  it("decodifica el login de Cobranzas", () => {
    expect(quienHizo("c%C3%A9sar.p")).toBe("césar.p");
    expect(quienHizo("automatico")).toBe("automatico");
  });
  it("rechaza encabezado vacío, mal codificado o largo", () => {
    expect(() => quienHizo(null)).toThrow(WebhookInvalido);
    expect(() => quienHizo("%E0%A4%A")).toThrow(WebhookInvalido);
    expect(() => quienHizo("x".repeat(81))).toThrow(WebhookInvalido);
  });
});
