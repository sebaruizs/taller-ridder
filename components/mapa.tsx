"use client";
import { useEffect, useRef } from "react";
import type { Map as MapaLeaflet, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

// Mapa de OpenStreetMap (Leaflet) con el equipo y los lugares fijos (oficina, taller…).
// Leaflet usa window: se carga en el navegador, después de montar.

// color: el del equipo (Chapa, TC, Moneda…); destacado: el que se tocó, más grande y al frente, y el mapa se centra ahí.
export type PuntoMapa = { lat: number; lon: number; nombre: string; tipo: "equipo" | "lugar"; color?: string; destacado?: boolean };

// Los lugares a más de esta distancia del equipo se dibujan igual, pero no se usan para encuadrar.
const CERCA_KM = 30;

function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function Mapa({
  puntos,
  alto = 320,
  alTocar,
  titulo,
}: {
  puntos: PuntoMapa[];
  alto?: number;
  /** Tocar el mapa (en Ajustes, para elegir dónde queda un lugar). */
  alTocar?: (p: { lat: number; lon: number }) => void;
  titulo: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const tocar = useRef(alTocar);
  useEffect(() => {
    tocar.current = alTocar;
  }, [alTocar]);
  const clave = JSON.stringify(puntos);

  useEffect(() => {
    let vivo = true;
    void import("leaflet").then(({ default: L }) => {
      if (!vivo || !caja.current) return;
      if (!mapa.current) {
        mapa.current = L.map(caja.current, { scrollWheelZoom: false }).setView([-25.2867, -57.647], 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapa.current);
        mapa.current.on("click", (e) => tocar.current?.({ lat: Number(e.latlng.lat.toFixed(6)), lon: Number(e.latlng.lng.toFixed(6)) }));
        // El equipo va en su propio panel, arriba de las etiquetas de los lugares: si la moto está en la oficina, se ve igual.
        mapa.current.createPane("equipo").style.zIndex = "650";
        capa.current = L.layerGroup().addTo(mapa.current);
      }
      const lista = JSON.parse(clave) as PuntoMapa[];
      capa.current!.clearLayers();
      for (const p of lista) {
        const marca =
          p.tipo === "equipo"
            ? L.marker([p.lat, p.lon], {
                pane: "equipo",
                zIndexOffset: p.destacado ? 1000 : 0,
                icon: L.divIcon({
                  className: p.destacado ? "mapa-equipo mapa-destacado" : "mapa-equipo",
                  html: `<span style="--c:${p.color && /^#[0-9a-f]{3,8}$/i.test(p.color) ? p.color : "var(--ridder)"}"></span>`,
                  iconSize: [22, 22],
                  iconAnchor: [11, 11],
                }),
              })
            : L.marker([p.lat, p.lon], {
                icon: L.divIcon({ className: "mapa-lugar", html: `<span>${escapar(p.nombre)}</span>`, iconSize: undefined, iconAnchor: [0, 0] }),
              });
        marca.bindTooltip(escapar(p.nombre), p.tipo === "equipo" ? { pane: "tooltipPane" } : undefined).addTo(capa.current!);
      }
      // Encuadre: el destacado; si no hay, los equipos y los lugares cerca de ellos; sin equipos, todos los lugares.
      const destacado = lista.find((p) => p.destacado);
      const equipos = lista.filter((p) => p.tipo === "equipo");
      const visibles = destacado
        ? [destacado]
        : equipos.length
          ? lista.filter((p) => p.tipo === "equipo" || equipos.some((e) => distanciaKm(e, p) <= CERCA_KM))
          : lista;
      if (visibles.length === 1) mapa.current.setView([visibles[0].lat, visibles[0].lon], 16);
      else if (visibles.length > 1) mapa.current.fitBounds(L.latLngBounds(visibles.map((p) => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 16 });
    });
    return () => {
      vivo = false;
    };
  }, [clave]);

  useEffect(
    () => () => {
      mapa.current?.remove();
      mapa.current = null;
    },
    [],
  );

  return <div ref={caja} className="mapa" role="region" aria-label={titulo} style={{ height: alto }} />;
}
