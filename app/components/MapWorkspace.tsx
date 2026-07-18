"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";

type Place = {
  name: string;
  subtitle: string;
  longitude: number;
  latitude: number;
  zoom: number;
};

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
};

type SelectionBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type SelectionCorner = "north-west" | "north-east" | "south-east" | "south-west";

type ElevationPoint = {
  elevation: number;
  longitude: number;
  latitude: number;
  source_filename: string;
};

type ElevationDataset = {
  filename: string;
  crs: string;
  width: number;
  height: number;
  resolution_x: number;
  resolution_y: number;
  nodata: number | null;
  vertical_datum: string;
  bounds: SelectionBounds;
  overlaps_selection: boolean;
};

type ElevationAnalysis = {
  selection: SelectionBounds;
  preview_bounds: SelectionBounds;
  preview_png: string;
  minimum: ElevationPoint;
  maximum: ElevationPoint;
  coverage: {
    dataset_overlap_percent: number;
    valid_data_percent: number;
    missing_data_percent: number;
  };
  datasets: ElevationDataset[];
};

type ProcessorStatus = "checking" | "ready" | "unavailable";

type LayerBoundary = {
  id: string;
  value: string;
  role: "sea-level" | "custom" | "maximum";
};

type LayerPreset = "suggested" | "equal" | "hundreds" | "custom";

const QUICK_PLACES: Place[] = [
  { name: "Mount Taranaki", subtitle: "First terrain proof", longitude: 174.0632, latitude: -39.2968, zoom: 10.2 },
  { name: "Banks Peninsula", subtitle: "Future coastal proof", longitude: 172.915, latitude: -43.75, zoom: 9.2 },
  { name: "Aoraki / Mt Cook", subtitle: "Southern Alps", longitude: 170.1418, latitude: -43.595, zoom: 10.2 },
];

const TARANAKI_EXAMPLE: SelectionBounds = {
  west: 173.895,
  south: -39.43,
  east: 174.225,
  north: -39.155,
};

const SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const PROCESSOR_ENDPOINT = "http://127.0.0.1:8765";
const SELECTION_SOURCE = "topomapper-selection";
const ELEVATION_SOURCE = "topomapper-elevation-preview";
const ELEVATION_LAYER = "topomapper-elevation-preview";
const LAST_SELECTION_KEY = "topomapper:selection:last";
const SAVED_EXAMPLE_KEY = "topomapper:selection:example";
const LAYER_PLAN_KEY = "topomapper:layer-plan";
const EARTH_RADIUS_METRES = 6_371_008.8;

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function haversineDistance(longitudeA: number, latitudeA: number, longitudeB: number, latitudeB: number) {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const startLatitude = toRadians(latitudeA);
  const endLatitude = toRadians(latitudeB);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a));
}

function selectionMeasurements(bounds: SelectionBounds) {
  const centreLatitude = (bounds.south + bounds.north) / 2;
  const centreLongitude = (bounds.west + bounds.east) / 2;
  const width = haversineDistance(bounds.west, centreLatitude, bounds.east, centreLatitude);
  const height = haversineDistance(centreLongitude, bounds.south, centreLongitude, bounds.north);
  const sphericalArea = EARTH_RADIUS_METRES ** 2
    * Math.abs(Math.sin(toRadians(bounds.north)) - Math.sin(toRadians(bounds.south)))
    * Math.abs(toRadians(bounds.east - bounds.west));
  return { width, height, area: sphericalArea };
}

function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
}

function formatArea(squareMetres: number) {
  if (squareMetres >= 1_000_000) return `${(squareMetres / 1_000_000).toFixed(2)} km²`;
  if (squareMetres >= 10_000) return `${(squareMetres / 10_000).toFixed(1)} ha`;
  return `${Math.round(squareMetres).toLocaleString("en-NZ")} m²`;
}

function normaliseBounds(longitudeA: number, latitudeA: number, longitudeB: number, latitudeB: number): SelectionBounds {
  return {
    west: Math.min(longitudeA, longitudeB),
    south: Math.min(latitudeA, latitudeB),
    east: Math.max(longitudeA, longitudeB),
    north: Math.max(latitudeA, latitudeB),
  };
}

function selectionGeoJson(bounds: SelectionBounds | null) {
  return {
    type: "FeatureCollection" as const,
    features: bounds ? [{
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [bounds.west, bounds.north],
          [bounds.east, bounds.north],
          [bounds.east, bounds.south],
          [bounds.west, bounds.south],
          [bounds.west, bounds.north],
        ]],
      },
    }] : [],
  };
}

function isSelectionBounds(value: unknown): value is SelectionBounds {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SelectionBounds>;
  return [candidate.west, candidate.south, candidate.east, candidate.north].every(Number.isFinite)
    && Number(candidate.west) < Number(candidate.east)
    && Number(candidate.south) < Number(candidate.north);
}

function sameBounds(left: SelectionBounds, right: SelectionBounds) {
  return Math.abs(left.west - right.west) < 0.0000001
    && Math.abs(left.south - right.south) < 0.0000001
    && Math.abs(left.east - right.east) < 0.0000001
    && Math.abs(left.north - right.north) < 0.0000001;
}

function formatElevation(value: number) {
  return `${Math.round(value).toLocaleString("en-NZ")} m`;
}

function formatBoundaryValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function parseBoundary(boundary: LayerBoundary) {
  if (!boundary.value.trim()) return Number.NaN;
  return Number(boundary.value);
}

