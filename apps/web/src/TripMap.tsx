import { useEffect, useRef } from "react";
import { Map as MapLibre, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PlanOption } from "./api";
import { modeKind, type ModeKind } from "./format";
import { useIsDark } from "./theme";

// Served from our own origin; MapLibre would otherwise look next to its
// bundled module, which Vite moves.
setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles";

type Point = { lat: number; lng: number };
type LngLat = [number, number];

type Segment = {
  kind: ModeKind;
  coords: LngLat[];
  /** No route line from the source: a straight line between the stops. */
  estimated: boolean;
};

type Stop = { coord: LngLat; role: "end" | "stop" };

/** Decode an encoded polyline (Google format) into [lng, lat] pairs. */
function decodePolyline(points: string, precision: number): LngLat[] {
  const factor = 10 ** precision;
  const coords: LngLat[] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = points.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < points.length) {
    lat += next();
    lng += next();
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

const at = (lat?: number, lng?: number): LngLat | null =>
  lat === undefined || lng === undefined ? null : [lng, lat];

/**
 * Lines per leg, from the source's route line or else straight between the
 * stops, plus the walks to and from stations the planner added itself.
 */
function tripShape(option: PlanOption, from: Point, to: Point) {
  const segments: Segment[] = [];
  const stops: Stop[] = [
    { coord: [from.lng, from.lat], role: "end" },
    { coord: [to.lng, to.lat], role: "end" },
  ];
  const legs = option.legs;
  const first = legs[0];
  const last = legs[legs.length - 1];

  const firstStop = at(first?.originLat, first?.originLng);
  if (option.fromStation && option.walkMetersOrigin >= 50 && firstStop) {
    segments.push({ kind: "walk", coords: [[from.lng, from.lat], firstStop], estimated: true });
  }

  for (const leg of legs) {
    const kind = modeKind(leg.modality);
    const start = at(leg.originLat, leg.originLng);
    const end = at(leg.destinationLat, leg.destinationLng);
    if (leg.geometry) {
      segments.push({
        kind,
        coords: decodePolyline(leg.geometry.points, leg.geometry.precision),
        estimated: false,
      });
    } else if (start && end) {
      segments.push({ kind, coords: [start, end], estimated: true });
    }
    if (kind !== "walk") {
      if (start) stops.push({ coord: start, role: "stop" });
      if (end) stops.push({ coord: end, role: "stop" });
    }
  }

  const lastStop = at(last?.destinationLat, last?.destinationLng);
  if (option.toStation && option.walkMetersDestination >= 50 && lastStop) {
    segments.push({ kind: "walk", coords: [lastStop, [to.lng, to.lat]], estimated: true });
  }

  return { segments, stops };
}

type Props = { option: PlanOption; from: Point; to: Point };

/** The trip on a map: vehicles in their mode colour, walks dotted. */
export default function TripMap({ option, from, to }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const dark = useIsDark();

  useEffect(() => {
    if (!container.current) return;
    const { segments, stops } = tripShape(option, from, to);
    const coords = [...segments.flatMap((s) => s.coords), ...stops.map((s) => s.coord)];
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);

    const css = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) =>
      css.getPropertyValue(name).trim() || fallback;
    // Walks use the muted ink: the light walk grey of the cards is too
    // faint on a map.
    const lineColor = (kind: ModeKind) =>
      kind === "walk" ? token("--muted", "#64748b") : token(`--mode-${kind}`, "#64748b");

    const map = new MapLibre({
      container: container.current,
      style: `${STYLE_URL}/${dark ? "dark" : "positron"}`,
      bounds: [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      fitBoundsOptions: { padding: 36, maxZoom: 16 },
      attributionControl: { compact: true },
      // Inside a scrolling list: zoom with Ctrl/⌘ + scroll or two fingers.
      cooperativeGestures: true,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Gebruik Ctrl + scroll om te zoomen",
        "CooperativeGesturesHandler.MacHelpText": "Gebruik ⌘ + scroll om te zoomen",
        "CooperativeGesturesHandler.MobileHelpText": "Gebruik twee vingers om de kaart te bewegen",
      },
    });

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: segments.map((s) => ({
            type: "Feature",
            properties: { color: lineColor(s.kind), dashed: s.kind === "walk" || s.estimated },
            geometry: { type: "LineString", coordinates: s.coords },
          })),
        },
      });
      map.addSource("stops", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: stops.map((s) => ({
            type: "Feature",
            properties: { role: s.role },
            geometry: { type: "Point", coordinates: s.coord },
          })),
        },
      });

      const surface = token("--surface", "#ffffff");
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        filter: ["!", ["get", "dashed"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": surface, "line-width": 8 },
      });
      map.addLayer({
        id: "route-solid",
        type: "line",
        source: "route",
        filter: ["!", ["get", "dashed"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 5 },
      });
      map.addLayer({
        id: "route-dashed",
        type: "line",
        source: "route",
        filter: ["get", "dashed"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-dasharray": [0.6, 1.8] },
      });
      map.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["match", ["get", "role"], "end", 7, 5],
          "circle-color": ["match", ["get", "role"], "end", token("--primary", "#2f5bff"), surface],
          "circle-stroke-color": ["match", ["get", "role"], "end", surface, token("--ink", "#0f172a")],
          "circle-stroke-width": 2.5,
        },
      });
    });

    return () => map.remove();
    // Rebuilt on a theme switch: the colours above are read once.
  }, [option, from, to, dark]);

  return <div ref={container} className="trip-map" aria-label="Kaart van de reis" role="img" />;
}
