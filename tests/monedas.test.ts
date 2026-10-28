import { describe, expect, it } from "vitest";
import { leerCsv, monedasPorChapa } from "@/lib/monedas-dominio";

describe("monedas del Google Sheets", () => {
  it("lee CSV con comillas y punto y coma", () => {
    expect(leerCsv('a,"b, c","d ""e"""\n1,2,3\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
    expect(leerCsv("Chapa;Moneda\r\n816ABTI;sí\r\n")).toEqual([["Chapa", "Moneda"], ["816ABTI", "sí"]]);
  });
  it("Si → «Moneda Google», No → «Sin moneda», otro valor tal cual; vacío no dice nada", () => {
    const filas = leerCsv("Listado de motos,,\nChapa,Modelo,Moneda\n816 abti,GTR,Sí\n236ABXV,GL,no\n393ABSM,GTR,IOS\n725ABSR,GTR,YGTAG\n101ABCD,GTR, IOS  Doble \n472ABSN,GTR,\n");
    expect(Object.fromEntries(monedasPorChapa(filas))).toEqual({
      "816ABTI": "Moneda Google",
      "236ABXV": "Sin moneda",
      "393ABSM": "IOS",
      "725ABSR": "YGTAG",
      "101ABCD": "IOS Doble",
    });
  });
  it("sin columna Moneda, toda chapa listada es «Moneda Google»", () => {
    expect(Object.fromEntries(monedasPorChapa(leerCsv("Placa,Nota\n725ABSR,algo\nxx,\n")))).toEqual({ "725ABSR": "Moneda Google" });
  });
  it("lee el formato real de la hoja («Nro. de Chapa», Si/No, con BOM)", () => {
    const filas = leerCsv("\uFEFFNro. de Chapa,Moneda,,\n138ABOD,No,,\n401ABUD,Si,,\n");
    expect(Object.fromEntries(monedasPorChapa(filas))).toEqual({ "138ABOD": "Sin moneda", "401ABUD": "Moneda Google" });
  });
  it("sin columna de chapa no inventa nada", () => {
    expect(monedasPorChapa(leerCsv("A,B\n1,2\n")).size).toBe(0);
  });
});
