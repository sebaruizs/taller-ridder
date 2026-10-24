export const gs = (n: number) => `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n))}`;

export const cantidad = (n: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);

export const fecha = (f: string | null) => (f ? f.split("-").reverse().join("/") : "—");

// Para montos grandes en tarjetas de resumen: "Gs. 5.102 M".
export const gsCorto = (n: number) =>
  n >= 1_000_000 ? `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n / 1_000_000)} M` : gs(n);