function boundarySet(values: number[], maximum: number, prefix: string): LayerBoundary[] {
  return values.map((value, index) => ({
    id: `${prefix}-${index}-${formatBoundaryValue(value)}`,
    value: formatBoundaryValue(value),
    role: index === 0 ? "sea-level" : index === values.length - 1 ? "maximum" : "custom",
  }));
}

function presetBoundaries(preset: LayerPreset, maximum: number): LayerBoundary[] {
  let values: number[];
  if (preset === "equal") {
    values = Array.from({ length: 11 }, (_, index) => index === 10 ? maximum : Math.round(maximum * index / 10));
  } else if (preset === "hundreds") {
    values = [0];
    for (let value = 100; value < maximum; value += 100) values.push(value);
    values.push(maximum);
  } else {
    values = [0, 50, 100, 200, 350, 500, 750, 1000, 1500, 2000].filter((value) => value < maximum);
    values.push(maximum);
  }
  values = values.filter((value, index) => index === 0 || Math.abs(value - values[index - 1]) > 0.001);
  return boundarySet(values, maximum, preset);
}

function validateLayerBoundaries(boundaries: LayerBoundary[], maximum: number) {
  const values = boundaries.map(parseBoundary);
  if (values.some((value) => !Number.isFinite(value))) return "Every boundary needs a valid elevation.";
  if (Math.abs(values[0]) > 0.001) return "Sea level must remain at 0 m.";
  if (Math.abs(values[values.length - 1] - maximum) > 0.05) return "The final boundary must remain at the analysed maximum.";
  for (let index = 1; index < values.length; index += 1) {
    if (Math.abs(values[index] - values[index - 1]) < 0.001) return `Duplicate boundary at ${formatBoundaryValue(values[index])} m.`;
    if (values[index] < values[index - 1]) return `${formatBoundaryValue(values[index])} m is out of order. Boundaries must rise from sea level.`;
  }
  return "";
}

function layerColour(value: number, maximum: number) {
  const position = maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0;
  if (position < 0.18) return "#3f8459";
  if (position < 0.38) return "#70a160";
  if (position < 0.58) return "#a2a66a";
  if (position < 0.76) return "#9b846c";
  if (position < 0.9) return "#8a8580";
  return "#f0efe9";
}

