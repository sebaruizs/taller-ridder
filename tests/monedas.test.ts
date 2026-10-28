import { describe, expect, it } from "vitest";
import { chapasConMoneda, leerCsv } from "@/lib/monedas-dominio";

describe("monedas del Google Sheets", () => {
  it("lee CSV con comillas y punto y coma", () => {
    expect(leerCsv('a,"b, c","d ""e"""\n1,2,3\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
    expect(leerCsv("Chapa;Moneda\r\n816ABTI;sí\r\n")).toEqual([["Chapa", "Moneda"], ["816ABTI", "sí"]]);
  });
  it("con columna Moneda, cuenta todo lo que no sea vacío o «No» (Si, IOS, YGTAG…)", () => {
    const filas = leerCsv("Listado de motos,,\nChapa,Modelo,Moneda\n816 abti,GTR,Sí\n236ABXV,GL,no\n393ABSM,GTR,IOS\n725ABSR,GTR,YGTAG\n472ABSN,GTR,\n");
    expect([...chapasConMoneda(filas)].sort()).toEqual(["393ABSM", "725ABSR", "816ABTI"]);
  });
  it("sin columna Moneda, cuenta toda chapa listada", () => {
    expect([...chapasConMoneda(leerCsv("Placa,Nota\n725ABSR,algo\nxx,\n"))]).toEqual(["725ABSR"]);
  });
  it("lee el formato real de la hoja («Nro. de Chapa», Si/No, con BOM)", () => {
    const filas = leerCsv("\uFEFFNro. de Chapa,Moneda,,\n138ABOD,No,,\n401ABUD,Si,,\n");
    expect([...chapasConMoneda(filas)]).toEqual(["401ABUD"]);
  });
  it("sin columna de chapa no inventa nada", () => {
    expect(chapasConMoneda(leerCsv("A,B\n1,2\n")).size).toBe(0);
  });
});
