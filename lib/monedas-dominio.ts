// Monedas anotadas en el Google Sheets (publicado como CSV): qué motos tienen moneda. Sin I/O.

// CSV simple con comillas ("a, b", "dice ""hola""") y separador coma o punto y coma.
export function leerCsv(texto: string): string[][] {
  texto = texto.replace(/^\uFEFF/, "");
  const sep = (texto.split(/\r?\n/, 1)[0].match(/;/g)?.length ?? 0) > (texto.split(/\r?\n/, 1)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((x) => x.trim()));
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const chapa = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
// En la columna Moneda cuenta cualquier valor salvo vacío o "no" (la hoja usa Si, IOS, YGTAG, IOS Doble).
const NO = /^(|no|n|-|0|false|sin|sin moneda|ninguna)$/;

// Chapas que tienen moneda según la hoja. Busca la columna de la chapa ("Nro. de Chapa", "Placa", "Matrícula")
// y, si hay, una columna "moneda": cuenta todo valor que no sea vacío o "no". Sin columna moneda, cuenta toda chapa listada.
export function chapasConMoneda(filas: string[][]): Set<string> {
  const res = new Set<string>();
  if (!filas.length) return res;
  // El encabezado puede no estar en la primera fila (títulos arriba): se toma la primera que nombre la chapa.
  const esChapa = (c: string) => /chapa|placa|matricula/.test(c);
  const iEnc = filas.findIndex((f) => f.some((c) => esChapa(normalizar(c))));
  if (iEnc < 0) return res;
  const enc = filas[iEnc].map(normalizar);
  const colChapa = enc.findIndex(esChapa);
  const colMoneda = enc.findIndex((c, i) => i !== colChapa && c.includes("moneda"));
  for (const f of filas.slice(iEnc + 1)) {
    const ch = chapa(f[colChapa] ?? "");
    if (ch.length < 5) continue;
    if (colMoneda < 0 || !NO.test(normalizar(f[colMoneda] ?? ""))) res.add(ch);
  }
  return res;
}
