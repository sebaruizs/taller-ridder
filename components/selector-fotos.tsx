"use client";
import { useEffect, useRef, useState } from "react";
import { comprimirFoto } from "@/lib/comprimir";

export const MAX_FOTOS = 12;

export type Foto = { id: string; blob: Blob; url: string };

export function useFotos() {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [procesando, setProcesando] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  async function agregar(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const lista = Array.from(files).slice(0, MAX_FOTOS - fotos.length - procesando);
    setProcesando((p) => p + lista.length);
    for (const file of lista) {
      try {
        const blob = await comprimirFoto(file);
        const url = URL.createObjectURL(blob);
        urls.current.add(url);
        setFotos((fs) => [...fs, { id: crypto.randomUUID(), blob, url }]);
      } catch {
        setError("No se pudo leer una de las fotos. Probá sacarla de nuevo.");
      } finally {
        setProcesando((p) => p - 1);
      }
    }
  }

  function quitar(id: string) {
    setFotos((fs) => {
      const f = fs.find((x) => x.id === id);
      if (f) {
        URL.revokeObjectURL(f.url);
        urls.current.delete(f.url);
      }
      return fs.filter((x) => x.id !== id);
    });
  }

  function agregarAlForm(fd: FormData) {
    fotos.forEach((f, i) => fd.append("fotos", f.blob, `foto-${i + 1}.jpg`));
  }

  return { fotos, procesando, error, agregar, quitar, agregarAlForm };
}

export function SelectorFotos({ estado, titulo = "Fotos" }: { estado: ReturnType<typeof useFotos>; titulo?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { fotos, procesando, error, agregar, quitar } = estado;
  return (
    <div className="field">
      <span className="label">{titulo} <span className="muted small">(opcional)</span></span>
      <div className="fotos">
        {fotos.map((f, i) => (
          <div key={f.id} className="foto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={`Foto ${i + 1}`} />
            <button type="button" onClick={() => quitar(f.id)} aria-label={`Quitar foto ${i + 1}`}>×</button>
          </div>
        ))}
        {Array.from({ length: procesando }).map((_, i) => <div key={`p${i}`} className="foto skeleton" />)}
        {fotos.length + procesando < MAX_FOTOS && (
          <button type="button" className="foto-add" onClick={() => input.current?.click()}>
            <span style={{ fontSize: 28 }}>📷</span>
            Sacá una foto
          </button>
        )}
      </div>
      {error && <span className="small" style={{ color: "var(--danger)" }}>{error}</span>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={async (e) => {
          const files = e.target.files;
          await agregar(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