export function MapWorkspace() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapLibreRef = useRef<typeof import("maplibre-gl").default | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const selectionMarkersRef = useRef<Partial<Record<SelectionCorner, MapLibreMarker>>>({});
  const elevationMarkersRef = useRef<MapLibreMarker[]>([]);
  const selectionRef = useRef<SelectionBounds | null>(null);
  const analysisRef = useRef<ElevationAnalysis | null>(null);
  const drawingRef = useRef(false);
  const drawStartRef = useRef<{ longitude: number; latitude: number } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("Search for a New Zealand place");
  const [mapStatus, setMapStatus] = useState("Loading map…");
  const [zoom, setZoom] = useState(4.7);
  const [cursor, setCursor] = useState({ longitude: 172.5, latitude: -41.2 });
  const [selection, setSelection] = useState<SelectionBounds | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSavedExample, setHasSavedExample] = useState(false);
  const [selectionStatus, setSelectionStatus] = useState("Find a place, then draw the area you want to model.");
  const [processorStatus, setProcessorStatus] = useState<ProcessorStatus>("checking");
  const [elevationFiles, setElevationFiles] = useState<File[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState<ElevationAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState("Choose a LINZ elevation GeoTIFF for this area.");
  const [layerBoundaries, setLayerBoundaries] = useState<LayerBoundary[]>([]);
  const [layerPreset, setLayerPreset] = useState<LayerPreset>("suggested");
  const [newBoundaryValue, setNewBoundaryValue] = useState("");
  const [layerStatus, setLayerStatus] = useState("Analyse elevation data to begin a layer plan.");

  function cornerPosition(bounds: SelectionBounds, corner: SelectionCorner): [number, number] {
    switch (corner) {
      case "north-west": return [bounds.west, bounds.north];
      case "north-east": return [bounds.east, bounds.north];
      case "south-east": return [bounds.east, bounds.south];
      case "south-west": return [bounds.west, bounds.south];
    }
  }

  function boundsFromDraggedCorner(bounds: SelectionBounds, corner: SelectionCorner, longitude: number, latitude: number) {
    switch (corner) {
      case "north-west": return normaliseBounds(longitude, bounds.south, bounds.east, latitude);
      case "north-east": return normaliseBounds(bounds.west, bounds.south, longitude, latitude);
      case "south-east": return normaliseBounds(bounds.west, latitude, longitude, bounds.north);
      case "south-west": return normaliseBounds(longitude, latitude, bounds.east, bounds.north);
    }
  }

  function updateSelectionMarkers(bounds: SelectionBounds | null) {
    const map = mapRef.current;
    const maplibregl = mapLibreRef.current;
    if (!bounds || !map || !maplibregl) {
      Object.values(selectionMarkersRef.current).forEach((marker) => marker?.remove());
      selectionMarkersRef.current = {};
      return;
    }

    const corners: SelectionCorner[] = ["north-west", "north-east", "south-east", "south-west"];
    corners.forEach((corner) => {
      let marker = selectionMarkersRef.current[corner];
      if (!marker) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "selection-handle";
        handle.setAttribute("aria-label", `Adjust ${corner} corner`);
        marker = new maplibregl.Marker({ element: handle, draggable: true, anchor: "center" })
          .setLngLat(cornerPosition(bounds, corner))
          .addTo(map);
        marker.on("drag", () => {
          const current = selectionRef.current;
          if (!current || !marker) return;
          const location = marker.getLngLat();
          const next = boundsFromDraggedCorner(current, corner, location.lng, location.lat);
          applySelection(next, true);
          setSelectionStatus("Area adjusted and kept on this Mac.");
        });
        selectionMarkersRef.current[corner] = marker;
      }
      marker.setLngLat(cornerPosition(bounds, corner));
    });
  }

  function clearElevationOverlay() {
    elevationMarkersRef.current.forEach((marker) => marker.remove());
    elevationMarkersRef.current = [];
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(ELEVATION_LAYER)) map.removeLayer(ELEVATION_LAYER);
    if (map.getSource(ELEVATION_SOURCE)) map.removeSource(ELEVATION_SOURCE);
  }

  function addElevationMarker(point: ElevationPoint, kind: "minimum" | "maximum") {
    const map = mapRef.current;
    const maplibregl = mapLibreRef.current;
    if (!map || !maplibregl) return;
    const element = document.createElement("button");
    element.type = "button";
    element.className = `elevation-marker ${kind}`;
    element.textContent = kind === "minimum" ? "L" : "H";
    element.setAttribute("aria-label", `${kind === "minimum" ? "Lowest" : "Highest"} point, ${formatElevation(point.elevation)}`);
    const marker = new maplibregl.Marker({ element, anchor: "center" })
      .setLngLat([point.longitude, point.latitude])
      .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${kind === "minimum" ? "Lowest" : "Highest"} point</strong><br>${formatElevation(point.elevation)}`,
      ))
      .addTo(map);
    elevationMarkersRef.current.push(marker);
  }

  function showElevationOverlay(result: ElevationAnalysis) {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    clearElevationOverlay();
    const bounds = result.preview_bounds;
    map.addSource(ELEVATION_SOURCE, {
      type: "image",
      url: result.preview_png,
      coordinates: [
        [bounds.west, bounds.north],
        [bounds.east, bounds.north],
        [bounds.east, bounds.south],
        [bounds.west, bounds.south],
      ],
    });
    map.addLayer({
      id: ELEVATION_LAYER,
      type: "raster",
      source: ELEVATION_SOURCE,
      paint: { "raster-opacity": 0.86, "raster-fade-duration": 0 },
    }, "topomapper-selection-fill");
    addElevationMarker(result.minimum, "minimum");
    addElevationMarker(result.maximum, "maximum");
  }

  function applySelection(bounds: SelectionBounds | null, persist = false) {
    const currentAnalysis = analysisRef.current;
    if (currentAnalysis && (!bounds || !sameBounds(bounds, currentAnalysis.selection))) {
      clearElevationOverlay();
      analysisRef.current = null;
      setAnalysis(null);
      setAnalysisStatus("The area changed. Analyse the GeoTIFF again for the new bounds.");
      setLayerBoundaries([]);
      setLayerStatus("Analyse the changed area before editing its layer plan.");
    }
    selectionRef.current = bounds;
    setSelection(bounds);
    const source = mapRef.current?.getSource(SELECTION_SOURCE) as GeoJSONSource | undefined;
    source?.setData(selectionGeoJson(bounds));
    updateSelectionMarkers(bounds);
    if (persist) {
      if (bounds) window.localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(bounds));
      else window.localStorage.removeItem(LAST_SELECTION_KEY);
    }
  }

  function setDrawingMode(active: boolean) {
    drawingRef.current = active;
    setDrawing(active);
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = active ? "crosshair" : "";
    if (!active) {
      drawStartRef.current = null;
      map?.dragPan.enable();
    }
  }

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    let cancelled = false;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !mapNode.current) return;
      mapLibreRef.current = maplibregl;
      const map = new maplibregl.Map({
        container: mapNode.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [172.5, -41.2],
        zoom: 4.7,
        minZoom: 3.8,
        maxZoom: 17,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 160, unit: "metric" }), "bottom-left");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("load", () => {
        map.addSource(SELECTION_SOURCE, { type: "geojson", data: selectionGeoJson(null) });
        map.addLayer({
          id: "topomapper-selection-fill",
          type: "fill",
          source: SELECTION_SOURCE,
          paint: { "fill-color": "#d35a36", "fill-opacity": 0.14 },
        });
        map.addLayer({
          id: "topomapper-selection-outline",
          type: "line",
          source: SELECTION_SOURCE,
          paint: { "line-color": "#b74728", "line-width": 2.5, "line-dasharray": [2, 1.2] },
        });
        setMapStatus("Map ready");
        setHasSavedExample(Boolean(window.localStorage.getItem(SAVED_EXAMPLE_KEY)));
        try {
          const previous = JSON.parse(window.localStorage.getItem(LAST_SELECTION_KEY) ?? "null");
          if (isSelectionBounds(previous)) {
            applySelection(previous);
            map.fitBounds([[previous.west, previous.south], [previous.east, previous.north]], { padding: 130, maxZoom: 12 });
            setSelectionStatus("Your previous working area has been restored.");
          }
        } catch {
          window.localStorage.removeItem(LAST_SELECTION_KEY);
        }
      });
      map.on("error", () => setMapStatus("Map source unavailable"));
      map.on("zoom", () => setZoom(map.getZoom()));
      map.on("mousemove", (event) => {
        setCursor({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
        const start = drawStartRef.current;
        if (!start) return;
        applySelection(normaliseBounds(start.longitude, start.latitude, event.lngLat.lng, event.lngLat.lat));
      });
      map.on("mousedown", (event) => {
        if (!drawingRef.current || event.originalEvent.button !== 0) return;
        event.preventDefault();
        map.dragPan.disable();
        drawStartRef.current = { longitude: event.lngLat.lng, latitude: event.lngLat.lat };
        setSelectionStatus("Drag to the opposite corner, then release.");
      });
      map.on("mouseup", (event) => {
        const start = drawStartRef.current;
        if (!start) return;
        const next = normaliseBounds(start.longitude, start.latitude, event.lngLat.lng, event.lngLat.lat);
        const isUsable = Math.abs(next.east - next.west) > 0.00001 && Math.abs(next.north - next.south) > 0.00001;
        setDrawingMode(false);
        if (isUsable) {
          applySelection(next, true);
          setSelectionStatus("Area selected. Drag any corner handle to refine it.");
        } else {
          applySelection(null, true);
          setSelectionStatus("The area was too small. Choose Draw area and try again.");
        }
      });
      mapRef.current = map;
    });

    function cancelDrawing(event: KeyboardEvent) {
      if (event.key !== "Escape" || !drawingRef.current) return;
      setDrawingMode(false);
      setSelectionStatus("Drawing cancelled.");
    }
    window.addEventListener("keydown", cancelDrawing);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", cancelDrawing);
      Object.values(selectionMarkersRef.current).forEach((marker) => marker?.remove());
      elevationMarkersRef.current.forEach((marker) => marker.remove());
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibreRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function checkProcessor() {
      attempts += 1;
      try {
        const response = await fetch(`${PROCESSOR_ENDPOINT}/health`);
        if (!response.ok) throw new Error("Processor unavailable");
        if (!cancelled) setProcessorStatus("ready");
      } catch {
        if (cancelled) return;
        if (attempts < 4) retryTimer = setTimeout(checkProcessor, 1200);
        else setProcessorStatus("unavailable");
      }
    }

    void checkProcessor();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  function showPlace(place: Place) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [place.longitude, place.latitude], zoom: place.zoom, duration: 1500, essential: true });
    setCursor({ longitude: place.longitude, latitude: place.latitude });
    setQuery(place.name);
    setResults([]);
    setSearchMessage(place.subtitle);
    addMarker(place.longitude, place.latitude, place.name);
  }

  async function searchPlaces(event: FormEvent) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery || searching) return;

    setSearching(true);
    setResults([]);
    setSearchMessage("Searching New Zealand…");

    try {
      const cached = window.localStorage.getItem(`topomapper:search:${cleanQuery.toLowerCase()}`);
      const data: SearchResult[] = cached
        ? JSON.parse(cached)
        : await fetch(`${SEARCH_ENDPOINT}?format=jsonv2&countrycodes=nz&limit=5&q=${encodeURIComponent(cleanQuery)}`)
            .then((response) => {
              if (!response.ok) throw new Error("Search service unavailable");
              return response.json();
            });
      if (!cached) window.localStorage.setItem(`topomapper:search:${cleanQuery.toLowerCase()}`, JSON.stringify(data));
      setResults(data);
      setSearchMessage(data.length ? `${data.length} place${data.length === 1 ? "" : "s"} found` : "No New Zealand places found");
    } catch {
      setSearchMessage("Search is temporarily unavailable — try a quick location");
    } finally {
      setSearching(false);
    }
  }

  function selectResult(result: SearchResult) {
    const longitude = Number(result.lon);
    const latitude = Number(result.lat);
    const map = mapRef.current;
    if (!map) return;

    if (result.boundingbox) {
      const [south, north, west, east] = result.boundingbox.map(Number);
      map.fitBounds([[west, south], [east, north]], { padding: 90, maxZoom: 12, duration: 1400 });
    } else {
      map.flyTo({ center: [longitude, latitude], zoom: 11, duration: 1400, essential: true });
    }
    addMarker(longitude, latitude, result.display_name.split(",")[0]);
    setCursor({ longitude, latitude });
    setQuery(result.display_name.split(",")[0]);
    setResults([]);
    setSearchMessage(result.display_name);
  }

  function addMarker(longitude: number, latitude: number, label: string) {
    const maplibregl = mapLibreRef.current;
    if (!mapRef.current || !maplibregl) return;
    markerRef.current?.remove();
    markerRef.current = new maplibregl.Marker({ color: "#d35a36" })
      .setLngLat([longitude, latitude])
      .setPopup(new maplibregl.Popup({ offset: 24 }).setText(label))
      .addTo(mapRef.current);
  }

  function resetNewZealand() {
    setDrawingMode(false);
    mapRef.current?.flyTo({ center: [172.5, -41.2], zoom: 4.7, duration: 1300, essential: true });
    markerRef.current?.remove();
    markerRef.current = null;
    setQuery("");
    setResults([]);
    setSearchMessage("Search for a New Zealand place");
  }

  function startDrawing() {
    setDrawingMode(!drawingRef.current);
    setSelectionStatus(drawingRef.current ? "Drag from one corner of the required area to the other." : "Drawing cancelled.");
  }

  function clearSelection() {
    setDrawingMode(false);
    applySelection(null, true);
    setSelectionStatus("Area cleared. Your separately saved example is still available.");
  }

  function resetTaranakiExample() {
    setDrawingMode(false);
    applySelection(TARANAKI_EXAMPLE, true);
    mapRef.current?.fitBounds(
      [[TARANAKI_EXAMPLE.west, TARANAKI_EXAMPLE.south], [TARANAKI_EXAMPLE.east, TARANAKI_EXAMPLE.north]],
      { padding: 130, maxZoom: 12, duration: 1200 },
    );
    setQuery("Mount Taranaki");
    setSearchMessage("Stage 2 reference area");
    setSelectionStatus("Mount Taranaki reference area restored.");
  }

  function saveExample() {
    if (!selection) return;
    window.localStorage.setItem(SAVED_EXAMPLE_KEY, JSON.stringify(selection));
    setHasSavedExample(true);
    setSelectionStatus("Example saved on this Mac. It can be reopened after restarting Topomapper.");
  }

  function openSavedExample() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_EXAMPLE_KEY) ?? "null");
      if (!isSelectionBounds(saved)) throw new Error("Invalid saved selection");
      applySelection(saved, true);
      mapRef.current?.fitBounds([[saved.west, saved.south], [saved.east, saved.north]], { padding: 130, maxZoom: 12, duration: 1200 });
      setSelectionStatus("Saved example reopened with the same numerical bounds.");
    } catch {
      window.localStorage.removeItem(SAVED_EXAMPLE_KEY);
      setHasSavedExample(false);
      setSelectionStatus("The saved example could not be read. Save this area again.");
    }
  }

  function storeLayerPlan(next: LayerBoundary[], maximum: number, successMessage: string) {
    setLayerBoundaries(next);
    const error = validateLayerBoundaries(next, maximum);
    if (error) {
      setLayerStatus(error);
      return;
    }
    window.localStorage.setItem(LAYER_PLAN_KEY, JSON.stringify({
      maximum,
      values: next.map(parseBoundary),
    }));
    setLayerStatus(successMessage);
  }

  function initialiseLayerPlan(maximum: number) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LAYER_PLAN_KEY) ?? "null") as { maximum?: number; values?: number[] } | null;
      if (saved && Number.isFinite(saved.maximum) && Array.isArray(saved.values)
        && Math.abs(Number(saved.maximum) - maximum) < 0.05 && saved.values.length >= 2) {
        const restored = boundarySet(saved.values, maximum, "restored");
        if (!validateLayerBoundaries(restored, maximum)) {
          setLayerBoundaries(restored);
          setLayerStatus("Your saved layer plan has been restored for this elevation range.");
          return;
        }
      }
    } catch {
      window.localStorage.removeItem(LAYER_PLAN_KEY);
    }
    const suggested = presetBoundaries("suggested", maximum);
    setLayerPreset("suggested");
    storeLayerPlan(suggested, maximum, "Suggested non-linear terrain boundaries are ready to edit.");
  }

  function applyLayerPreset(preset: LayerPreset) {
    if (!analysis) return;
    const next = presetBoundaries(preset, analysis.maximum.elevation);
    setLayerPreset(preset);
    storeLayerPlan(next, analysis.maximum.elevation, preset === "suggested"
      ? "Suggested non-linear terrain boundaries applied."
      : preset === "equal" ? "Ten equal elevation intervals applied." : "100 metre intervals applied.");
  }

  function editLayerBoundary(id: string, value: string) {
    if (!analysis) return;
    setLayerPreset("custom");
    const next = layerBoundaries.map((boundary) => boundary.id === id ? { ...boundary, value } : boundary);
    storeLayerPlan(next, analysis.maximum.elevation, "Layer boundary updated and saved on this Mac.");
  }

  function addLayerBoundary() {
    if (!analysis) return;
    const value = Number(newBoundaryValue);
    const maximum = analysis.maximum.elevation;
    if (!newBoundaryValue.trim() || !Number.isFinite(value)) {
      setLayerStatus("Enter a valid elevation before adding a boundary.");
      return;
    }
    if (value <= 0 || value >= maximum) {
      setLayerStatus(`New boundaries must be above 0 m and below ${formatBoundaryValue(maximum)} m.`);
      return;
    }
    if (layerBoundaries.some((boundary) => Math.abs(parseBoundary(boundary) - value) < 0.001)) {
      setLayerStatus(`A ${formatBoundaryValue(value)} m boundary already exists.`);
      return;
    }
    const custom = layerBoundaries.filter((boundary) => boundary.role === "custom");
    custom.push({ id: `custom-${Date.now()}`, value: formatBoundaryValue(value), role: "custom" });
    custom.sort((left, right) => parseBoundary(left) - parseBoundary(right));
    const next = [layerBoundaries[0], ...custom, layerBoundaries[layerBoundaries.length - 1]];
    setLayerPreset("custom");
    setNewBoundaryValue("");
    storeLayerPlan(next, maximum, `${formatBoundaryValue(value)} m boundary added.`);
  }

  function removeLayerBoundary(id: string) {
    if (!analysis) return;
    setLayerPreset("custom");
    const next = layerBoundaries.filter((boundary) => boundary.id !== id);
    storeLayerPlan(next, analysis.maximum.elevation, "Boundary removed.");
  }

  function moveLayerBoundary(id: string, direction: -1 | 1) {
    if (!analysis) return;
    const index = layerBoundaries.findIndex((boundary) => boundary.id === id);
    const target = index + direction;
    if (index < 1 || target < 1 || target >= layerBoundaries.length - 1) return;
    const next = [...layerBoundaries];
    [next[index], next[target]] = [next[target], next[index]];
    setLayerPreset("custom");
    storeLayerPlan(next, analysis.maximum.elevation, "Boundary order updated.");
  }

  function chooseElevationFiles(files: File[]) {
    setElevationFiles(files);
    if (!files.length) {
      setAnalysisStatus("Choose one or more LINZ elevation GeoTIFFs for this area.");
      return;
    }
    if (analysisRef.current) {
      clearElevationOverlay();
      analysisRef.current = null;
      setAnalysis(null);
      setLayerBoundaries([]);
      setLayerStatus("Analyse the new GeoTIFF selection before editing layers.");
    }
    setAnalysisStatus(files.length === 1
      ? `${files[0].name} is ready to analyse.`
      : `${files.length} adjoining GeoTIFF tiles are ready to combine.`);
  }

  async function retryProcessor() {
    setProcessorStatus("checking");
    try {
      const response = await fetch(`${PROCESSOR_ENDPOINT}/health`);
      if (!response.ok) throw new Error("Processor unavailable");
      setProcessorStatus("ready");
      setAnalysisStatus(elevationFiles.length
        ? `${elevationFiles.length} GeoTIFF tile${elevationFiles.length === 1 ? " is" : "s are"} ready to analyse.`
        : "Choose one or more LINZ elevation GeoTIFFs for this area.");
    } catch {
      setProcessorStatus("unavailable");
      setAnalysisStatus("The elevation processor is not running. Restart Topomapper from Terminal.");
    }
  }

  async function analyseElevation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || !elevationFiles.length || analysing) return;
    setAnalysing(true);
    setAnalysisStatus(elevationFiles.length === 1
      ? "Clipping the GeoTIFF and finding its highest and lowest points…"
      : `Combining ${elevationFiles.length} tiles and finding the mosaic's highest and lowest points…`);

    const form = new FormData();
    elevationFiles.forEach((file) => form.append("geotiff", file));
    form.append("bounds", JSON.stringify(selection));

    try {
      const response = await fetch(`${PROCESSOR_ENDPOINT}/analyze`, { method: "POST", body: form });
      const payload = await response.json() as ElevationAnalysis | { error?: string };
      if (!response.ok || !("minimum" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "The GeoTIFF could not be analysed.");
      }
      if (!selectionRef.current || !sameBounds(selectionRef.current, payload.selection)) {
        throw new Error("The map area changed during analysis. Run the analysis again.");
      }
      analysisRef.current = payload;
      setAnalysis(payload);
      showElevationOverlay(payload);
      initialiseLayerPlan(payload.maximum.elevation);
      const missing = payload.coverage.missing_data_percent;
      setAnalysisStatus(missing > 0.5
        ? `Analysis complete. ${missing.toFixed(1)}% of the selected area has no usable data.`
        : "Analysis complete. The selected area has usable elevation coverage.");
    } catch (error) {
      setAnalysisStatus(error instanceof Error ? error.message : "The GeoTIFF could not be analysed.");
    } finally {
      setAnalysing(false);
    }
  }

  function focusElevationPoint(point: ElevationPoint) {
    mapRef.current?.flyTo({ center: [point.longitude, point.latitude], zoom: Math.max(zoom, 12), duration: 900, essential: true });
  }

  const measurements = selection ? selectionMeasurements(selection) : null;
  const layerMaximum = analysis?.maximum.elevation ?? 0;
  const layerValidation = analysis && layerBoundaries.length ? validateLayerBoundaries(layerBoundaries, layerMaximum) : "";

  return (
    <main className={`workspace ${drawing ? "is-drawing" : ""}`}>
      <div ref={mapNode} className="map" aria-label="Interactive map of New Zealand" />

      <header className="topbar">
        <button className="brand" onClick={resetNewZealand} aria-label="Return to the New Zealand overview">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>topo</strong>mapper</span>
        </button>
        <div className="stage-pill"><span /> Stage 4 · Layers</div>
      </header>

      <section className="search-panel" aria-label="Place search">
        <div className="panel-heading">
          <span className="eyebrow">NEW ZEALAND WORKSPACE</span>
          <h1>Choose a landscape</h1>
          <p>Find the landscape, then mark the exact area for your physical map.</p>
        </div>

        <form className="search-form" onSubmit={searchPlaces}>
          <label htmlFor="place-search">Place name</label>
          <div className="search-row">
            <input
              id="place-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Mount Taranaki"
              autoComplete="off"
            />
            <button type="submit" disabled={searching || !query.trim()}>{searching ? "…" : "Find"}</button>
          </div>
          <span className="search-message" role="status">{searchMessage}</span>
        </form>

        {results.length > 0 && (
          <div className="search-results">
            {results.map((result) => (
              <button key={`${result.lat}-${result.lon}`} onClick={() => selectResult(result)}>
                <strong>{result.display_name.split(",")[0]}</strong>
                <span>{result.display_name.split(",").slice(1, 3).join(",")}</span>
              </button>
            ))}
          </div>
        )}

        <div className="quick-places">
          <span className="section-label">QUICK LOCATIONS</span>
          {QUICK_PLACES.map((place) => (
            <button key={place.name} onClick={() => showPlace(place)}>
              <span className="location-dot" aria-hidden="true" />
              <span><strong>{place.name}</strong><small>{place.subtitle}</small></span>
              <b aria-hidden="true">›</b>
            </button>
          ))}
        </div>
      </section>

      <aside className="selection-panel" aria-label="Area selection and elevation analysis">
        <div className="selection-heading">
          <span className="section-label">MODEL AREA</span>
          <strong>{selection ? "Selection ready" : "Draw a rectangle"}</strong>
          <p role="status">{selectionStatus}</p>
        </div>

        <button className={`draw-button ${drawing ? "active" : ""}`} onClick={startDrawing}>
          <span aria-hidden="true" />
          {drawing ? "Cancel drawing" : selection ? "Draw a new area" : "Draw area"}
        </button>

        {selection && measurements ? (
          <div className="selection-details">
            <dl className="measurement-grid">
              <div><dt>Ground width</dt><dd>{formatDistance(measurements.width)}</dd></div>
              <div><dt>Ground height</dt><dd>{formatDistance(measurements.height)}</dd></div>
              <div className="area-measure"><dt>Ground area</dt><dd>{formatArea(measurements.area)}</dd></div>
            </dl>
            <div className="bounds-grid" aria-label="Selection bounds">
              <div><span>North</span><strong>{selection.north.toFixed(5)}°</strong></div>
              <div><span>West</span><strong>{selection.west.toFixed(5)}°</strong></div>
              <div><span>East</span><strong>{selection.east.toFixed(5)}°</strong></div>
              <div><span>South</span><strong>{selection.south.toFixed(5)}°</strong></div>
            </div>
            <p className="handle-hint"><i aria-hidden="true" /> Drag the four corner handles to adjust.</p>
          </div>
        ) : (
          <div className="empty-selection">
            <span aria-hidden="true"><i /><i /><i /><i /></span>
            <p>Choose <strong>Draw area</strong>, then drag diagonally across the map.</p>
          </div>
        )}

        <div className="selection-actions">
          <button onClick={saveExample} disabled={!selection}>Save example</button>
          <button onClick={openSavedExample} disabled={!hasSavedExample}>Open saved</button>
          <button onClick={clearSelection} disabled={!selection}>Clear</button>
          <button onClick={resetTaranakiExample}>Reset Taranaki</button>
        </div>

        <section className="elevation-section" aria-labelledby="elevation-heading">
          <div className="elevation-heading-row">
            <div>
              <span className="section-label">ELEVATION DATA</span>
              <strong id="elevation-heading">Analyse GeoTIFF mosaic</strong>
            </div>
            <span className={`processor-state ${processorStatus}`}>
              <i aria-hidden="true" />
              {processorStatus === "ready" ? "Local ready" : processorStatus === "checking" ? "Checking" : "Offline"}
            </span>
          </div>

          <form className="elevation-form" onSubmit={analyseElevation}>
            <label className="file-picker">
              <input
                type="file"
                accept=".tif,.tiff,image/tiff"
                multiple
                onChange={(event) => chooseElevationFiles(Array.from(event.target.files ?? []))}
              />
              <span aria-hidden="true">＋</span>
              <span>
                <strong>{elevationFiles.length ? "Change GeoTIFF selection" : "Choose GeoTIFFs"}</strong>
                <small>{elevationFiles.length
                  ? elevationFiles.length === 1 ? elevationFiles[0].name : `${elevationFiles.length} tiles: ${elevationFiles.map((file) => file.name).join(", ")}`
                  : "Select all adjoining LINZ bare-earth tiles together"}</small>
              </span>
            </label>
            {processorStatus === "unavailable" ? (
              <button type="button" className="processor-retry" onClick={retryProcessor}>Check processor again</button>
            ) : (
              <button
                type="submit"
                className="analyse-button"
                disabled={!selection || !elevationFiles.length || analysing || processorStatus !== "ready"}
              >
                {analysing ? "Analysing…" : elevationFiles.length > 1 ? `Combine ${elevationFiles.length} tiles and analyse` : "Analyse selected area"}
              </button>
            )}
          </form>
          <p className={`analysis-status ${analysisStatus.includes("no usable") || analysisStatus.includes("not running") || analysisStatus.includes("could not") ? "warning" : ""}`} role="status">{analysisStatus}</p>
          <a
            className="linz-data-link"
            href="https://www.linz.govt.nz/products-services/data/types-linz-data/elevation-data/access-elevation-data"
            target="_blank"
            rel="noreferrer"
          >
            Open LINZ elevation downloads <span aria-hidden="true">↗</span>
          </a>

          {analysis && (
            <div className="analysis-results">
              <div className="extrema-grid">
                <button onClick={() => focusElevationPoint(analysis.minimum)}>
                  <span><i className="low" aria-hidden="true" /> Lowest</span>
                  <strong>{formatElevation(analysis.minimum.elevation)}</strong>
                  <small>{analysis.minimum.latitude.toFixed(5)}°, {analysis.minimum.longitude.toFixed(5)}° · {analysis.minimum.source_filename}</small>
                </button>
                <button onClick={() => focusElevationPoint(analysis.maximum)}>
                  <span><i className="high" aria-hidden="true" /> Highest</span>
                  <strong>{formatElevation(analysis.maximum.elevation)}</strong>
                  <small>{analysis.maximum.latitude.toFixed(5)}°, {analysis.maximum.longitude.toFixed(5)}° · {analysis.maximum.source_filename}</small>
                </button>
              </div>
              <div className="terrain-legend" aria-label="Elevation preview colour scale">
                <span>Low</span><i /><span>High</span>
              </div>
              <dl className="dataset-summary">
                <div><dt>Coverage</dt><dd>{analysis.coverage.valid_data_percent.toFixed(1)}%</dd></div>
                <div><dt>Tiles used</dt><dd>{analysis.datasets.filter((dataset) => dataset.overlaps_selection).length} of {analysis.datasets.length}</dd></div>
                <div><dt>Cell size</dt><dd>{Array.from(new Set(analysis.datasets.map((dataset) => `${dataset.resolution_x.toFixed(1)} × ${dataset.resolution_y.toFixed(1)} m`))).join(", ")}</dd></div>
                <div><dt>Coordinates</dt><dd>{Array.from(new Set(analysis.datasets.map((dataset) => dataset.crs))).join(", ")}</dd></div>
                <div><dt>Vertical datum</dt><dd>{Array.from(new Set(analysis.datasets.map((dataset) => dataset.vertical_datum))).join(", ")}</dd></div>
              </dl>
              <p className="dataset-name" title={analysis.datasets.map((dataset) => dataset.filename).join(", ")}>{analysis.datasets.map((dataset) => dataset.filename).join(" + ")}</p>
            </div>
          )}
        </section>

        {analysis && layerBoundaries.length > 0 && (
          <section className="layer-editor" aria-labelledby="layer-editor-heading">
            <div className="layer-editor-heading">
              <div>
                <span className="section-label">PHYSICAL LAYERS</span>
                <strong id="layer-editor-heading">Elevation boundaries</strong>
              </div>
              <span className={`layer-ready ${layerValidation ? "invalid" : ""}`}>
                {layerValidation ? "Needs attention" : `${layerBoundaries.length - 1} layers`}
              </span>
            </div>
            <p className="layer-intro">Choose non-linear heights for the plywood stack. Sea level and the analysed maximum stay fixed.</p>

            <div className="elevation-range" aria-label={`Elevation boundaries from 0 to ${formatBoundaryValue(layerMaximum)} metres`}>
              <div className="range-bar" />
              {layerBoundaries.map((boundary) => {
                const value = parseBoundary(boundary);
                if (!Number.isFinite(value)) return null;
                return (
                  <span
                    key={boundary.id}
                    className={`range-tick ${boundary.role}`}
                    style={{ left: `${Math.max(0, Math.min(100, value / layerMaximum * 100))}%`, backgroundColor: layerColour(value, layerMaximum) }}
                    title={`${formatBoundaryValue(value)} m`}
                  />
                );
              })}
              <div className="range-labels"><span>Sea level · 0 m</span><span>Maximum · {formatBoundaryValue(layerMaximum)} m</span></div>
            </div>

            <div className="preset-row" aria-label="Layer boundary presets">
              <button className={layerPreset === "suggested" ? "active" : ""} onClick={() => applyLayerPreset("suggested")}>Suggested</button>
              <button className={layerPreset === "equal" ? "active" : ""} onClick={() => applyLayerPreset("equal")}>10 equal</button>
              <button className={layerPreset === "hundreds" ? "active" : ""} onClick={() => applyLayerPreset("hundreds")}>Every 100 m</button>
            </div>

            <form className="add-boundary" onSubmit={(event) => { event.preventDefault(); addLayerBoundary(); }}>
              <label htmlFor="new-boundary">Add boundary</label>
              <div><input id="new-boundary" type="number" step="any" min="0" max={layerMaximum} value={newBoundaryValue} onChange={(event) => setNewBoundaryValue(event.target.value)} placeholder="e.g. 1250" /><span>m</span><button type="submit">Add</button></div>
            </form>

            <ol className="boundary-list">
              {layerBoundaries.map((boundary, index) => {
                const value = parseBoundary(boundary);
                const isCustom = boundary.role === "custom";
                return (
                  <li key={boundary.id} className={!Number.isFinite(value) ? "invalid" : ""}>
                    <span className="layer-swatch" style={{ backgroundColor: Number.isFinite(value) ? layerColour(value, layerMaximum) : "#d35a36" }} />
                    <span className="boundary-label">
                      <small>{boundary.role === "sea-level" ? "SEA LEVEL" : boundary.role === "maximum" ? "ANALYSED MAXIMUM" : `BOUNDARY ${index}`}</small>
                      {isCustom ? (
                        <span><input type="number" step="any" value={boundary.value} onChange={(event) => editLayerBoundary(boundary.id, event.target.value)} aria-label={`Boundary ${index} elevation`} /> m</span>
                      ) : <strong>{formatBoundaryValue(value)} m</strong>}
                    </span>
                    <span className="boundary-controls">
                      <button onClick={() => moveLayerBoundary(boundary.id, -1)} disabled={!isCustom || index <= 1} aria-label={`Move ${boundary.value} metre boundary up`}>↑</button>
                      <button onClick={() => moveLayerBoundary(boundary.id, 1)} disabled={!isCustom || index >= layerBoundaries.length - 2} aria-label={`Move ${boundary.value} metre boundary down`}>↓</button>
                      <button className="remove" onClick={() => removeLayerBoundary(boundary.id)} disabled={!isCustom} aria-label={`Remove ${boundary.value} metre boundary`}>×</button>
                    </span>
                  </li>
                );
              })}
            </ol>

            <p className={`layer-status ${layerValidation ? "warning" : ""}`} role="status">{layerValidation || layerStatus}</p>
            {!layerValidation && (
              <div className="layer-summary"><strong>{layerBoundaries.length - 1}</strong><span>physical elevation bands ready for Stage 5 geometry</span></div>
            )}
          </section>
        )}
      </aside>

      <footer className="statusbar">
        <div><span className={`status-light ${mapStatus === "Map ready" ? "ready" : ""}`} />{mapStatus}</div>
        <div className="coordinates">
          <span>{formatCoordinate(cursor.latitude, "N", "S")}</span>
          <span>{formatCoordinate(cursor.longitude, "E", "W")}</span>
          <span>Zoom {zoom.toFixed(1)}</span>
        </div>
        <div>Map data © OpenStreetMap · OpenFreeMap</div>
      </footer>
    </main>
  );
}
