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
const SELECTION_SOURCE = "topomapper-selection";
const LAST_SELECTION_KEY = "topomapper:selection:last";
const SAVED_EXAMPLE_KEY = "topomapper:selection:example";
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

export function MapWorkspace() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapLibreRef = useRef<typeof import("maplibre-gl").default | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const selectionMarkersRef = useRef<Partial<Record<SelectionCorner, MapLibreMarker>>>({});
  const selectionRef = useRef<SelectionBounds | null>(null);
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
        marker = new maplibregl.Marker({ element: handle, draggable: true, anchor: "center" }).addTo(map);
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

  function applySelection(bounds: SelectionBounds | null, persist = false) {
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
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibreRef.current = null;
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

  const measurements = selection ? selectionMeasurements(selection) : null;

  return (
    <main className={`workspace ${drawing ? "is-drawing" : ""}`}>
      <div ref={mapNode} className="map" aria-label="Interactive map of New Zealand" />

      <header className="topbar">
        <button className="brand" onClick={resetNewZealand} aria-label="Return to the New Zealand overview">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>topo</strong>mapper</span>
        </button>
        <div className="stage-pill"><span /> Stage 2 · Select</div>
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

      <aside className="selection-panel" aria-label="Area selection">
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
