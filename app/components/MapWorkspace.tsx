"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

type LayerDistribution = "log" | "linear";
type OutputFormat = "free" | "12x8" | "a2" | "square" | "custom";
type OutputOrientation = "landscape" | "portrait";
type StackView = "three-dimensional" | "side" | "top";
type WorkspaceView = "two-dimensional" | "three-dimensional" | "assembly" | "manufacturing" | "smoothing" | "sheet-layout";

type FilledLayer = {
  index: number;
  lower_elevation: number;
  upper_elevation: number;
  piece_count: number;
  hole_count: number;
  cell_count: number;
};

type FilledLayerFeature = {
  type: "Feature";
  properties: {
    layer_index: number;
    lower_elevation: number;
    upper_elevation: number;
    colour?: string;
  };
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

type FilledLayerPreview = {
  selection: SelectionBounds;
  boundaries: number[];
  grid: { width: number; height: number };
  layers: FilledLayer[];
  feature_collection: { type: "FeatureCollection"; features: FilledLayerFeature[] };
};

type PhysicalPart = {
  id: string;
  layerIndex: number;
  feature: FilledLayerFeature;
  labelPoint: [number, number];
  areaMm2: number;
  labelClearanceMm: number;
  machineLabel: boolean;
};

type RegistrationHole = {
  id: string;
  kind: "grid" | "vent";
  xMm: number;
  yMm: number;
  longitude: number;
  latitude: number;
  drilledLayers: number[];
  capLayer: number;
  partIds: string[];
};

type AssemblyPlan = {
  parts: PhysicalPart[];
  holes: RegistrationHole[];
  ventComplete: boolean;
  warnings: string[];
};

type LayoutPart = {
  id: string;
  layerIndex: number;
  width: number;
  height: number;
  areaMm2: number;
  labelPoint: { x: number; y: number };
  machineLabel: boolean;
  rings: { x: number; y: number }[][];
  holes: { x: number; y: number; kind: "grid" | "vent" }[];
};

type SheetPlacement = {
  id: string;
  partId: string;
  sheetIndex: number;
  x: number;
  y: number;
  rotation: number;
};

type SheetRules = {
  width: number;
  height: number;
  thickness: number;
  edgeMargin: number;
  partSpacing: number;
};

type LayoutViolation = {
  placementIds: string[];
  message: string;
};

type TopomapperProject = {
  format: "topomapper-project";
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  selection: SelectionBounds | null;
  query: string;
  elevation: {
    sourceFilenames: string[];
    analysis: ElevationAnalysis | null;
    filledLayerPreview: FilledLayerPreview | null;
    visibleLayerIndices: number[];
  };
  output: {
    format: OutputFormat;
    orientation: OutputOrientation;
    customWidthMm: number;
    customHeightMm: number;
    materialThicknessMm: number;
  };
  layers: {
    distribution: LayerDistribution;
    count: number;
    boundaries: LayerBoundary[];
  };
  model: {
    stackView: StackView;
    stackYaw: number;
    stackPitch: number;
    showTrueElevation: boolean;
    smoothingLevels: Record<number, number>;
  };
  assembly: {
    gridPitchMm: number;
    dowelDiameterMm: number;
    holeDiameterMm: number;
    holeEdgeClearanceMm: number;
  };
  layout: {
    sheetRules: SheetRules;
    sheetCount: number;
    activeSheetIndex: number;
    placements: SheetPlacement[];
    rotationStepDeg?: number;
  };
  view: {
    workspaceView: WorkspaceView;
    assemblyLayerIndex: number;
    smoothingLayerIndex: number;
  };
};

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
const FILLED_LAYER_SOURCE = "topomapper-filled-layers";
const FILLED_LAYER_FILL = "topomapper-filled-layers-fill";
const FILLED_LAYER_OUTLINE = "topomapper-filled-layers-outline";
const LAST_SELECTION_KEY = "topomapper:selection:last";
const SAVED_EXAMPLE_KEY = "topomapper:selection:example";
const LAYER_PLAN_KEY = "topomapper:layer-plan";
const SHEET_LAYOUT_KEY = "topomapper:sheet-layout-v1";
const OUTPUT_PLAN_KEY = "topomapper:output-plan";
const ASSEMBLY_PLAN_KEY = "topomapper:assembly-settings";
const PROJECT_DB_NAME = "topomapper-projects";
const PROJECT_STORE_NAME = "projects";
const ACTIVE_PROJECT_KEY = "topomapper:active-project";
const DEFAULT_LAYER_COUNT = 10;
const MIN_LAYER_COUNT = 2;
const MAX_LAYER_COUNT = 40;
const LOG_CURVE_STRENGTH = 2.2;
const EARTH_RADIUS_METRES = 6_371_008.8;

function openProjectDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(PROJECT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROJECT_STORE_NAME)) request.result.createObjectStore(PROJECT_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The project library could not be opened."));
  });
}

async function projectStoreRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openProjectDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_STORE_NAME, mode);
    const request = operation(transaction.objectStore(PROJECT_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The project library operation failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("The project library operation failed.")); };
  });
}

function listStoredProjects() {
  return projectStoreRequest<TopomapperProject[]>("readonly", (store) => store.getAll());
}

function readStoredProject(id: string) {
  return projectStoreRequest<TopomapperProject | undefined>("readonly", (store) => store.get(id));
}

function writeStoredProject(project: TopomapperProject) {
  return projectStoreRequest<IDBValidKey>("readwrite", (store) => store.put(project));
}

function projectFilename(name: string) {
  const safe = name.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "topomapper-project";
  return `${safe}.topomapper`;
}

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

function constrainBoundsToAspect(
  anchorLongitude: number,
  anchorLatitude: number,
  pointerLongitude: number,
  pointerLatitude: number,
  aspectRatio: number | null,
) {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return normaliseBounds(anchorLongitude, anchorLatitude, pointerLongitude, pointerLatitude);
  }
  const centreLatitude = (anchorLatitude + pointerLatitude) / 2;
  const longitudeMetres = 111_320 * Math.max(0.1, Math.cos(toRadians(centreLatitude)));
  const latitudeMetres = 111_132;
  let width = Math.abs(pointerLongitude - anchorLongitude) * longitudeMetres;
  let height = Math.abs(pointerLatitude - anchorLatitude) * latitudeMetres;
  if (width / Math.max(height, 0.001) > aspectRatio) height = width / aspectRatio;
  else width = height * aspectRatio;
  const longitude = anchorLongitude + Math.sign(pointerLongitude - anchorLongitude || 1) * width / longitudeMetres;
  const latitude = anchorLatitude + Math.sign(pointerLatitude - anchorLatitude || 1) * height / latitudeMetres;
  return normaliseBounds(anchorLongitude, anchorLatitude, longitude, latitude);
}

function fitBoundsToAspect(bounds: SelectionBounds, aspectRatio: number) {
  const measured = selectionMeasurements(bounds);
  const centreLongitude = (bounds.west + bounds.east) / 2;
  const centreLatitude = (bounds.south + bounds.north) / 2;
  const area = measured.width * measured.height;
  const width = Math.sqrt(area * aspectRatio);
  const height = width / aspectRatio;
  const longitudeMetres = 111_320 * Math.max(0.1, Math.cos(toRadians(centreLatitude)));
  const latitudeMetres = 111_132;
  return {
    west: centreLongitude - width / 2 / longitudeMetres,
    east: centreLongitude + width / 2 / longitudeMetres,
    south: centreLatitude - height / 2 / latitudeMetres,
    north: centreLatitude + height / 2 / latitudeMetres,
  };
}

function outputDimensions(format: OutputFormat, orientation: OutputOrientation, customWidth: number, customHeight: number) {
  let dimensions: { width: number; height: number; label: string } | null;
  if (format === "12x8") dimensions = { width: 304.8, height: 203.2, label: "12 × 8 inch" };
  else if (format === "a2") dimensions = { width: 594, height: 420, label: "A2" };
  else if (format === "square") dimensions = { width: 300, height: 300, label: "Square" };
  else if (format === "custom" && customWidth > 0 && customHeight > 0) dimensions = { width: customWidth, height: customHeight, label: "Custom" };
  else dimensions = null;
  if (dimensions && orientation === "portrait" && format !== "square") {
    [dimensions.width, dimensions.height] = [dimensions.height, dimensions.width];
  }
  return dimensions;
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

function presetBoundaries(distribution: LayerDistribution, maximum: number, layerCount: number): LayerBoundary[] {
  const count = Math.max(MIN_LAYER_COUNT, Math.min(MAX_LAYER_COUNT, Math.round(layerCount)));
  const values = Array.from({ length: count + 1 }, (_, index) => {
    if (index === 0) return 0;
    if (index === count) return maximum;
    const position = index / count;
    const value = distribution === "linear"
      ? maximum * position
      : maximum * Math.expm1(LOG_CURVE_STRENGTH * position) / Math.expm1(LOG_CURVE_STRENGTH);
    return Math.round(value * 10) / 10;
  });
  return boundarySet(values, maximum, distribution);
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

function darkenColour(colour: string, amount = 0.7) {
  const components = colour.slice(1).match(/.{2}/g)?.map((value) => Math.round(parseInt(value, 16) * amount)) ?? [50, 70, 60];
  return `rgb(${components.join(",")})`;
}

function partLetter(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function physicalPoint(preview: FilledLayerPreview, modelWidth: number, modelHeight: number, point: number[]) {
  return {
    x: (point[0] - preview.selection.west) / (preview.selection.east - preview.selection.west) * modelWidth,
    y: (preview.selection.north - point[1]) / (preview.selection.north - preview.selection.south) * modelHeight,
  };
}

function geographicPoint(preview: FilledLayerPreview, modelWidth: number, modelHeight: number, x: number, y: number): [number, number] {
  return [
    preview.selection.west + x / modelWidth * (preview.selection.east - preview.selection.west),
    preview.selection.north - y / modelHeight * (preview.selection.north - preview.selection.south),
  ];
}

function pointInRing(point: [number, number], ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [longitude, latitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    if ((latitude > point[1]) !== (previousLatitude > point[1])
      && point[0] < (previousLongitude - longitude) * (point[1] - latitude) / (previousLatitude - latitude) + longitude) inside = !inside;
  }
  return inside;
}

function pointInFeature(point: [number, number], feature: FilledLayerFeature) {
  const [outer, ...holes] = feature.geometry.coordinates;
  return Boolean(outer && pointInRing(point, outer) && !holes.some((ring) => pointInRing(point, ring)));
}

function distanceToSegment(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const position = Math.max(0, Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / lengthSquared));
  return Math.hypot(point.x - (start.x + position * (end.x - start.x)), point.y - (start.y + position * (end.y - start.y)));
}

function featureClearanceMm(preview: FilledLayerPreview, feature: FilledLayerFeature, modelWidth: number, modelHeight: number, point: [number, number]) {
  const physical = physicalPoint(preview, modelWidth, modelHeight, point);
  let clearance = Number.POSITIVE_INFINITY;
  feature.geometry.coordinates.forEach((ring) => {
    for (let index = 1; index < ring.length; index += 1) {
      clearance = Math.min(clearance, distanceToSegment(
        physical,
        physicalPoint(preview, modelWidth, modelHeight, ring[index - 1]),
        physicalPoint(preview, modelWidth, modelHeight, ring[index]),
      ));
    }
  });
  return clearance;
}

function featureAreaMm2(preview: FilledLayerPreview, feature: FilledLayerFeature, modelWidth: number, modelHeight: number) {
  const ringArea = (ring: number[][]) => Math.abs(ring.reduce((total, point, index) => {
    const current = physicalPoint(preview, modelWidth, modelHeight, point);
    const next = physicalPoint(preview, modelWidth, modelHeight, ring[(index + 1) % ring.length]);
    return total + current.x * next.y - next.x * current.y;
  }, 0) / 2);
  const [outer, ...holes] = feature.geometry.coordinates;
  return Math.max(0, ringArea(outer) - holes.reduce((total, ring) => total + ringArea(ring), 0));
}

function ringAreaMm2(preview: FilledLayerPreview, ring: number[][], modelWidth: number, modelHeight: number) {
  return Math.abs(ring.reduce((total, point, index) => {
    const current = physicalPoint(preview, modelWidth, modelHeight, point);
    const next = physicalPoint(preview, modelWidth, modelHeight, ring[(index + 1) % ring.length]);
    return total + current.x * next.y - next.x * current.y;
  }, 0) / 2);
}

function smoothRing(ring: number[][], selection: SelectionBounds, iterations: number) {
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  let points = (closed ? ring.slice(0, -1) : ring).map((point) => [...point]);
  const tolerance = 1e-10;
  const onFrame = (point: number[]) => Math.abs(point[0] - selection.west) < tolerance
    || Math.abs(point[0] - selection.east) < tolerance
    || Math.abs(point[1] - selection.south) < tolerance
    || Math.abs(point[1] - selection.north) < tolerance;
  for (let iteration = 0; iteration < iterations && points.length >= 4; iteration += 1) {
    points = points.map((point, index) => {
      if (onFrame(point)) return point;
      const previous = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      return [(previous[0] + point[0] * 2 + next[0]) / 4, (previous[1] + point[1] * 2 + next[1]) / 4];
    });
  }
  return points.length ? [...points, [...points[0]]] : ring;
}

function applySmoothing(
  preview: FilledLayerPreview,
  levels: Record<number, number>,
  modelWidth: number,
  modelHeight: number,
): FilledLayerPreview {
  const pixelSize = Math.max(0.1, Math.min(modelWidth / preview.grid.width, modelHeight / preview.grid.height));
  const features = preview.feature_collection.features.flatMap((feature) => {
    const level = levels[feature.properties.layer_index] ?? 0;
    if (level <= 0) return [feature];
    const iterations = Math.max(1, Math.min(6, Math.round(level / pixelSize)));
    const coordinates = feature.geometry.coordinates.map((ring) => smoothRing(ring, preview.selection, iterations));
    const candidate: FilledLayerFeature = { ...feature, geometry: { ...feature.geometry, coordinates } };
    const minimumArea = Math.PI * (level / 2) ** 2;
    if (featureAreaMm2(preview, candidate, modelWidth, modelHeight) < minimumArea) return [];
    const [outer, ...holes] = coordinates;
    return [{ ...candidate, geometry: { ...candidate.geometry, coordinates: [outer, ...holes.filter((ring) => ringAreaMm2(preview, ring, modelWidth, modelHeight) >= minimumArea)] } }];
  });
  const layers = preview.layers.map((layer) => {
    const layerFeatures = features.filter((feature) => feature.properties.layer_index === layer.index);
    return {
      ...layer,
      piece_count: layerFeatures.length,
      hole_count: layerFeatures.reduce((total, feature) => total + Math.max(0, feature.geometry.coordinates.length - 1), 0),
    };
  });
  return { ...preview, layers, feature_collection: { ...preview.feature_collection, features } };
}

function layerGeometryMetrics(preview: FilledLayerPreview, layerIndex: number, modelWidth: number, modelHeight: number) {
  const features = preview.feature_collection.features.filter((feature) => feature.properties.layer_index === layerIndex);
  const partAreas = features.map((feature) => featureAreaMm2(preview, feature, modelWidth, modelHeight));
  const holeAreas = features.flatMap((feature) => feature.geometry.coordinates.slice(1).map((ring) => ringAreaMm2(preview, ring, modelWidth, modelHeight)));
  return {
    parts: features.length,
    holes: holeAreas.length,
    smallestPart: partAreas.length ? Math.min(...partAreas) : 0,
    smallestHole: holeAreas.length ? Math.min(...holeAreas) : 0,
  };
}

function featureLabelPoint(preview: FilledLayerPreview, feature: FilledLayerFeature, modelWidth: number, modelHeight: number): { point: [number, number]; clearance: number } {
  const outer = feature.geometry.coordinates[0];
  const longitudes = outer.map((point) => point[0]);
  const latitudes = outer.map((point) => point[1]);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  let bestPoint: [number, number] = outer[0] as [number, number];
  let bestClearance = -1;
  for (let row = 0; row <= 16; row += 1) {
    for (let column = 0; column <= 16; column += 1) {
      const candidate: [number, number] = [west + (east - west) * (column + 0.5) / 17, south + (north - south) * (row + 0.5) / 17];
      if (!pointInFeature(candidate, feature)) continue;
      const clearance = featureClearanceMm(preview, feature, modelWidth, modelHeight, candidate);
      if (clearance > bestClearance) { bestPoint = candidate; bestClearance = clearance; }
    }
  }
  return { point: bestPoint, clearance: Math.max(0, bestClearance) };
}

function buildPhysicalParts(preview: FilledLayerPreview, modelWidth: number, modelHeight: number) {
  const prepared = preview.feature_collection.features.map((feature) => {
    const label = featureLabelPoint(preview, feature, modelWidth, modelHeight);
    return {
      feature,
      layerIndex: feature.properties.layer_index,
      labelPoint: label.point,
      labelClearanceMm: label.clearance,
      areaMm2: featureAreaMm2(preview, feature, modelWidth, modelHeight),
    };
  });
  const result: PhysicalPart[] = [];
  preview.layers.forEach((layer) => {
    const layerParts = prepared.filter((part) => part.layerIndex === layer.index);
    const largest = [...layerParts].sort((left, right) => right.areaMm2 - left.areaMm2)[0];
    const ordered = largest ? [largest, ...layerParts.filter((part) => part !== largest).sort((left, right) => right.labelPoint[1] - left.labelPoint[1] || left.labelPoint[0] - right.labelPoint[0])] : [];
    ordered.forEach((part, index) => {
      const coveringPart = prepared.find((candidate) => candidate.layerIndex === part.layerIndex + 1 && pointInFeature(part.labelPoint, candidate.feature));
      const coveringClearance = coveringPart
        ? featureClearanceMm(preview, coveringPart.feature, modelWidth, modelHeight, part.labelPoint)
        : 0;
      result.push({
        ...part,
        id: `L${String(layer.index + 1).padStart(2, "0")}${partLetter(index)}`,
        machineLabel: part.labelClearanceMm >= 9 && coveringClearance >= 9 && part.areaMm2 >= 300,
      });
    });
  });
  return result;
}

function buildAssemblyPlan(
  preview: FilledLayerPreview,
  modelWidth: number,
  modelHeight: number,
  gridPitch: number,
  holeDiameter: number,
  edgeClearance: number,
): AssemblyPlan {
  const parts = buildPhysicalParts(preview, modelWidth, modelHeight);
  const partsByLayer = preview.layers.map((layer) => parts.filter((part) => part.layerIndex === layer.index));
  const requiredClearance = holeDiameter / 2 + edgeClearance;

  const validateHole = (
    xMm: number,
    yMm: number,
    kind: "grid" | "vent",
    id: string,
    maximumCapLayer?: number,
  ): RegistrationHole | null => {
    if (xMm <= 0 || yMm <= 0 || xMm >= modelWidth || yMm >= modelHeight) return null;
    const point = geographicPoint(preview, modelWidth, modelHeight, xMm, yMm);
    const stack: PhysicalPart[] = [];
    const finalLayer = maximumCapLayer ?? partsByLayer.length - 1;
    for (let layerIndex = 0; layerIndex <= finalLayer; layerIndex += 1) {
      const layerParts = partsByLayer[layerIndex];
      const part = layerParts.find((candidate) => pointInFeature(point, candidate.feature));
      if (!part) break;
      stack.push(part);
    }
    if (stack.length < 2 || (maximumCapLayer !== undefined && stack.length !== maximumCapLayer + 1)) return null;
    if (stack.some((part) => featureClearanceMm(preview, part.feature, modelWidth, modelHeight, point) < requiredClearance)) return null;
    const cap = stack[stack.length - 1];
    const drilled = stack.slice(0, -1);
    return {
      id,
      kind,
      xMm,
      yMm,
      longitude: point[0],
      latitude: point[1],
      drilledLayers: drilled.map((part) => part.layerIndex),
      capLayer: cap.layerIndex,
      partIds: drilled.map((part) => part.id),
    };
  };

  const regular: RegistrationHole[] = [];
  const pitch = Math.max(20, gridPitch);
  for (let y = pitch / 2; y < modelHeight; y += pitch) {
    for (let x = pitch / 2; x < modelWidth; x += pitch) {
      const hole = validateHole(x, y, "grid", `G${regular.length + 1}`);
      if (hole) regular.push(hole);
    }
  }

  // Every terminal contour is a separate peak branch. Start at its highest
  // layer and descend until the same peak location has enough material for a
  // covered hole. The resulting vent drills through every supporting layer to
  // the base, while the chosen cap layer remains intact above it.
  const peakParts = parts
    .filter((part) => part.layerIndex > 0 && !parts.some((candidate) => (
      candidate.layerIndex === part.layerIndex + 1
      && pointInFeature(candidate.labelPoint, part.feature)
    )))
    .sort((left, right) => right.layerIndex - left.layerIndex || right.labelClearanceMm - left.labelClearanceMm);
  const vents: RegistrationHole[] = [];
  const minimumVentSpacing = Math.max(holeDiameter * 2, requiredClearance * 2);
  for (const peak of peakParts) {
    const position = physicalPoint(preview, modelWidth, modelHeight, peak.labelPoint);
    if (vents.some((vent) => Math.hypot(vent.xMm - position.x, vent.yMm - position.y) < minimumVentSpacing)) continue;
    for (let capLayer = peak.layerIndex; capLayer >= 1; capLayer -= 1) {
      const vent = validateHole(position.x, position.y, "vent", `V${vents.length + 1}`, capLayer);
      if (vent) {
        vents.push(vent);
        break;
      }
    }
  }

  const holes = [...vents, ...regular.filter((hole) => !vents.some((vent) => Math.hypot(vent.xMm - hole.xMm, vent.yMm - hole.yMm) < minimumVentSpacing))];
  const warnings: string[] = [];
  if (!vents.length) warnings.push("No peak-to-base vent could fit safely; use the north marks and buried grid holes for alignment.");
  if (!holes.length) warnings.push("No alignment hole has enough buried material and edge clearance.");
  const unlabelled = parts.filter((part) => !part.machineLabel).length;
  if (unlabelled) warnings.push(`${unlabelled} small part${unlabelled === 1 ? " is" : "s are"} too small for reliable machining text; use the assembly sheet.`);
  return { parts, holes, ventComplete: vents.length > 0, warnings };
}

function buildLayoutParts(preview: FilledLayerPreview, plan: AssemblyPlan, modelWidth: number, modelHeight: number): LayoutPart[] {
  return plan.parts.map((part) => {
    const physicalRings = part.feature.geometry.coordinates.map((ring) => ring.map((point) => physicalPoint(preview, modelWidth, modelHeight, point)));
    const points = physicalRings.flat();
    const minimumX = Math.min(...points.map((point) => point.x));
    const maximumX = Math.max(...points.map((point) => point.x));
    const minimumY = Math.min(...points.map((point) => point.y));
    const maximumY = Math.max(...points.map((point) => point.y));
    const physicalLabel = physicalPoint(preview, modelWidth, modelHeight, part.labelPoint);
    return {
      id: part.id,
      layerIndex: part.layerIndex,
      width: maximumX - minimumX,
      height: maximumY - minimumY,
      areaMm2: part.areaMm2,
      labelPoint: { x: physicalLabel.x - minimumX, y: physicalLabel.y - minimumY },
      machineLabel: part.machineLabel,
      rings: physicalRings.map((ring) => ring.map((point) => ({ x: point.x - minimumX, y: point.y - minimumY }))),
      holes: plan.holes.filter((hole) => hole.partIds.includes(part.id)).map((hole) => ({ x: hole.xMm - minimumX, y: hole.yMm - minimumY, kind: hole.kind })),
    };
  });
}

function placementSize(placement: SheetPlacement, part: LayoutPart) {
  const radians = placement.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }]
    .map((point) => ({ x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine }));
  return { width: Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x)), height: Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y)) };
}

function placementBounds(placement: SheetPlacement, part: LayoutPart) {
  const size = placementSize(placement, part);
  return { left: placement.x, top: placement.y, right: placement.x + size.width, bottom: placement.y + size.height, ...size };
}

function checkLayoutRules(placements: SheetPlacement[], parts: LayoutPart[], rules: SheetRules): LayoutViolation[] {
  const partMap = new Map(parts.map((part) => [part.id, part]));
  const violations: LayoutViolation[] = [];
  placements.forEach((placement) => {
    const part = partMap.get(placement.partId);
    if (!part) return;
    const bounds = placedPartBounds(placement, part);
    if (bounds.left < rules.edgeMargin || bounds.top < rules.edgeMargin || bounds.right > rules.width - rules.edgeMargin || bounds.bottom > rules.height - rules.edgeMargin) {
      violations.push({ placementIds: [placement.id], message: `${placement.partId} enters the ${rules.edgeMargin} mm sheet-edge no-cut zone.` });
    }
  });
  placements.forEach((left, index) => {
    const leftPart = partMap.get(left.partId);
    if (!leftPart) return;
    const leftBounds = placedPartBounds(left, leftPart);
    placements.slice(index + 1).forEach((right) => {
      if (left.sheetIndex !== right.sheetIndex) return;
      const rightPart = partMap.get(right.partId);
      if (!rightPart) return;
      const rightBounds = placedPartBounds(right, rightPart);
      const broadlySeparated = leftBounds.right + rules.partSpacing <= rightBounds.left
        || rightBounds.right + rules.partSpacing <= leftBounds.left
        || leftBounds.bottom + rules.partSpacing <= rightBounds.top
        || rightBounds.bottom + rules.partSpacing <= leftBounds.top;
      if (broadlySeparated) return;
      const clearance = layoutPartClearance(left, leftPart, right, rightPart);
      if (clearance < rules.partSpacing) violations.push({ placementIds: [left.id, right.id], message: `${left.partId} and ${right.partId} have ${clearance.toFixed(1)} mm clearance; the rule requires ${rules.partSpacing} mm.` });
    });
  });
  return violations;
}

function candidateFitsConservative(candidate: SheetPlacement, placements: SheetPlacement[], partMap: Map<string, LayoutPart>, rules: SheetRules) {
  const part = partMap.get(candidate.partId);
  if (!part) return false;
  const bounds = placementBounds(candidate, part);
  if (bounds.left < rules.edgeMargin || bounds.top < rules.edgeMargin || bounds.right > rules.width - rules.edgeMargin || bounds.bottom > rules.height - rules.edgeMargin) return false;
  return placements.every((placement) => {
    if (placement.sheetIndex !== candidate.sheetIndex) return true;
    const otherPart = partMap.get(placement.partId);
    if (!otherPart) return true;
    const other = placementBounds(placement, otherPart);
    return bounds.right + rules.partSpacing <= other.left
      || other.right + rules.partSpacing <= bounds.left
      || bounds.bottom + rules.partSpacing <= other.top
      || other.bottom + rules.partSpacing <= bounds.top;
  });
}

function candidateFitsExact(candidate: SheetPlacement, placements: SheetPlacement[], partMap: Map<string, LayoutPart>, rules: SheetRules) {
  const part = partMap.get(candidate.partId);
  if (!part) return false;
  const bounds = placedPartBounds(candidate, part);
  if (bounds.left < rules.edgeMargin || bounds.top < rules.edgeMargin || bounds.right > rules.width - rules.edgeMargin || bounds.bottom > rules.height - rules.edgeMargin) return false;
  return placements.every((placement) => {
    if (placement.sheetIndex !== candidate.sheetIndex) return true;
    const otherPart = partMap.get(placement.partId);
    if (!otherPart) return true;
    const otherBounds = placedPartBounds(placement, otherPart);
    if (bounds.right + rules.partSpacing <= otherBounds.left || otherBounds.right + rules.partSpacing <= bounds.left || bounds.bottom + rules.partSpacing <= otherBounds.top || otherBounds.bottom + rules.partSpacing <= bounds.top) return true;
    return layoutPartClearance(candidate, part, placement, otherPart) >= rules.partSpacing;
  });
}

function placementAtOutlineOrigin(instance: { id: string; partId: string }, part: LayoutPart, sheetIndex: number, left: number, top: number, rotation: number) {
  const provisional: SheetPlacement = { id: instance.id, partId: instance.partId, sheetIndex, x: 0, y: 0, rotation };
  const bounds = placedPartBounds(provisional, part);
  return { ...provisional, x: left - bounds.left, y: top - bounds.top };
}

function layoutFitness(placements: SheetPlacement[], partMap: Map<string, LayoutPart>, rules: SheetRules) {
  const sheets = [...new Set(placements.map((placement) => placement.sheetIndex))].sort((left, right) => left - right);
  let usedWidth = 0;
  let envelopeArea = 0;
  sheets.forEach((sheetIndex) => {
    const bounds = placements.filter((placement) => placement.sheetIndex === sheetIndex).map((placement) => {
      const part = partMap.get(placement.partId);
      return part ? placedPartBounds(placement, part) : null;
    }).filter((value): value is ReturnType<typeof placedPartBounds> => Boolean(value));
    if (!bounds.length) return;
    const right = Math.max(...bounds.map((bound) => bound.right));
    const bottom = Math.max(...bounds.map((bound) => bound.bottom));
    usedWidth += right - rules.edgeMargin;
    envelopeArea += Math.max(0, right - rules.edgeMargin) * Math.max(0, bottom - rules.edgeMargin);
  });
  const sheetArea = Math.max(1, rules.width * rules.height);
  return sheets.length * 1e12 + envelopeArea / sheetArea * 1e6 + usedWidth / Math.max(1, rules.width) * 1e3;
}

function simplifyLayoutPartForSearch(part: LayoutPart, maximumPoints = 64): LayoutPart {
  return {
    ...part,
    rings: part.rings.map((ring) => {
      if (ring.length <= maximumPoints) return ring;
      const step = Math.max(1, Math.ceil(ring.length / maximumPoints));
      const required = new Set([0, ring.length - 1]);
      let minimumX = 0;
      let maximumX = 0;
      let minimumY = 0;
      let maximumY = 0;
      ring.forEach((point, index) => {
        if (point.x < ring[minimumX].x) minimumX = index;
        if (point.x > ring[maximumX].x) maximumX = index;
        if (point.y < ring[minimumY].y) minimumY = index;
        if (point.y > ring[maximumY].y) maximumY = index;
        if (index % step === 0) required.add(index);
      });
      required.add(minimumX);
      required.add(maximumX);
      required.add(minimumY);
      required.add(maximumY);
      return [...required].sort((left, right) => left - right).map((index) => ring[index]);
    }),
  };
}

function greedyNestingAttempt(instances: { id: string; partId: string; preferredRotation: number }[], parts: LayoutPart[], rules: SheetRules, rotationStep: number, attempt: number) {
  // Search with a lightweight outline so a detailed coastline cannot monopolise
  // or crash the browser. Every proposed improvement is checked against the
  // original full-resolution rings before it is published.
  const partMap = new Map(parts.map((part) => simplifyLayoutPartForSearch(part)).map((part) => [part.id, part]));
  const randomised = instances.map((instance) => ({
    instance,
    sortWeight: (partMap.get(instance.partId)?.areaMm2 ?? 0) * (attempt === 0 ? 1 : .82 + Math.random() * .36),
  })).sort((left, right) => right.sortWeight - left.sortWeight).map((item) => item.instance);
  const placed: SheetPlacement[] = [];
  let sheetCount = 1;
  for (const instance of randomised) {
    const part = partMap.get(instance.partId);
    if (!part) continue;
    const rotationCount = Math.max(1, Math.floor(360 / rotationStep));
    const rotations = [...new Set([
      instance.preferredRotation % 360,
      0, 90, 180, 270,
      ...Array.from({ length: Math.min(10, rotationCount) }, (_, index) => ((attempt * 7 + index * Math.max(1, Math.floor(rotationCount / 10))) % rotationCount) * rotationStep),
    ].map((value) => ((Math.round(value / rotationStep) * rotationStep) % 360 + 360) % 360))];
    let best: SheetPlacement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
      const existing = placed.filter((placement) => placement.sheetIndex === sheetIndex);
      const anchors: { left: number; top: number }[] = [{ left: rules.edgeMargin, top: rules.edgeMargin }];
      existing.forEach((placement) => {
        const existingPart = partMap.get(placement.partId);
        if (!existingPart) return;
        const bounds = placedPartBounds(placement, existingPart);
        anchors.push(
          { left: bounds.right + rules.partSpacing, top: bounds.top },
          { left: bounds.left, top: bounds.bottom + rules.partSpacing },
          { left: bounds.right + rules.partSpacing, top: rules.edgeMargin },
          { left: rules.edgeMargin, top: bounds.bottom + rules.partSpacing },
        );
      });
      for (let sample = 0; sample < 10; sample += 1) anchors.push({
        left: rules.edgeMargin + Math.pow(Math.random(), 1.8) * Math.max(0, rules.width - rules.edgeMargin * 2 - part.width),
        top: rules.edgeMargin + Math.random() * Math.max(0, rules.height - rules.edgeMargin * 2 - part.height),
      });
      for (const rotation of rotations) {
        for (const anchor of anchors) {
          const candidate = placementAtOutlineOrigin(instance, part, sheetIndex, anchor.left, anchor.top, rotation);
          if (!candidateFitsExact(candidate, placed, partMap, rules)) continue;
          const bounds = placedPartBounds(candidate, part);
          const score = sheetIndex * 1e10 + bounds.bottom * 1e5 + bounds.right;
          if (score < bestScore) { best = candidate; bestScore = score; }
        }
      }
    }
    if (!best) {
      const sheetIndex = sheetCount;
      for (const rotation of rotations) {
        const candidate = placementAtOutlineOrigin(instance, part, sheetIndex, rules.edgeMargin, rules.edgeMargin, rotation);
        if (candidateFitsExact(candidate, placed, partMap, rules)) { best = candidate; break; }
      }
      if (best) sheetCount += 1;
    }
    if (!best) return null;
    placed.push(best);
  }
  return placed;
}

function rotateLayoutPoint(point: { x: number; y: number }, part: LayoutPart, rotation: SheetPlacement["rotation"]) {
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }]
    .map((corner) => ({ x: corner.x * cosine - corner.y * sine, y: corner.x * sine + corner.y * cosine }));
  const minimumX = Math.min(...corners.map((corner) => corner.x));
  const minimumY = Math.min(...corners.map((corner) => corner.y));
  return { x: point.x * cosine - point.y * sine - minimumX, y: point.x * sine + point.y * cosine - minimumY };
}

function placedPartRings(placement: SheetPlacement, part: LayoutPart) {
  return part.rings.map((ring) => ring.map((point) => {
    const rotated = rotateLayoutPoint(point, part, placement.rotation);
    return [rotated.x + placement.x, rotated.y + placement.y];
  }));
}

function placedPartBounds(placement: SheetPlacement, part: LayoutPart) {
  const points = placedPartRings(placement, part).flat();
  const left = Math.min(...points.map((point) => point[0]));
  const top = Math.min(...points.map((point) => point[1]));
  const right = Math.max(...points.map((point) => point[0]));
  const bottom = Math.max(...points.map((point) => point[1]));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function pointHitsPlacedPart(point: { x: number; y: number }, placement: SheetPlacement, part: LayoutPart, minimumHitSizeMm: number) {
  const rings = placedPartRings(placement, part);
  const coordinates: [number, number] = [point.x, point.y];
  if (pointInRing(coordinates, rings[0]) && !rings.slice(1).some((ring) => pointInRing(coordinates, ring))) return true;
  const bounds = placedPartBounds(placement, part);
  if (bounds.width >= minimumHitSizeMm && bounds.height >= minimumHitSizeMm) return false;
  const hitRadius = minimumHitSizeMm / 2;
  if (point.x < bounds.left - hitRadius || point.x > bounds.right + hitRadius || point.y < bounds.top - hitRadius || point.y > bounds.bottom + hitRadius) return false;
  const outer = rings[0];
  for (let index = 1; index < outer.length; index += 1) {
    if (distanceToSegment(point, { x: outer[index - 1][0], y: outer[index - 1][1] }, { x: outer[index][0], y: outer[index][1] }) <= hitRadius) return true;
  }
  return false;
}

function segmentsIntersect(a: number[], b: number[], c: number[], d: number[]) {
  const cross = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSegment = (p: number[], q: number[], r: number[]) => q[0] >= Math.min(p[0], r[0]) - 1e-9 && q[0] <= Math.max(p[0], r[0]) + 1e-9 && q[1] >= Math.min(p[1], r[1]) - 1e-9 && q[1] <= Math.max(p[1], r[1]) + 1e-9;
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  if (((first < 0 && second > 0) || (first > 0 && second < 0)) && ((third < 0 && fourth > 0) || (third > 0 && fourth < 0))) return true;
  return (Math.abs(first) < 1e-9 && onSegment(a, c, b))
    || (Math.abs(second) < 1e-9 && onSegment(a, d, b))
    || (Math.abs(third) < 1e-9 && onSegment(c, a, d))
    || (Math.abs(fourth) < 1e-9 && onSegment(c, b, d));
}

function layoutPartClearance(leftPlacement: SheetPlacement, leftPart: LayoutPart, rightPlacement: SheetPlacement, rightPart: LayoutPart) {
  const leftRings = placedPartRings(leftPlacement, leftPart);
  const rightRings = placedPartRings(rightPlacement, rightPart);
  if (pointInRing(leftRings[0][0] as [number, number], rightRings[0]) && !rightRings.slice(1).some((ring) => pointInRing(leftRings[0][0] as [number, number], ring))) return 0;
  if (pointInRing(rightRings[0][0] as [number, number], leftRings[0]) && !leftRings.slice(1).some((ring) => pointInRing(rightRings[0][0] as [number, number], ring))) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (const leftRing of leftRings) {
    for (let leftIndex = 1; leftIndex < leftRing.length; leftIndex += 1) {
      const leftStart = leftRing[leftIndex - 1];
      const leftEnd = leftRing[leftIndex];
      for (const rightRing of rightRings) {
        for (let rightIndex = 1; rightIndex < rightRing.length; rightIndex += 1) {
          const rightStart = rightRing[rightIndex - 1];
          const rightEnd = rightRing[rightIndex];
          if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) return 0;
          minimum = Math.min(
            minimum,
            distanceToSegment({ x: leftStart[0], y: leftStart[1] }, { x: rightStart[0], y: rightStart[1] }, { x: rightEnd[0], y: rightEnd[1] }),
            distanceToSegment({ x: leftEnd[0], y: leftEnd[1] }, { x: rightStart[0], y: rightStart[1] }, { x: rightEnd[0], y: rightEnd[1] }),
            distanceToSegment({ x: rightStart[0], y: rightStart[1] }, { x: leftStart[0], y: leftStart[1] }, { x: leftEnd[0], y: leftEnd[1] }),
            distanceToSegment({ x: rightEnd[0], y: rightEnd[1] }, { x: leftStart[0], y: leftStart[1] }, { x: leftEnd[0], y: leftEnd[1] }),
          );
        }
      }
    }
  }
  return minimum;
}

function svgNumber(value: number) {
  return Number(value.toFixed(3));
}

function xmlText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const VECTOR_SEGMENTS: Record<string, [number, number, number, number]> = {
  a: [0, 0, 1, 0], b: [1, 0, 1, .5], c: [1, .5, 1, 1], d: [0, 1, 1, 1], e: [0, .5, 0, 1], f: [0, 0, 0, .5],
  g1: [0, .5, .5, .5], g2: [.5, .5, 1, .5], h: [0, 0, .5, .5], i: [1, 0, .5, .5], j: [0, 1, .5, .5], k: [.5, .5, 1, 1],
  l: [.5, 0, .5, .5], m: [.5, .5, .5, 1],
};

const VECTOR_GLYPHS: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"], "1": ["b", "c"], "2": ["a", "b", "g1", "g2", "e", "d"],
  "3": ["a", "b", "c", "d", "g1", "g2"], "4": ["f", "g1", "g2", "b", "c"], "5": ["a", "f", "g1", "g2", "c", "d"],
  "6": ["a", "f", "e", "d", "c", "g1", "g2"], "7": ["a", "b", "c"], "8": ["a", "b", "c", "d", "e", "f", "g1", "g2"],
  "9": ["a", "b", "c", "d", "f", "g1", "g2"], A: ["a", "b", "c", "e", "f", "g1", "g2"], B: ["f", "e", "d", "c", "g1", "g2", "l", "m"],
  C: ["a", "f", "e", "d"], D: ["a", "b", "c", "d", "e", "f"], E: ["a", "f", "e", "d", "g1", "g2"], F: ["a", "f", "e", "g1", "g2"],
  G: ["a", "f", "e", "d", "c", "g2"], H: ["f", "e", "b", "c", "g1", "g2"], I: ["a", "d", "l", "m"], J: ["b", "c", "d", "e"],
  K: ["f", "e", "i", "k"], L: ["f", "e", "d"], M: ["f", "b", "h", "i"], N: ["f", "e", "b", "c", "h", "k"],
  O: ["a", "b", "c", "d", "e", "f"], P: ["a", "b", "f", "e", "g1", "g2"], Q: ["a", "b", "c", "d", "e", "f", "k"],
  R: ["a", "b", "f", "e", "g1", "g2", "k"], S: ["a", "f", "g1", "g2", "c", "d"], T: ["a", "l", "m"],
  U: ["f", "e", "d", "c", "b"], V: ["f", "j", "k", "b"], W: ["f", "e", "b", "c", "j", "k"], X: ["h", "i", "j", "k"],
  Y: ["h", "i", "m"], Z: ["a", "i", "j", "d"], "-": ["g1", "g2"],
};

function abbreviatedPartId(partId: string) {
  return partId.replace(/^L0*/i, "") || partId;
}

function vectorTextWidth(text: string, height: number) {
  return Math.max(0, text.length * height * .72 - height * .14);
}

function vectorTextPath(text: string, centreX: number, centreY: number, height = 4) {
  const content = text.toUpperCase();
  const advance = height * .72;
  const glyphWidth = height * .58;
  const startX = centreX - vectorTextWidth(content, height) / 2;
  const startY = centreY - height / 2;
  const commands: string[] = [];
  [...content].forEach((character, index) => {
    const offsetX = startX + index * advance;
    (VECTOR_GLYPHS[character] ?? ["a", "b", "c", "d", "e", "f"]).forEach((segmentName) => {
      const segment = VECTOR_SEGMENTS[segmentName];
      commands.push(`M${svgNumber(offsetX + segment[0] * glyphWidth)} ${svgNumber(startY + segment[1] * height)} L${svgNumber(offsetX + segment[2] * glyphWidth)} ${svgNumber(startY + segment[3] * height)}`);
    });
  });
  return commands.join(" ");
}

function layoutRingSvgPath(ring: { x: number; y: number }[]) {
  return ring.map((point, index) => `${index === 0 ? "M" : "L"}${svgNumber(point.x)} ${svgNumber(point.y)}`).join(" ") + " Z";
}

function sheetPlacementTransform(placement: SheetPlacement, part: LayoutPart) {
  const radians = placement.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }]
    .map((corner) => ({ x: corner.x * cosine - corner.y * sine, y: corner.x * sine + corner.y * cosine }));
  const minimumX = Math.min(...corners.map((corner) => corner.x));
  const minimumY = Math.min(...corners.map((corner) => corner.y));
  return `translate(${svgNumber(placement.x - minimumX)} ${svgNumber(placement.y - minimumY)}) rotate(${svgNumber(placement.rotation)})`;
}

type SheetWasteLabel = WasteLabel & { placementId: string; shortId: string; width: number; height: number };

function findSheetWasteLabels(placements: SheetPlacement[], parts: LayoutPart[], rules: SheetRules) {
  const partMap = new Map(parts.map((part) => [part.id, part]));
  const labels: SheetWasteLabel[] = [];
  const missing: string[] = [];
  const radii = [14, 20, 28, 38, 50, 65, 85];
  const angles = Array.from({ length: 24 }, (_, index) => index * Math.PI * 2 / 24);
  placements.filter((placement) => !partMap.get(placement.partId)?.machineLabel).forEach((placement) => {
    const part = partMap.get(placement.partId);
    if (!part) return;
    const rotatedLabel = rotateLayoutPoint(part.labelPoint, part, placement.rotation);
    const anchor = { x: rotatedLabel.x + placement.x, y: rotatedLabel.y + placement.y };
    const shortId = abbreviatedPartId(part.id);
    const labelWidth = vectorTextWidth(shortId, 4) + 9;
    const labelHeight = 7;
    let found: SheetWasteLabel | null = null;
    for (const radius of radii) {
      if (found) break;
      for (const angle of angles) {
        const x = anchor.x + Math.cos(angle) * radius;
        const y = anchor.y + Math.sin(angle) * radius;
        if (x - labelWidth / 2 < rules.edgeMargin || x + labelWidth / 2 > rules.width - rules.edgeMargin || y - labelHeight / 2 < rules.edgeMargin || y + labelHeight / 2 > rules.height - rules.edgeMargin) continue;
        if (labels.some((label) => Math.abs(label.x - x) < (label.width + labelWidth) / 2 + 2 && Math.abs(label.y - y) < (label.height + labelHeight) / 2 + 2)) continue;
        if (placements.some((candidate) => {
          const candidatePart = partMap.get(candidate.partId);
          if (!candidatePart) return false;
          const bounds = placedPartBounds(candidate, candidatePart);
          return x + labelWidth / 2 + 2 > bounds.left && x - labelWidth / 2 - 2 < bounds.right && y + labelHeight / 2 + 2 > bounds.top && y - labelHeight / 2 - 2 < bounds.bottom;
        })) continue;
        if (placements.some((candidate) => {
          if (candidate.id === placement.id) return false;
          const candidatePart = partMap.get(candidate.partId);
          return candidatePart && Array.from({ length: 16 }, (_, index) => (index + 1) / 18).some((position) => pointHitsPlacedPart({ x: x + (anchor.x - x) * position, y: y + (anchor.y - y) * position }, candidate, candidatePart, 0));
        })) continue;
        let outside = 0;
        let inside = 1;
        for (let step = 0; step < 20; step += 1) {
          const position = (outside + inside) / 2;
          if (pointHitsPlacedPart({ x: x + (anchor.x - x) * position, y: y + (anchor.y - y) * position }, placement, part, 0)) inside = position;
          else outside = position;
        }
        const distance = Math.max(.001, Math.hypot(anchor.x - x, anchor.y - y));
        const directionX = (anchor.x - x) / distance;
        const directionY = (anchor.y - y) / distance;
        found = {
          partId: part.id,
          placementId: placement.id,
          shortId,
          x,
          y,
          width: labelWidth,
          height: labelHeight,
          leaderStartX: x + directionX * labelWidth * .36,
          leaderStartY: y + directionY * labelHeight * .36,
          leaderEndX: x + (anchor.x - x) * outside - directionX,
          leaderEndY: y + (anchor.y - y) * outside - directionY,
        };
        break;
      }
    }
    if (found) labels.push(found); else missing.push(part.id);
  });
  return { labels, missing };
}

function buildSheetSvg(projectName: string, sheetIndex: number, rules: SheetRules, allParts: LayoutPart[], allPlacements: SheetPlacement[], holeDiameter: number) {
  const placements = allPlacements.filter((placement) => placement.sheetIndex === sheetIndex);
  const partMap = new Map(allParts.map((part) => [part.id, part]));
  const cuts = placements.map((placement) => {
    const part = partMap.get(placement.partId);
    if (!part) return "";
    const paths = part.rings.map((ring) => `<path d="${layoutRingSvgPath(ring)}" />`).join("\n      ");
    return `<g data-placement-id="${xmlText(placement.id)}" data-part-id="${xmlText(part.id)}" transform="${sheetPlacementTransform(placement, part)}">
      ${paths}
    </g>`;
  }).join("\n    ");
  const drills = placements.map((placement) => {
    const part = partMap.get(placement.partId);
    if (!part || !part.holes.length) return "";
    return `<g data-placement-id="${xmlText(placement.id)}" data-part-id="${xmlText(part.id)}" transform="${sheetPlacementTransform(placement, part)}">
      ${part.holes.map((hole) => `<circle data-hole-kind="${hole.kind}" cx="${svgNumber(hole.x)}" cy="${svgNumber(hole.y)}" r="${svgNumber(holeDiameter / 2)}" />`).join("\n      ")}
    </g>`;
  }).join("\n    ");
  const metadata = JSON.stringify({ project: projectName, sheet: sheetIndex + 1, sheet_width_mm: rules.width, sheet_height_mm: rules.height, material_thickness_mm: rules.thickness, part_instances: placements.length, labels: "See the separately generated printable layout guide." });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${svgNumber(rules.width)}mm" height="${svgNumber(rules.height)}mm" viewBox="0 0 ${svgNumber(rules.width)} ${svgNumber(rules.height)}">
  <title>${xmlText(projectName)} · Sheet ${sheetIndex + 1}</title>
  <desc>Finished-size sheet layout. CUT_OUTLINES is through-cut. DRILL_HOLES is through-drill. SHEET_REFERENCE is visual only. Part engraving is intentionally deferred.</desc>
  <metadata>${xmlText(metadata)}</metadata>
  <g id="SHEET_REFERENCE" inkscape:groupmode="layer" inkscape:label="REFERENCE — DO NOT MACHINE" data-operation="reference" fill="none" stroke="#8a8174" stroke-width="0.2" stroke-dasharray="4 3">
    <rect x="0" y="0" width="${svgNumber(rules.width)}" height="${svgNumber(rules.height)}" />
    <rect x="${svgNumber(rules.edgeMargin)}" y="${svgNumber(rules.edgeMargin)}" width="${svgNumber(rules.width - rules.edgeMargin * 2)}" height="${svgNumber(rules.height - rules.edgeMargin * 2)}" />
  </g>
  <g id="DRILL_HOLES" inkscape:groupmode="layer" inkscape:label="DRILL — THROUGH" data-operation="drill-through" data-depth-mm="${svgNumber(rules.thickness)}" fill="none" stroke="#187c91" stroke-width="0.2">
    ${drills}
  </g>
  <g id="CUT_OUTLINES" inkscape:groupmode="layer" inkscape:label="CUT — PROFILE THROUGH (RUN LAST)" data-operation="profile-cut" data-depth-mm="${svgNumber(rules.thickness)}" fill="none" stroke="#c9492a" stroke-width="0.2">
    ${cuts}
  </g>
</svg>`;
  return { svg, partCount: placements.length };
}

function svgPathForFeature(preview: FilledLayerPreview, feature: FilledLayerFeature, modelWidth: number, modelHeight: number) {
  return feature.geometry.coordinates.map((ring) => ring.map((point, index) => {
    const physical = physicalPoint(preview, modelWidth, modelHeight, point);
    return `${index === 0 ? "M" : "L"}${svgNumber(physical.x)} ${svgNumber(physical.y)}`;
  }).join(" ") + " Z").join(" ");
}

type WasteLabel = {
  partId: string;
  x: number;
  y: number;
  leaderStartX: number;
  leaderStartY: number;
  leaderEndX: number;
  leaderEndY: number;
};

function findWasteLabels(
  preview: FilledLayerPreview,
  plan: AssemblyPlan,
  layerIndex: number,
  modelWidth: number,
  modelHeight: number,
) {
  const layerParts = plan.parts.filter((part) => part.layerIndex === layerIndex);
  const labels: WasteLabel[] = [];
  const radii = [14, 20, 28, 38, 50, 65];
  const angles = Array.from({ length: 24 }, (_, index) => index * Math.PI * 2 / 24);
  layerParts.filter((part) => !part.machineLabel).sort((left, right) => right.areaMm2 - left.areaMm2).forEach((part) => {
    const centre = physicalPoint(preview, modelWidth, modelHeight, part.labelPoint);
    const labelRadius = Math.max(6, part.id.length * 1.35);
    let placed: WasteLabel | null = null;
    for (const radius of radii) {
      if (placed) break;
      for (const angle of angles) {
        const x = centre.x + Math.cos(angle) * radius;
        const y = centre.y + Math.sin(angle) * radius;
        if (x < labelRadius + 2 || x > modelWidth - labelRadius - 2 || y < 6 || y > modelHeight - 6) continue;
        if (labels.some((label) => Math.hypot(label.x - x, label.y - y) < labelRadius * 2.4)) continue;
        const geographic = geographicPoint(preview, modelWidth, modelHeight, x, y);
        if (layerParts.some((candidate) => pointInFeature(geographic, candidate.feature))) continue;
        const clearance = Math.min(...layerParts.map((candidate) => featureClearanceMm(preview, candidate.feature, modelWidth, modelHeight, geographic)));
        if (clearance < labelRadius) continue;

        // Find the first edge of this part on the line from the waste label to
        // the part centre. The leader deliberately stops outside the cut path.
        let outside = 0;
        let inside = 1;
        for (let step = 0; step < 18; step += 1) {
          const position = (outside + inside) / 2;
          const sampleX = x + (centre.x - x) * position;
          const sampleY = y + (centre.y - y) * position;
          const sample = geographicPoint(preview, modelWidth, modelHeight, sampleX, sampleY);
          if (pointInFeature(sample, part.feature)) inside = position;
          else outside = position;
        }
        const distance = Math.hypot(centre.x - x, centre.y - y);
        const directionX = (centre.x - x) / distance;
        const directionY = (centre.y - y) / distance;
        const edgeX = x + (centre.x - x) * outside;
        const edgeY = y + (centre.y - y) * outside;
        const leaderBlocked = layerParts.some((candidate) => candidate !== part && Array.from({ length: 12 }, (_, index) => (index + 1) / 13 * outside).some((position) => pointInFeature(
          geographicPoint(preview, modelWidth, modelHeight, x + (centre.x - x) * position, y + (centre.y - y) * position),
          candidate.feature,
        )));
        if (leaderBlocked) continue;
        placed = {
          partId: part.id,
          x,
          y,
          leaderStartX: x + directionX * labelRadius * 0.8,
          leaderStartY: y + directionY * labelRadius * 0.8,
          leaderEndX: edgeX - directionX,
          leaderEndY: edgeY - directionY,
        };
        break;
      }
    }
    if (placed) labels.push(placed);
  });
  return labels;
}

function buildLayerSvgBody(
  preview: FilledLayerPreview,
  plan: AssemblyPlan,
  layerIndex: number,
  modelWidth: number,
  modelHeight: number,
  holeDiameter: number,
) {
  const parts = plan.parts.filter((part) => part.layerIndex === layerIndex);
  const holes = plan.holes.filter((hole) => hole.drilledLayers.includes(layerIndex));
  const wasteLabels = findWasteLabels(preview, plan, layerIndex, modelWidth, modelHeight);
  const cuts = parts.map((part) => `<path data-part-id="${part.id}" d="${svgPathForFeature(preview, part.feature, modelWidth, modelHeight)}" />`).join("\n    ");
  const drills = holes.map((hole) => `<circle data-hole-id="${hole.id}" data-hole-kind="${hole.kind}" cx="${svgNumber(hole.xMm)}" cy="${svgNumber(hole.yMm)}" r="${svgNumber(holeDiameter / 2)}" />`).join("\n    ");
  const engraving = parts.filter((part) => part.machineLabel).map((part) => {
    const position = physicalPoint(preview, modelWidth, modelHeight, part.labelPoint);
    const x = svgNumber(position.x);
    const y = svgNumber(position.y);
    return `<g data-part-id="${part.id}" transform="translate(${x} ${y})">
      <text x="0" y="2" text-anchor="middle">${part.id}</text>
      <path d="M0 -4 L0 -10 M0 -10 L-2 -7 M0 -10 L2 -7" />
    </g>`;
  }).join("\n    ");
  const wasteEngraving = wasteLabels.map((label) => `<g data-part-id="${label.partId}">
      <text x="${svgNumber(label.x)}" y="${svgNumber(label.y + 1.5)}" text-anchor="middle">${label.partId}</text>
      <path d="M${svgNumber(label.leaderStartX)} ${svgNumber(label.leaderStartY)} L${svgNumber(label.leaderEndX)} ${svgNumber(label.leaderEndY)}" />
    </g>`).join("\n    ");
  return `<g id="CUT_OUTLINES" data-operation="profile-cut" fill="none" stroke="#c9492a" stroke-width="0.2">
    ${cuts}
  </g>
  <g id="DRILL_HOLES" data-operation="drill" fill="none" stroke="#187c91" stroke-width="0.2">
    ${drills}
  </g>
  <g id="ENGRAVE" data-operation="engrave" fill="none" stroke="#214f3d" stroke-width="0.3" font-family="Arial, sans-serif" font-size="4">
    ${engraving}
  </g>
  <g id="WASTE_LABELS" data-operation="engrave-waste" fill="none" stroke="#61736a" stroke-width="0.25" font-family="Arial, sans-serif" font-size="4">
    ${wasteEngraving}
  </g>`;
}

function buildLayerSvg(
  preview: FilledLayerPreview,
  plan: AssemblyPlan,
  layerIndex: number,
  modelWidth: number,
  modelHeight: number,
  holeDiameter: number,
  materialThickness: number,
  sourceFiles: string[],
) {
  const layer = preview.layers[layerIndex];
  const layerName = `L${String(layerIndex + 1).padStart(2, "0")}`;
  const metadata = JSON.stringify({
    layer: layerName,
    lower_elevation_m: layer.lower_elevation,
    upper_elevation_m: layer.upper_elevation,
    finished_width_mm: svgNumber(modelWidth),
    finished_height_mm: svgNumber(modelHeight),
    material_thickness_mm: svgNumber(materialThickness),
    source_files: sourceFiles,
    north: "top",
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(modelWidth)}mm" height="${svgNumber(modelHeight)}mm" viewBox="0 0 ${svgNumber(modelWidth)} ${svgNumber(modelHeight)}">
  <title>Topomapper ${layerName} manufacturing geometry</title>
  <desc>North is at the top. Red paths are profile cuts, blue circles are drilled holes, and green paths are covered engraving.</desc>
  <metadata>${xmlText(metadata)}</metadata>
  ${buildLayerSvgBody(preview, plan, layerIndex, modelWidth, modelHeight, holeDiameter)}
</svg>`;
}

function buildOverviewSvg(
  preview: FilledLayerPreview,
  plan: AssemblyPlan,
  modelWidth: number,
  modelHeight: number,
  holeDiameter: number,
) {
  const gap = 12;
  const heading = 10;
  const columns = preview.layers.length > 1 ? 2 : 1;
  const rows = Math.ceil(preview.layers.length / columns);
  const width = columns * modelWidth + (columns - 1) * gap;
  const height = rows * (modelHeight + heading) + Math.max(0, rows - 1) * gap;
  const layers = preview.layers.map((layer) => {
    const column = layer.index % columns;
    const row = Math.floor(layer.index / columns);
    const x = column * (modelWidth + gap);
    const y = row * (modelHeight + heading + gap);
    const name = `L${String(layer.index + 1).padStart(2, "0")}`;
    return `<g id="${name}" transform="translate(${svgNumber(x)} ${svgNumber(y)})">
    <text x="0" y="6" font-family="Arial, sans-serif" font-size="5" fill="#214f3d">${name} · ${svgNumber(layer.lower_elevation)}–${svgNumber(layer.upper_elevation)} m · North ↑</text>
    <g transform="translate(0 ${heading})">
      <rect id="REFERENCE_${name}" width="${svgNumber(modelWidth)}" height="${svgNumber(modelHeight)}" fill="none" stroke="#9ca89f" stroke-width="0.2" stroke-dasharray="2 2" />
      ${buildLayerSvgBody(preview, plan, layer.index, modelWidth, modelHeight, holeDiameter)}
    </g>
  </g>`;
  }).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(width)}mm" height="${svgNumber(height)}mm" viewBox="0 0 ${svgNumber(width)} ${svgNumber(height)}">
  <title>Topomapper manufacturing overview</title>
  <desc>All physical layers shown at finished scale. This overview is for checking and assembly reference, not direct cutting.</desc>
  ${layers}
</svg>`;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(files: { name: string; contents: string }[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  const write16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
  const write32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);
  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.contents);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, 0);
    write16(localView, 12, 33);
    write32(localView, 14, checksum);
    write32(localView, 18, data.length);
    write32(localView, 22, data.length);
    write16(localView, 26, name.length);
    write16(localView, 28, 0);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, 33);
    write32(centralView, 16, checksum);
    write32(centralView, 20, data.length);
    write32(centralView, 24, data.length);
    write16(centralView, 28, name.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  });
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, localOffset);
  write16(endView, 20, 0);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function downloadFile(contents: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StackPreviewCanvas({
  preview,
  visibleLayers,
  modelWidth,
  modelHeight,
  materialThickness,
  groundWidth,
  view,
  yaw,
  showTrueElevation,
  onYawChange,
  pitch,
  onViewChange,
}: {
  preview: FilledLayerPreview;
  visibleLayers: number[];
  modelWidth: number;
  modelHeight: number;
  materialThickness: number;
  groundWidth: number;
  view: StackView;
  yaw: number;
  showTrueElevation: boolean;
  onYawChange: (yaw: number) => void;
  pitch: number;
  onViewChange: (yaw: number, pitch: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rectangle = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rectangle.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(rectangle.height * pixelRatio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, rectangle.width, rectangle.height);

      const elevationAngle = pitch;
      const elevationRadians = toRadians(elevationAngle);
      const yawRadians = toRadians(yaw);
      const maximum = preview.boundaries[preview.boundaries.length - 1] || 1;
      const physicalHeight = preview.layers.length * materialThickness;
      const trueHeight = groundWidth > 0 ? maximum * modelWidth / groundWidth : 0;
      const visibleSet = new Set(visibleLayers);

      const rotate = (x: number, y: number) => ({
        x: x * Math.cos(yawRadians) - y * Math.sin(yawRadians),
        y: x * Math.sin(yawRadians) + y * Math.cos(yawRadians),
      });
      const projectRaw = (longitude: number, latitude: number, z: number) => {
        const x = ((longitude - preview.selection.west) / (preview.selection.east - preview.selection.west) - 0.5) * modelWidth;
        // Canvas Y grows downward, so latitude must be inverted to keep north
        // at the top and east on the right, matching the 2D map.
        const y = (0.5 - (latitude - preview.selection.south) / (preview.selection.north - preview.selection.south)) * modelHeight;
        const rotated = rotate(x, y);
        return { x: rotated.x, y: rotated.y * Math.sin(elevationRadians) - z * Math.cos(elevationRadians) };
      };

      const extentPoints = [
        [preview.selection.west, preview.selection.south],
        [preview.selection.east, preview.selection.south],
        [preview.selection.east, preview.selection.north],
        [preview.selection.west, preview.selection.north],
      ].flatMap(([longitude, latitude]) => [projectRaw(longitude, latitude, 0), projectRaw(longitude, latitude, Math.max(physicalHeight, showTrueElevation ? trueHeight : 0))]);
      const minX = Math.min(...extentPoints.map((point) => point.x));
      const maxX = Math.max(...extentPoints.map((point) => point.x));
      const minY = Math.min(...extentPoints.map((point) => point.y));
      const maxY = Math.max(...extentPoints.map((point) => point.y));
      const padding = 24;
      const scale = Math.min((rectangle.width - padding * 2) / Math.max(1, maxX - minX), (rectangle.height - padding * 2) / Math.max(1, maxY - minY));
      const offsetX = rectangle.width / 2 - (minX + maxX) / 2 * scale;
      const offsetY = rectangle.height / 2 - (minY + maxY) / 2 * scale;
      const project = (longitude: number, latitude: number, z: number) => {
        const point = projectRaw(longitude, latitude, z);
        return { x: point.x * scale + offsetX, y: point.y * scale + offsetY };
      };

      const traceRing = (ring: number[][], z: number) => {
        ring.forEach(([longitude, latitude], index) => {
          const point = project(longitude, latitude, z);
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
      };

      const base = preview.selection;
      context.beginPath();
      traceRing([[base.west, base.south], [base.east, base.south], [base.east, base.north], [base.west, base.north]], 0);
      context.fillStyle = "rgba(238,235,226,.7)";
      context.fill();
      context.strokeStyle = "rgba(34,56,47,.25)";
      context.lineWidth = 1;
      context.stroke();

      preview.layers.forEach((layer) => {
        if (!visibleSet.has(layer.index)) return;
        const bottom = layer.index * materialThickness;
        const top = bottom + materialThickness;
        const colour = layerColour(layer.lower_elevation, maximum);
        const features = preview.feature_collection.features.filter((feature) => feature.properties.layer_index === layer.index);
        features.forEach((feature) => {
          feature.geometry.coordinates.forEach((ring) => {
            for (let index = 1; index < ring.length; index += 1) {
              const [longitudeA, latitudeA] = ring[index - 1];
              const [longitudeB, latitudeB] = ring[index];
              const bottomA = project(longitudeA, latitudeA, bottom);
              const bottomB = project(longitudeB, latitudeB, bottom);
              const topB = project(longitudeB, latitudeB, top);
              const topA = project(longitudeA, latitudeA, top);
              context.beginPath();
              context.moveTo(bottomA.x, bottomA.y);
              context.lineTo(bottomB.x, bottomB.y);
              context.lineTo(topB.x, topB.y);
              context.lineTo(topA.x, topA.y);
              context.closePath();
              context.fillStyle = darkenColour(colour);
              context.fill();
            }
          });
          context.beginPath();
          feature.geometry.coordinates.forEach((ring) => traceRing(ring, top));
          context.fillStyle = colour;
          context.fill("evenodd");
          context.strokeStyle = "rgba(28,49,40,.62)";
          context.lineWidth = 0.7;
          context.stroke();
        });
      });

      if (showTrueElevation && pitch < 88) {
        preview.layers.forEach((layer) => {
          const z = groundWidth > 0 ? layer.lower_elevation * modelWidth / groundWidth : 0;
          preview.feature_collection.features
            .filter((feature) => feature.properties.layer_index === layer.index)
            .forEach((feature) => feature.geometry.coordinates.forEach((ring) => {
              context.beginPath();
              traceRing(ring, z);
              context.strokeStyle = "rgba(196,79,45,.72)";
              context.setLineDash([4, 3]);
              context.lineWidth = 1;
              context.stroke();
              context.setLineDash([]);
            }));
        });
      }

      const compassPoints = [
        { label: "N", longitude: (base.west + base.east) / 2, latitude: base.north },
        { label: "E", longitude: base.east, latitude: (base.south + base.north) / 2 },
        { label: "S", longitude: (base.west + base.east) / 2, latitude: base.south },
        { label: "W", longitude: base.west, latitude: (base.south + base.north) / 2 },
      ];
      context.fillStyle = "rgba(25,35,31,.78)";
      context.font = "700 11px Inter, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      compassPoints.forEach(({ label, longitude, latitude }) => {
        const point = project(longitude, latitude, 0);
        context.fillText(label, point.x, point.y);
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [preview, visibleLayers, modelWidth, modelHeight, materialThickness, groundWidth, view, yaw, pitch, showTrueElevation]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Interactive three-dimensional preview of the equal-thickness physical layer stack"
      onPointerDown={(event) => { dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        const nextYaw = (dragRef.current.yaw + event.clientX - dragRef.current.x + 360) % 360;
        const nextPitch = Math.max(0, Math.min(90, dragRef.current.pitch - (event.clientY - dragRef.current.y) * 0.45));
        onYawChange(nextYaw);
        onViewChange(nextYaw, nextPitch);
      }}
      onPointerUp={(event) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { dragRef.current = null; }}
    />
  );
}

function AssemblyPreviewCanvas({
  preview,
  plan,
  layerIndex,
  modelWidth,
  modelHeight,
  holeDiameter,
}: {
  preview: FilledLayerPreview;
  plan: AssemblyPlan;
  layerIndex: number;
  modelWidth: number;
  modelHeight: number;
  holeDiameter: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rectangle = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rectangle.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(rectangle.height * pixelRatio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, rectangle.width, rectangle.height);
      const padding = 58;
      const scale = Math.min((rectangle.width - padding * 2) / modelWidth, (rectangle.height - padding * 2) / modelHeight);
      const offsetX = (rectangle.width - modelWidth * scale) / 2;
      const offsetY = (rectangle.height - modelHeight * scale) / 2;
      const projectMm = (x: number, y: number) => ({ x: offsetX + x * scale, y: offsetY + y * scale });
      const projectGeo = (point: number[]) => {
        const physical = physicalPoint(preview, modelWidth, modelHeight, point);
        return projectMm(physical.x, physical.y);
      };
      const layer = preview.layers[layerIndex];
      const parts = plan.parts.filter((part) => part.layerIndex === layerIndex);

      context.fillStyle = "rgba(255,255,255,.62)";
      context.fillRect(offsetX, offsetY, modelWidth * scale, modelHeight * scale);
      context.strokeStyle = "rgba(33,79,61,.28)";
      context.lineWidth = 1;
      context.strokeRect(offsetX, offsetY, modelWidth * scale, modelHeight * scale);

      parts.forEach((part) => {
        context.beginPath();
        part.feature.geometry.coordinates.forEach((ring) => {
          ring.forEach((point, index) => {
            const projected = projectGeo(point);
            if (index === 0) context.moveTo(projected.x, projected.y);
            else context.lineTo(projected.x, projected.y);
          });
          context.closePath();
        });
        context.fillStyle = layerColour(layer.lower_elevation, preview.boundaries[preview.boundaries.length - 1]);
        context.fill("evenodd");
        context.strokeStyle = "rgba(28,49,40,.72)";
        context.lineWidth = 1;
        context.stroke();

        const label = projectGeo(part.labelPoint);
        context.fillStyle = "rgba(20,34,28,.9)";
        context.font = `${part.machineLabel ? "700" : "500"} 12px Inter, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(`${part.id} ↑N`, label.x, label.y);
        if (!part.machineLabel) {
          context.font = "500 9px Inter, sans-serif";
          context.fillText("assembly sheet", label.x, label.y + 13);
        }
      });

      plan.holes.filter((hole) => hole.drilledLayers.includes(layerIndex)).forEach((hole) => {
        const point = projectMm(hole.xMm, hole.yMm);
        context.beginPath();
        context.arc(point.x, point.y, Math.max(3, holeDiameter / 2 * scale), 0, Math.PI * 2);
        context.fillStyle = hole.kind === "vent" ? "#d35a36" : "#f6f3eb";
        context.fill();
        context.strokeStyle = hole.kind === "vent" ? "#8f3118" : "#214f3d";
        context.lineWidth = hole.kind === "vent" ? 2 : 1.2;
        context.stroke();
      });

      const arrowX = offsetX + modelWidth * scale - 24;
      const arrowY = offsetY + 34;
      context.fillStyle = "#214f3d";
      context.beginPath();
      context.moveTo(arrowX, arrowY - 18);
      context.lineTo(arrowX - 7, arrowY - 4);
      context.lineTo(arrowX + 7, arrowY - 4);
      context.closePath();
      context.fill();
      context.strokeStyle = "#214f3d";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(arrowX, arrowY - 4);
      context.lineTo(arrowX, arrowY + 13);
      context.stroke();
      context.font = "700 11px Inter, sans-serif";
      context.textAlign = "center";
      context.fillText("N", arrowX, arrowY + 24);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [preview, plan, layerIndex, modelWidth, modelHeight, holeDiameter]);

  return <canvas ref={canvasRef} aria-label={`Assembly and machining preview for layer ${layerIndex + 1}`} />;
}

function SmoothingPreviewCanvas({
  original,
  smoothed,
  layerIndex,
  modelWidth,
  modelHeight,
  zoom,
}: {
  original: FilledLayerPreview;
  smoothed: FilledLayerPreview;
  layerIndex: number;
  modelWidth: number;
  modelHeight: number;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rectangle = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rectangle.width * ratio));
      canvas.height = Math.max(1, Math.round(rectangle.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, rectangle.width, rectangle.height);
      const padding = 45;
      const baseScale = Math.min((rectangle.width - padding * 2) / modelWidth, (rectangle.height - padding * 2) / modelHeight);
      const scale = baseScale * zoom;
      const offsetX = rectangle.width / 2 - modelWidth * scale / 2;
      const offsetY = rectangle.height / 2 - modelHeight * scale / 2;
      const trace = (preview: FilledLayerPreview, ring: number[][]) => ring.forEach((point, index) => {
        const physical = physicalPoint(preview, modelWidth, modelHeight, point);
        const x = offsetX + physical.x * scale;
        const y = offsetY + physical.y * scale;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.save();
      context.beginPath();
      context.rect(Math.max(0, offsetX), Math.max(0, offsetY), modelWidth * scale, modelHeight * scale);
      context.clip();
      original.feature_collection.features.filter((feature) => feature.properties.layer_index === layerIndex).forEach((feature) => {
        context.beginPath();
        feature.geometry.coordinates.forEach((ring) => { trace(original, ring); context.closePath(); });
        context.setLineDash([3, 3]);
        context.strokeStyle = "rgba(201,73,42,.55)";
        context.lineWidth = 1;
        context.stroke();
      });
      smoothed.feature_collection.features.filter((feature) => feature.properties.layer_index === layerIndex).forEach((feature) => {
        context.beginPath();
        feature.geometry.coordinates.forEach((ring) => { trace(smoothed, ring); context.closePath(); });
        context.setLineDash([]);
        context.fillStyle = "rgba(75,149,105,.28)";
        context.fill("evenodd");
        context.strokeStyle = "#214f3d";
        context.lineWidth = 1.3;
        context.stroke();
      });
      context.restore();
      context.strokeStyle = "rgba(33,79,61,.25)";
      context.strokeRect(offsetX, offsetY, modelWidth * scale, modelHeight * scale);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [original, smoothed, layerIndex, modelWidth, modelHeight, zoom]);
  return <canvas ref={canvasRef} aria-label={`Original dotted outline and smoothed manufacturing outline for layer ${layerIndex + 1}`} />;
}

function SheetLayoutCanvas({
  rules,
  parts,
  placements,
  sheetIndex,
  selectedId,
  violations,
  highlightedIds,
  zoom,
  viewCenter,
  onSelect,
  onMove,
  onPan,
  onDragStateChange,
}: {
  rules: SheetRules;
  parts: LayoutPart[];
  placements: SheetPlacement[];
  sheetIndex: number;
  selectedId: string | null;
  violations: LayoutViolation[];
  highlightedIds: string[];
  zoom: number;
  viewCenter: { x: number; y: number };
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onPan: (centre: { x: number; y: number }) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef<({ kind: "part"; id: string; offsetX: number; offsetY: number } | { kind: "pan"; clientX: number; clientY: number; centreX: number; centreY: number }) | null>(null);
  const pendingMoveRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const moveFrameRef = useRef<number | null>(null);
  const partMap = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts]);
  const sheetPlacements = placements.filter((placement) => placement.sheetIndex === sheetIndex);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rectangle = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rectangle.width * ratio));
      canvas.height = Math.max(1, Math.round(rectangle.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, rectangle.width, rectangle.height);
      const padding = 28;
      const fitScale = Math.min((rectangle.width - padding * 2) / rules.width, (rectangle.height - padding * 2) / rules.height);
      const scale = fitScale * zoom;
      const offsetX = rectangle.width / 2 - viewCenter.x * scale;
      const offsetY = rectangle.height / 2 - viewCenter.y * scale;
      transformRef.current = { scale, offsetX, offsetY };
      context.fillStyle = "#d9c7a6";
      context.fillRect(offsetX, offsetY, rules.width * scale, rules.height * scale);
      context.strokeStyle = "rgba(91,65,38,.3)";
      context.lineWidth = 1;
      for (let x = 100; x < rules.width; x += 100) {
        context.beginPath(); context.moveTo(offsetX + x * scale, offsetY); context.lineTo(offsetX + x * scale, offsetY + rules.height * scale); context.stroke();
      }
      for (let y = 100; y < rules.height; y += 100) {
        context.beginPath(); context.moveTo(offsetX, offsetY + y * scale); context.lineTo(offsetX + rules.width * scale, offsetY + y * scale); context.stroke();
      }
      context.strokeStyle = "#a6462e";
      context.setLineDash([5, 4]);
      context.strokeRect(offsetX + rules.edgeMargin * scale, offsetY + rules.edgeMargin * scale, (rules.width - rules.edgeMargin * 2) * scale, (rules.height - rules.edgeMargin * 2) * scale);
      context.setLineDash([]);
      const violating = new Set(violations.flatMap((violation) => violation.placementIds));
      sheetPlacements.forEach((placement) => {
        const part = partMap.get(placement.partId);
        if (!part) return;
        context.save();
        context.translate(offsetX + placement.x * scale, offsetY + placement.y * scale);
        context.beginPath();
        part.rings[0].forEach((point, index) => {
          const rotated = rotateLayoutPoint(point, part, placement.rotation);
          if (index === 0) context.moveTo(rotated.x * scale, rotated.y * scale); else context.lineTo(rotated.x * scale, rotated.y * scale);
        });
        context.closePath();
        context.strokeStyle = violating.has(placement.id) ? "rgba(189,60,37,.45)" : "rgba(29,111,130,.24)";
        context.lineWidth = Math.max(2, rules.partSpacing * scale);
        context.stroke();
        part.rings.forEach((ring, ringIndex) => {
          context.beginPath();
          ring.forEach((point, index) => {
            const rotated = rotateLayoutPoint(point, part, placement.rotation);
            if (index === 0) context.moveTo(rotated.x * scale, rotated.y * scale); else context.lineTo(rotated.x * scale, rotated.y * scale);
          });
          context.closePath();
          if (ringIndex === 0) {
            context.fillStyle = `hsl(${112 - part.layerIndex * 4} 28% ${72 - Math.min(30, part.layerIndex * 2)}%)`;
            context.fill();
          }
        });
        context.strokeStyle = placement.id === selectedId ? "#1d6f82" : highlightedIds.includes(placement.id) ? "#d18a18" : violating.has(placement.id) ? "#bd3c25" : "#214f3d";
        context.lineWidth = placement.id === selectedId || highlightedIds.includes(placement.id) ? 2.8 : 1.2;
        part.rings.forEach((ring) => {
          context.beginPath();
          ring.forEach((point, index) => {
            const rotated = rotateLayoutPoint(point, part, placement.rotation);
            if (index === 0) context.moveTo(rotated.x * scale, rotated.y * scale); else context.lineTo(rotated.x * scale, rotated.y * scale);
          });
          context.closePath(); context.stroke();
        });
        part.holes.forEach((hole) => {
          const point = rotateLayoutPoint(hole, part, placement.rotation);
          context.beginPath(); context.arc(point.x * scale, point.y * scale, Math.max(2, 2.1 * scale), 0, Math.PI * 2); context.stroke();
        });
        const size = placementSize(placement, part);
        context.fillStyle = "#173c2f";
        context.font = "700 10px Inter, sans-serif";
        context.textAlign = "center";
        context.fillText(`${part.id} · ${placement.rotation}°`, size.width * scale / 2, size.height * scale / 2);
        context.restore();
      });
      context.strokeStyle = "#6e4d2f";
      context.lineWidth = 1.5;
      context.strokeRect(offsetX, offsetY, rules.width * scale, rules.height * scale);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [rules, partMap, sheetPlacements, selectedId, violations, highlightedIds, zoom, viewCenter]);

  const sheetPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rectangle = event.currentTarget.getBoundingClientRect();
    const transform = transformRef.current;
    return { x: (event.clientX - rectangle.left - transform.offsetX) / transform.scale, y: (event.clientY - rectangle.top - transform.offsetY) / transform.scale };
  };
  const flushPendingMove = () => {
    if (moveFrameRef.current !== null) window.cancelAnimationFrame(moveFrameRef.current);
    moveFrameRef.current = null;
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (pending) onMove(pending.id, pending.x, pending.y);
  };
  const finishPointerDrag = () => {
    const wasPartDrag = dragRef.current?.kind === "part";
    if (wasPartDrag) flushPendingMove();
    dragRef.current = null;
    if (wasPartDrag) onDragStateChange(false);
  };
  return <canvas
    ref={canvasRef}
    aria-label={`Manual part layout for material sheet ${sheetIndex + 1}`}
    onPointerDown={(event) => {
      const point = sheetPoint(event);
      const hit = [...sheetPlacements].reverse().find((placement) => {
        const part = partMap.get(placement.partId);
        if (!part) return false;
        const minimumHitSizeMm = 16 / transformRef.current.scale;
        return pointHitsPlacedPart(point, placement, part, minimumHitSizeMm);
      });
      onSelect(hit?.id ?? null);
      if (hit) { dragRef.current = { kind: "part", id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y }; onDragStateChange(true); }
      else if (zoom > 1) dragRef.current = { kind: "pan", clientX: event.clientX, clientY: event.clientY, centreX: viewCenter.x, centreY: viewCenter.y };
      if (dragRef.current) event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (dragRef.current?.kind === "part") {
        const point = sheetPoint(event);
        pendingMoveRef.current = { id: dragRef.current.id, x: point.x - dragRef.current.offsetX, y: point.y - dragRef.current.offsetY };
        if (moveFrameRef.current === null) moveFrameRef.current = window.requestAnimationFrame(() => { moveFrameRef.current = null; const pending = pendingMoveRef.current; pendingMoveRef.current = null; if (pending) onMove(pending.id, pending.x, pending.y); });
      }
      if (dragRef.current?.kind === "pan") {
        const scale = transformRef.current.scale;
        onPan({ x: dragRef.current.centreX - (event.clientX - dragRef.current.clientX) / scale, y: dragRef.current.centreY - (event.clientY - dragRef.current.clientY) / scale });
      }
    }}
    onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finishPointerDrag(); }}
    onPointerCancel={finishPointerDrag}
  />;
}

export function MapWorkspace() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapLibreRef = useRef<typeof import("maplibre-gl").default | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const selectionMarkersRef = useRef<Partial<Record<SelectionCorner, MapLibreMarker>>>({});
  const elevationMarkersRef = useRef<MapLibreMarker[]>([]);
  const selectionRef = useRef<SelectionBounds | null>(null);
  const aspectRatioRef = useRef<number | null>(null);
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
  const [layerDistribution, setLayerDistribution] = useState<LayerDistribution>("log");
  const [layerCount, setLayerCount] = useState(DEFAULT_LAYER_COUNT);
  const [newBoundaryValue, setNewBoundaryValue] = useState("");
  const [layerStatus, setLayerStatus] = useState("Analyse elevation data to begin a layer plan.");
  const [filledLayerPreview, setFilledLayerPreview] = useState<FilledLayerPreview | null>(null);
  const [visibleLayerIndices, setVisibleLayerIndices] = useState<number[]>([]);
  const [generatingLayers, setGeneratingLayers] = useState(false);
  const [layerGenerationStatus, setLayerGenerationStatus] = useState("Choose valid boundaries, then generate the filled 2D preview.");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("free");
  const [outputOrientation, setOutputOrientation] = useState<OutputOrientation>("landscape");
  const [customWidthMm, setCustomWidthMm] = useState(600);
  const [customHeightMm, setCustomHeightMm] = useState(400);
  const [materialThicknessMm, setMaterialThicknessMm] = useState(6);
  const [stackView, setStackView] = useState<StackView>("three-dimensional");
  const [stackYaw, setStackYaw] = useState(0);
  const [stackPitch, setStackPitch] = useState(34);
  const [showTrueElevation, setShowTrueElevation] = useState(true);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("two-dimensional");
  const [assemblyLayerIndex, setAssemblyLayerIndex] = useState(0);
  const [gridPitchMm, setGridPitchMm] = useState(100);
  const [dowelDiameterMm, setDowelDiameterMm] = useState(4);
  const [holeDiameterMm, setHoleDiameterMm] = useState(4.2);
  const [holeEdgeClearanceMm, setHoleEdgeClearanceMm] = useState(6);
  const [exportStatus, setExportStatus] = useState("Manufacturing files are ready to inspect.");
  const [sheetExportStatus, setSheetExportStatus] = useState("Export a finished-size SVG after arranging the parts.");
  const [smoothingLayerIndex, setSmoothingLayerIndex] = useState(0);
  const [smoothingLevels, setSmoothingLevels] = useState<Record<number, number>>({});
  const [smoothingZoom, setSmoothingZoom] = useState(1);
  const [sheetRules, setSheetRules] = useState<SheetRules>({ width: 1200, height: 600, thickness: 3, edgeMargin: 15, partSpacing: 8 });
  const [sheetCount, setSheetCount] = useState(1);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [sheetPlacements, setSheetPlacements] = useState<SheetPlacement[]>([]);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [partLibraryFilter, setPartLibraryFilter] = useState("");
  const [sheetZoom, setSheetZoom] = useState(1);
  const [sheetViewCenter, setSheetViewCenter] = useState({ x: 600, y: 300 });
  const [selectedViolationIndex, setSelectedViolationIndex] = useState<number | null>(null);
  const [sheetPartDragging, setSheetPartDragging] = useState(false);
  const [rotationStepDeg, setRotationStepDeg] = useState(5);
  const [optimizerRunning, setOptimizerRunning] = useState(false);
  const [optimizerStatus, setOptimizerStatus] = useState("Ready to search for a tighter polygon-aware layout.");
  const [layoutSaveStatus, setLayoutSaveStatus] = useState("Layout changes have not been saved locally yet.");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectCreatedAt, setProjectCreatedAt] = useState("");
  const [projectLibrary, setProjectLibrary] = useState<TopomapperProject[]>([]);
  const [projectStatus, setProjectStatus] = useState("Opening project library…");
  const placementCounterRef = useRef(1);
  const layoutViolationsRef = useRef<LayoutViolation[]>([]);
  const layoutDirtyReadyRef = useRef(false);
  const suppressLayoutDirtyRef = useRef(false);
  const projectReadyRef = useRef(false);
  const projectAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimizerWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    setSheetViewCenter({ x: sheetRules.width / 2, y: sheetRules.height / 2 });
    setSheetZoom(1);
  }, [sheetRules.width, sheetRules.height]);
  useEffect(() => () => { optimizerWorkerRef.current?.terminate(); }, []);
  useEffect(() => {
    if (!optimizerWorkerRef.current) return;
    optimizerWorkerRef.current.terminate();
    optimizerWorkerRef.current = null;
    setOptimizerRunning(false);
    setOptimizerStatus("Search stopped because the project or nesting rules changed.");
  }, [projectId, sheetRules.width, sheetRules.height, sheetRules.edgeMargin, sheetRules.partSpacing, rotationStepDeg, smoothingLevels]);
  useEffect(() => {
    const saved = window.localStorage.getItem(SHEET_LAYOUT_KEY);
    if (!saved) return;
    try {
      applySheetLayoutData(JSON.parse(saved));
      setLayoutSaveStatus("Saved sheet layout restored from this browser.");
    } catch {
      setLayoutSaveStatus("The saved sheet layout could not be restored.");
    }
  }, []);
  useEffect(() => {
    if (!layoutDirtyReadyRef.current) { layoutDirtyReadyRef.current = true; return; }
    if (suppressLayoutDirtyRef.current) { suppressLayoutDirtyRef.current = false; return; }
    setLayoutSaveStatus("Layout has unsaved changes.");
  }, [sheetPlacements, sheetRules, smoothingLevels, outputFormat, outputOrientation, customWidthMm, customHeightMm]);
  useEffect(() => {
    let cancelled = false;
    async function initialiseProjects() {
      try {
        const projects = (await listStoredProjects()).sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
        if (cancelled) return;
        setProjectLibrary(projects);
        const activeId = window.localStorage.getItem(ACTIVE_PROJECT_KEY);
        const active = activeId ? projects.find((project) => project.id === activeId) : projects[0];
        if (active) {
          openProjectDocument(active);
          return;
        }
        const recovered = legacyProjectDocument("Recovered landscape 1");
        await writeStoredProject(recovered);
        if (!cancelled) {
          setProjectLibrary([recovered]);
          openProjectDocument(recovered);
          setProjectStatus("Existing Topomapper settings recovered into your first named project.");
        }
      } catch (error) {
        if (!cancelled) setProjectStatus(error instanceof Error ? error.message : "The project library could not be opened.");
      }
    }
    void initialiseProjects();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!projectReadyRef.current || !projectId) return;
    if (projectAutosaveTimerRef.current) clearTimeout(projectAutosaveTimerRef.current);
    setProjectStatus("Changes waiting to autosave…");
    projectAutosaveTimerRef.current = setTimeout(() => { void saveCurrentProject(true); }, 1500);
    return () => { if (projectAutosaveTimerRef.current) clearTimeout(projectAutosaveTimerRef.current); };
  }, [projectId, projectName, selection, query, analysis, filledLayerPreview, visibleLayerIndices, outputFormat, outputOrientation, customWidthMm, customHeightMm, materialThicknessMm, layerDistribution, layerCount, layerBoundaries, stackView, stackYaw, stackPitch, showTrueElevation, smoothingLevels, gridPitchMm, dowelDiameterMm, holeDiameterMm, holeEdgeClearanceMm, sheetRules, sheetCount, activeSheetIndex, sheetPlacements, rotationStepDeg, workspaceView, assemblyLayerIndex, smoothingLayerIndex]);
  const chosenOutput = outputDimensions(outputFormat, outputOrientation, customWidthMm, customHeightMm);
  aspectRatioRef.current = chosenOutput ? chosenOutput.width / chosenOutput.height : null;

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
      case "north-west": return constrainBoundsToAspect(bounds.east, bounds.south, longitude, latitude, aspectRatioRef.current);
      case "north-east": return constrainBoundsToAspect(bounds.west, bounds.south, longitude, latitude, aspectRatioRef.current);
      case "south-east": return constrainBoundsToAspect(bounds.west, bounds.north, longitude, latitude, aspectRatioRef.current);
      case "south-west": return constrainBoundsToAspect(bounds.east, bounds.north, longitude, latitude, aspectRatioRef.current);
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

  function clearFilledLayerOverlay() {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(FILLED_LAYER_OUTLINE)) map.removeLayer(FILLED_LAYER_OUTLINE);
    if (map.getLayer(FILLED_LAYER_FILL)) map.removeLayer(FILLED_LAYER_FILL);
    if (map.getSource(FILLED_LAYER_SOURCE)) map.removeSource(FILLED_LAYER_SOURCE);
    if (map.getLayer(ELEVATION_LAYER)) map.setPaintProperty(ELEVATION_LAYER, "raster-opacity", 0.86);
  }

  function visibleFeatureCollection(result: FilledLayerPreview, visible: number[]) {
    const visibleSet = new Set(visible);
    const maximum = result.boundaries[result.boundaries.length - 1] || 1;
    return {
      type: "FeatureCollection" as const,
      features: result.feature_collection.features
        .filter((feature) => visibleSet.has(feature.properties.layer_index))
        .map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            colour: layerColour(feature.properties.lower_elevation, maximum),
          },
        })),
    };
  }

  function showFilledLayerOverlay(result: FilledLayerPreview, visible: number[]) {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    clearFilledLayerOverlay();
    if (map.getLayer(ELEVATION_LAYER)) map.setPaintProperty(ELEVATION_LAYER, "raster-opacity", 0.18);
    map.addSource(FILLED_LAYER_SOURCE, {
      type: "geojson",
      data: visibleFeatureCollection(result, visible),
    });
    map.addLayer({
      id: FILLED_LAYER_FILL,
      type: "fill",
      source: FILLED_LAYER_SOURCE,
      paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.9 },
    }, "topomapper-selection-outline");
    map.addLayer({
      id: FILLED_LAYER_OUTLINE,
      type: "line",
      source: FILLED_LAYER_SOURCE,
      paint: { "line-color": "#203c31", "line-width": 0.65, "line-opacity": 0.62 },
    }, "topomapper-selection-outline");
  }

  function invalidateFilledLayerPreview(message: string) {
    clearFilledLayerOverlay();
    setFilledLayerPreview(null);
    setVisibleLayerIndices([]);
    setWorkspaceView("two-dimensional");
    setLayerGenerationStatus(message);
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
      invalidateFilledLayerPreview("The area changed. Generate the filled layers again after analysis.");
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
        const projectSelection = selectionRef.current;
        if (projectSelection) {
          applySelection(projectSelection);
          map.fitBounds([[projectSelection.west, projectSelection.south], [projectSelection.east, projectSelection.north]], { padding: 130, maxZoom: 12 });
          setSelectionStatus("The active project's working area has been restored.");
        }
      });
      map.on("error", () => setMapStatus("Map source unavailable"));
      map.on("zoom", () => setZoom(map.getZoom()));
      map.on("mousemove", (event) => {
        setCursor({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
        const start = drawStartRef.current;
        if (!start) return;
        applySelection(constrainBoundsToAspect(start.longitude, start.latitude, event.lngLat.lng, event.lngLat.lat, aspectRatioRef.current));
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
        const next = constrainBoundsToAspect(start.longitude, start.latitude, event.lngLat.lng, event.lngLat.lat, aspectRatioRef.current);
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
    if (mapStatus !== "Map ready") return;
    if (selection) applySelection(selection);
    if (analysis?.preview_png) showElevationOverlay(analysis);
    if (filledLayerPreview) showFilledLayerOverlay(filledLayerPreview, visibleLayerIndices);
  }, [mapStatus, analysis, filledLayerPreview, visibleLayerIndices]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(OUTPUT_PLAN_KEY) ?? "null") as {
        format?: OutputFormat;
        orientation?: OutputOrientation;
        customWidthMm?: number;
        customHeightMm?: number;
        materialThicknessMm?: number;
      } | null;
      if (!saved) return;
      if (["free", "12x8", "a2", "square", "custom"].includes(saved.format ?? "")) setOutputFormat(saved.format as OutputFormat);
      if (["landscape", "portrait"].includes(saved.orientation ?? "")) setOutputOrientation(saved.orientation as OutputOrientation);
      if (Number(saved.customWidthMm) > 0) setCustomWidthMm(Number(saved.customWidthMm));
      if (Number(saved.customHeightMm) > 0) setCustomHeightMm(Number(saved.customHeightMm));
      if (Number(saved.materialThicknessMm) > 0) setMaterialThicknessMm(Number(saved.materialThicknessMm));
    } catch {
      window.localStorage.removeItem(OUTPUT_PLAN_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(OUTPUT_PLAN_KEY, JSON.stringify({
      format: outputFormat,
      orientation: outputOrientation,
      customWidthMm,
      customHeightMm,
      materialThicknessMm,
    }));
  }, [outputFormat, outputOrientation, customWidthMm, customHeightMm, materialThicknessMm]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(ASSEMBLY_PLAN_KEY) ?? "null") as {
        gridPitchMm?: number;
        dowelDiameterMm?: number;
        holeDiameterMm?: number;
        holeEdgeClearanceMm?: number;
      } | null;
      if (!saved) return;
      if (Number(saved.gridPitchMm) >= 20) setGridPitchMm(Number(saved.gridPitchMm));
      if (Number(saved.dowelDiameterMm) > 0) setDowelDiameterMm(Number(saved.dowelDiameterMm));
      if (Number(saved.holeDiameterMm) > 0) setHoleDiameterMm(Number(saved.holeDiameterMm));
      if (Number(saved.holeEdgeClearanceMm) >= 0) setHoleEdgeClearanceMm(Number(saved.holeEdgeClearanceMm));
    } catch {
      window.localStorage.removeItem(ASSEMBLY_PLAN_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ASSEMBLY_PLAN_KEY, JSON.stringify({ gridPitchMm, dowelDiameterMm, holeDiameterMm, holeEdgeClearanceMm }));
  }, [gridPitchMm, dowelDiameterMm, holeDiameterMm, holeEdgeClearanceMm]);

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
    const example = aspectRatioRef.current ? fitBoundsToAspect(TARANAKI_EXAMPLE, aspectRatioRef.current) : TARANAKI_EXAMPLE;
    applySelection(example, true);
    mapRef.current?.fitBounds(
      [[example.west, example.south], [example.east, example.north]],
      { padding: 130, maxZoom: 12, duration: 1200 },
    );
    setQuery("Mount Taranaki");
    setSearchMessage("Stage 2 reference area");
    setSelectionStatus("Mount Taranaki reference area restored.");
  }

  function fitAreaToOutputFormat() {
    if (!selection || !chosenOutput) return;
    const fitted = fitBoundsToAspect(selection, chosenOutput.width / chosenOutput.height);
    applySelection(fitted, true);
    mapRef.current?.fitBounds([[fitted.west, fitted.south], [fitted.east, fitted.north]], { padding: 130, maxZoom: 13, duration: 700 });
    setSelectionStatus(`${chosenOutput.label} ${outputOrientation} ratio applied without stretching the landscape.`);
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
    if (filledLayerPreview) invalidateFilledLayerPreview("The boundaries changed. Generate the 2D preview again when they are ready.");
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
          setLayerCount(restored.length - 1);
          setLayerStatus("Your saved layer plan has been restored for this elevation range.");
          return;
        }
      }
    } catch {
      window.localStorage.removeItem(LAYER_PLAN_KEY);
    }
    const logarithmic = presetBoundaries("log", maximum, DEFAULT_LAYER_COUNT);
    setLayerDistribution("log");
    setLayerCount(DEFAULT_LAYER_COUNT);
    storeLayerPlan(logarithmic, maximum, "Logarithmic terrain boundaries are ready to edit.");
  }

  function applyLayerDistribution(distribution: LayerDistribution, count = layerCount) {
    if (!analysis) return;
    const next = presetBoundaries(distribution, analysis.maximum.elevation, count);
    setLayerDistribution(distribution);
    setLayerCount(count);
    storeLayerPlan(next, analysis.maximum.elevation, distribution === "log"
      ? `${count} logarithmically spaced elevation layers applied.`
      : `${count} equal elevation layers applied.`);
  }

  function adjustLayerCount(change: -1 | 1) {
    const nextCount = Math.max(MIN_LAYER_COUNT, Math.min(MAX_LAYER_COUNT, layerCount + change));
    if (nextCount === layerCount) return;
    applyLayerDistribution(layerDistribution, nextCount);
  }

  function editLayerBoundary(id: string, value: string) {
    if (!analysis) return;
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
    setLayerCount(next.length - 1);
    setNewBoundaryValue("");
    storeLayerPlan(next, maximum, `${formatBoundaryValue(value)} m boundary added.`);
  }

  function removeLayerBoundary(id: string) {
    if (!analysis) return;
    const next = layerBoundaries.filter((boundary) => boundary.id !== id);
    setLayerCount(next.length - 1);
    storeLayerPlan(next, analysis.maximum.elevation, "Boundary removed.");
  }

  function moveLayerBoundary(id: string, direction: -1 | 1) {
    if (!analysis) return;
    const index = layerBoundaries.findIndex((boundary) => boundary.id === id);
    const target = index + direction;
    if (index < 1 || target < 1 || target >= layerBoundaries.length - 1) return;
    const next = [...layerBoundaries];
    [next[index], next[target]] = [next[target], next[index]];
    storeLayerPlan(next, analysis.maximum.elevation, "Boundary order updated.");
  }

  function chooseElevationFiles(files: File[]) {
    setElevationFiles(files);
    if (!files.length) {
      setAnalysisStatus("Choose one or more LINZ elevation GeoTIFFs for this area.");
      return;
    }
    if (analysisRef.current) {
      invalidateFilledLayerPreview("Analyse the new GeoTIFF selection before generating layers.");
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

  async function generateFilledLayerPreview() {
    if (!analysis || !selection || !elevationFiles.length || layerValidation || generatingLayers) return;
    setGeneratingLayers(true);
    setLayerGenerationStatus(`Generating ${layerBoundaries.length - 1} cumulative polygon layers…`);
    const form = new FormData();
    elevationFiles.forEach((file) => form.append("geotiff", file));
    form.append("bounds", JSON.stringify(selection));
    form.append("boundaries", JSON.stringify(layerBoundaries.map(parseBoundary)));

    try {
      const response = await fetch(`${PROCESSOR_ENDPOINT}/layers`, { method: "POST", body: form });
      const payload = await response.json() as FilledLayerPreview | { error?: string };
      if (!response.ok || !("feature_collection" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "The filled layers could not be generated.");
      }
      if (!selectionRef.current || !sameBounds(selectionRef.current, payload.selection)) {
        throw new Error("The map area changed during layer generation. Generate the preview again.");
      }
      const visible = payload.layers.map((layer) => layer.index);
      setFilledLayerPreview(payload);
      setVisibleLayerIndices(visible);
      setAssemblyLayerIndex(0);
      showFilledLayerOverlay(payload, visible);
      const pieces = payload.layers.reduce((total, layer) => total + layer.piece_count, 0);
      const holes = payload.layers.reduce((total, layer) => total + layer.hole_count, 0);
      setLayerGenerationStatus(`${payload.layers.length} filled layers generated: ${pieces} polygon piece${pieces === 1 ? "" : "s"}${holes ? ` with ${holes} preserved hole${holes === 1 ? "" : "s"}` : ""}. Choose 3D Model or Assembly in the header.`);
    } catch (error) {
      setLayerGenerationStatus(error instanceof Error ? error.message : "The filled layers could not be generated.");
    } finally {
      setGeneratingLayers(false);
    }
  }

  function toggleFilledLayer(index: number) {
    if (!filledLayerPreview) return;
    const next = visibleLayerIndices.includes(index)
      ? visibleLayerIndices.filter((item) => item !== index)
      : [...visibleLayerIndices, index].sort((left, right) => left - right);
    setVisibleLayerIndices(next);
    const source = mapRef.current?.getSource(FILLED_LAYER_SOURCE) as GeoJSONSource | undefined;
    source?.setData(visibleFeatureCollection(filledLayerPreview, next));
  }

  function setAllFilledLayers(visible: boolean) {
    if (!filledLayerPreview) return;
    const next = visible ? filledLayerPreview.layers.map((layer) => layer.index) : [];
    setVisibleLayerIndices(next);
    const source = mapRef.current?.getSource(FILLED_LAYER_SOURCE) as GeoJSONSource | undefined;
    source?.setData(visibleFeatureCollection(filledLayerPreview, next));
  }

  function focusElevationPoint(point: ElevationPoint) {
    mapRef.current?.flyTo({ center: [point.longitude, point.latitude], zoom: Math.max(zoom, 12), duration: 900, essential: true });
  }

  const measurements = selection ? selectionMeasurements(selection) : null;
  const layerMaximum = analysis?.maximum.elevation ?? 0;
  const layerValidation = analysis && layerBoundaries.length ? validateLayerBoundaries(layerBoundaries, layerMaximum) : "";
  const previewDimensions = chosenOutput ?? {
    width: 600,
    height: measurements && measurements.width > 0 ? 600 * measurements.height / measurements.width : 400,
    label: "Free preview",
  };
  const physicalStackHeight = (filledLayerPreview?.layers.length ?? layerCount) * materialThicknessMm;
  const trueScaledHeight = measurements && measurements.width > 0 ? layerMaximum * previewDimensions.width / measurements.width : 0;
  const verticalExaggeration = trueScaledHeight > 0 ? physicalStackHeight / trueScaledHeight : 0;
  const fabricationPreview = useMemo(() => filledLayerPreview ? applySmoothing(
    filledLayerPreview,
    smoothingLevels,
    previewDimensions.width,
    previewDimensions.height,
  ) : null, [filledLayerPreview, smoothingLevels, previewDimensions.width, previewDimensions.height]);
  const assemblyPlan = useMemo(() => fabricationPreview ? buildAssemblyPlan(
    fabricationPreview,
    previewDimensions.width,
    previewDimensions.height,
    gridPitchMm,
    holeDiameterMm,
    holeEdgeClearanceMm,
  ) : null, [fabricationPreview, previewDimensions.width, previewDimensions.height, gridPitchMm, holeDiameterMm, holeEdgeClearanceMm]);
  const selectedAssemblyLayer = fabricationPreview?.layers[assemblyLayerIndex] ?? null;
  const selectedAssemblyParts = assemblyPlan?.parts.filter((part) => part.layerIndex === assemblyLayerIndex) ?? [];
  const selectedAssemblyHoles = assemblyPlan?.holes.filter((hole) => hole.drilledLayers.includes(assemblyLayerIndex)) ?? [];
  const selectedWasteLabels = useMemo(() => fabricationPreview && assemblyPlan ? findWasteLabels(
    fabricationPreview,
    assemblyPlan,
    assemblyLayerIndex,
    previewDimensions.width,
    previewDimensions.height,
  ) : [], [fabricationPreview, assemblyPlan, assemblyLayerIndex, previewDimensions.width, previewDimensions.height]);
  const selectedManufacturingSvg = useMemo(() => fabricationPreview && assemblyPlan && selectedAssemblyLayer ? buildLayerSvg(
    fabricationPreview,
    assemblyPlan,
    assemblyLayerIndex,
    previewDimensions.width,
    previewDimensions.height,
    holeDiameterMm,
    materialThicknessMm,
    analysis?.datasets.map((dataset) => dataset.filename) ?? [],
  ) : "", [fabricationPreview, assemblyPlan, selectedAssemblyLayer, assemblyLayerIndex, previewDimensions.width, previewDimensions.height, holeDiameterMm, materialThicknessMm, analysis]);
  const originalSmoothingMetrics = filledLayerPreview ? layerGeometryMetrics(filledLayerPreview, smoothingLayerIndex, previewDimensions.width, previewDimensions.height) : null;
  const smoothedSmoothingMetrics = fabricationPreview ? layerGeometryMetrics(fabricationPreview, smoothingLayerIndex, previewDimensions.width, previewDimensions.height) : null;
  const layoutParts = useMemo(() => fabricationPreview && assemblyPlan ? buildLayoutParts(fabricationPreview, assemblyPlan, previewDimensions.width, previewDimensions.height) : [], [fabricationPreview, assemblyPlan, previewDimensions.width, previewDimensions.height]);
  const layoutViolations = useMemo(() => {
    if (sheetPartDragging) return layoutViolationsRef.current;
    const checked = checkLayoutRules(sheetPlacements, layoutParts, sheetRules);
    layoutViolationsRef.current = checked;
    return checked;
  }, [sheetPlacements, layoutParts, sheetRules, sheetPartDragging]);
  const highlightedPlacementIds = selectedViolationIndex !== null ? (layoutViolations[selectedViolationIndex]?.placementIds ?? []) : [];
  const selectedPlacement = sheetPlacements.find((placement) => placement.id === selectedPlacementId) ?? null;
  const placedArea = sheetPlacements.reduce((total, placement) => total + (layoutParts.find((part) => part.id === placement.partId)?.areaMm2 ?? 0), 0);
  const sheetUtilisation = sheetCount > 0 ? placedArea / (sheetRules.width * sheetRules.height * sheetCount) * 100 : 0;

  function setLayerSmoothing(value: number) {
    setSmoothingLevels((current) => ({ ...current, [smoothingLayerIndex]: Math.max(0, Math.min(12, value)) }));
  }

  function applySmoothingToAll() {
    if (!filledLayerPreview) return;
    const value = smoothingLevels[smoothingLayerIndex] ?? 0;
    setSmoothingLevels(Object.fromEntries(filledLayerPreview.layers.map((layer) => [layer.index, value])));
  }

  function blankProjectDocument(name: string): TopomapperProject {
    const now = new Date().toISOString();
    return {
      format: "topomapper-project",
      version: 1,
      id: window.crypto.randomUUID(),
      name,
      createdAt: now,
      modifiedAt: now,
      selection: null,
      query: "",
      elevation: { sourceFilenames: [], analysis: null, filledLayerPreview: null, visibleLayerIndices: [] },
      output: { format: "free", orientation: "landscape", customWidthMm: 600, customHeightMm: 400, materialThicknessMm: 6 },
      layers: { distribution: "log", count: DEFAULT_LAYER_COUNT, boundaries: [] },
      model: { stackView: "three-dimensional", stackYaw: 0, stackPitch: 34, showTrueElevation: true, smoothingLevels: {} },
      assembly: { gridPitchMm: 100, dowelDiameterMm: 4, holeDiameterMm: 4.2, holeEdgeClearanceMm: 6 },
      layout: { sheetRules: { width: 1200, height: 600, thickness: 3, edgeMargin: 15, partSpacing: 8 }, sheetCount: 1, activeSheetIndex: 0, placements: [], rotationStepDeg: 5 },
      view: { workspaceView: "two-dimensional", assemblyLayerIndex: 0, smoothingLayerIndex: 0 },
    };
  }

  function legacyProjectDocument(name: string) {
    const project = blankProjectDocument(name);
    try {
      const savedSelection = JSON.parse(window.localStorage.getItem(LAST_SELECTION_KEY) ?? "null");
      if (isSelectionBounds(savedSelection)) {
        project.selection = savedSelection;
        const centreLongitude = (savedSelection.west + savedSelection.east) / 2;
        const centreLatitude = (savedSelection.south + savedSelection.north) / 2;
        if (centreLongitude >= 173.7 && centreLongitude <= 174.4 && centreLatitude >= -39.6 && centreLatitude <= -39.0) project.name = "Mount Taranaki 1";
      }
    } catch { /* Ignore an invalid legacy selection. */ }
    try {
      const savedOutput = JSON.parse(window.localStorage.getItem(OUTPUT_PLAN_KEY) ?? "null");
      if (savedOutput) project.output = {
        format: savedOutput.format ?? project.output.format,
        orientation: savedOutput.orientation ?? project.output.orientation,
        customWidthMm: Number(savedOutput.customWidthMm) || project.output.customWidthMm,
        customHeightMm: Number(savedOutput.customHeightMm) || project.output.customHeightMm,
        materialThicknessMm: Number(savedOutput.materialThicknessMm) || project.output.materialThicknessMm,
      };
    } catch { /* Ignore invalid legacy output settings. */ }
    try {
      const savedLayers = JSON.parse(window.localStorage.getItem(LAYER_PLAN_KEY) ?? "null");
      if (savedLayers && Array.isArray(savedLayers.values) && Number.isFinite(savedLayers.maximum)) {
        project.layers.boundaries = boundarySet(savedLayers.values, Number(savedLayers.maximum), "recovered");
        project.layers.count = Math.max(1, project.layers.boundaries.length - 1);
      }
    } catch { /* Ignore an invalid legacy layer plan. */ }
    try {
      const savedAssembly = JSON.parse(window.localStorage.getItem(ASSEMBLY_PLAN_KEY) ?? "null");
      if (savedAssembly) project.assembly = { ...project.assembly, ...savedAssembly };
    } catch { /* Ignore invalid legacy assembly settings. */ }
    try {
      const savedLayout = JSON.parse(window.localStorage.getItem(SHEET_LAYOUT_KEY) ?? "null");
      if (savedLayout?.format === "topomapper-sheet-layout" && Array.isArray(savedLayout.sheetPlacements)) {
        project.layout = {
          sheetRules: savedLayout.sheetRules ?? project.layout.sheetRules,
          sheetCount: Math.max(1, Number(savedLayout.sheetCount) || 1),
          activeSheetIndex: Math.max(0, Number(savedLayout.activeSheetIndex) || 0),
          placements: savedLayout.sheetPlacements,
        };
        project.model.smoothingLevels = savedLayout.smoothingLevels ?? {};
        if (savedLayout.output) project.output = { ...project.output, ...savedLayout.output };
        if (savedLayout.assembly) project.assembly = { ...project.assembly, ...savedLayout.assembly };
      }
    } catch { /* Ignore an invalid legacy sheet layout. */ }
    return project;
  }

  function currentProjectDocument(): TopomapperProject | null {
    if (!projectId) return null;
    return {
      format: "topomapper-project",
      version: 1,
      id: projectId,
      name: projectName.trim() || "Untitled project",
      createdAt: projectCreatedAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      selection,
      query,
      elevation: {
        sourceFilenames: elevationFiles.length ? elevationFiles.map((file) => file.name) : (analysis?.datasets.map((dataset) => dataset.filename) ?? []),
        analysis,
        filledLayerPreview,
        visibleLayerIndices,
      },
      output: { format: outputFormat, orientation: outputOrientation, customWidthMm, customHeightMm, materialThicknessMm },
      layers: { distribution: layerDistribution, count: layerCount, boundaries: layerBoundaries },
      model: { stackView, stackYaw, stackPitch, showTrueElevation, smoothingLevels },
      assembly: { gridPitchMm, dowelDiameterMm, holeDiameterMm, holeEdgeClearanceMm },
      layout: { sheetRules, sheetCount, activeSheetIndex, placements: sheetPlacements, rotationStepDeg },
      view: { workspaceView, assemblyLayerIndex, smoothingLayerIndex },
    };
  }

  function isProjectDocument(value: unknown): value is TopomapperProject {
    const project = value as Partial<TopomapperProject> | null;
    return Boolean(project && project.format === "topomapper-project" && project.version === 1 && project.id && project.name && project.output && project.layers && project.model && project.assembly && project.layout && project.view && project.elevation);
  }

  async function saveCurrentProject(automatic = false) {
    const project = currentProjectDocument();
    if (!project) return;
    try {
      await writeStoredProject(project);
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
      setProjectLibrary((current) => [project, ...current.filter((candidate) => candidate.id !== project.id)].sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)));
      const time = new Date().toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setProjectStatus(`${automatic ? "Autosaved" : "Saved"} ${time}`);
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : "The project could not be saved.");
    }
  }

  function openProjectDocument(project: TopomapperProject) {
    if (!isProjectDocument(project)) throw new Error("This is not a Topomapper project file.");
    projectReadyRef.current = false;
    clearFilledLayerOverlay();
    clearElevationOverlay();
    applySelection(project.selection);
    setQuery(project.query ?? "");
    setResults([]);
    setSearchMessage(project.query ? `Project location: ${project.query}` : "Search for a New Zealand place");
    setSelectionStatus(project.selection ? "The project's selected area has been restored." : "Find a place, then draw the area you want to model.");
    setElevationFiles([]);
    analysisRef.current = project.elevation.analysis;
    setAnalysis(project.elevation.analysis);
    setAnalysisStatus(project.elevation.analysis
      ? "Saved elevation analysis restored. Reload the named GeoTIFF files only if you need to regenerate layers."
      : project.elevation.sourceFilenames.length ? `Reload ${project.elevation.sourceFilenames.join(", ")} to regenerate terrain layers.` : "Choose one or more LINZ elevation GeoTIFFs for this area.");
    setFilledLayerPreview(project.elevation.filledLayerPreview);
    setVisibleLayerIndices(project.elevation.visibleLayerIndices ?? project.elevation.filledLayerPreview?.layers.map((layer) => layer.index) ?? []);
    setOutputFormat(project.output.format);
    setOutputOrientation(project.output.orientation);
    setCustomWidthMm(project.output.customWidthMm);
    setCustomHeightMm(project.output.customHeightMm);
    setMaterialThicknessMm(project.output.materialThicknessMm);
    setLayerDistribution(project.layers.distribution);
    setLayerCount(project.layers.count);
    setLayerBoundaries(project.layers.boundaries);
    setLayerStatus(project.layers.boundaries.length ? `${project.layers.count} saved layer boundaries restored.` : "Analyse elevation data to begin a layer plan.");
    setLayerGenerationStatus(project.elevation.filledLayerPreview ? `${project.elevation.filledLayerPreview.layers.length} processed terrain layers restored from the project.` : "Choose valid boundaries, then generate the filled 2D preview.");
    setStackView(project.model.stackView);
    setStackYaw(project.model.stackYaw);
    setStackPitch(project.model.stackPitch);
    setShowTrueElevation(project.model.showTrueElevation);
    setSmoothingLevels(project.model.smoothingLevels);
    setGridPitchMm(project.assembly.gridPitchMm);
    setDowelDiameterMm(project.assembly.dowelDiameterMm);
    setHoleDiameterMm(project.assembly.holeDiameterMm);
    setHoleEdgeClearanceMm(project.assembly.holeEdgeClearanceMm);
    setSheetRules(project.layout.sheetRules);
    setSheetCount(project.layout.sheetCount);
    setActiveSheetIndex(Math.min(project.layout.activeSheetIndex, Math.max(0, project.layout.sheetCount - 1)));
    setSheetPlacements(project.layout.placements);
    setRotationStepDeg(project.layout.rotationStepDeg && project.layout.rotationStepDeg >= 1 ? project.layout.rotationStepDeg : 5);
    setSelectedPlacementId(null);
    setSelectedViolationIndex(null);
    setWorkspaceView(project.elevation.filledLayerPreview ? project.view.workspaceView : "two-dimensional");
    setAssemblyLayerIndex(project.view.assemblyLayerIndex);
    setSmoothingLayerIndex(project.view.smoothingLayerIndex);
    setProjectId(project.id);
    setProjectName(project.name);
    setProjectCreatedAt(project.createdAt);
    placementCounterRef.current = project.layout.placements.reduce((maximum, placement) => Math.max(maximum, Number(placement.id.split("-").pop()) || 0), 0) + 1;
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
    if (project.selection) mapRef.current?.fitBounds([[project.selection.west, project.selection.south], [project.selection.east, project.selection.north]], { padding: 130, maxZoom: 12, duration: 600 });
    if (project.elevation.analysis?.preview_png) showElevationOverlay(project.elevation.analysis);
    if (project.elevation.filledLayerPreview) showFilledLayerOverlay(project.elevation.filledLayerPreview, project.elevation.visibleLayerIndices.length ? project.elevation.visibleLayerIndices : project.elevation.filledLayerPreview.layers.map((layer) => layer.index));
    setProjectStatus(`Opened ${project.name}`);
    projectReadyRef.current = true;
  }

  async function openStoredProject(id: string) {
    if (!id || id === projectId) return;
    await saveCurrentProject(true);
    const project = await readStoredProject(id);
    if (!project) { setProjectStatus("That saved project could not be found."); return; }
    openProjectDocument(project);
  }

  async function createNewProject() {
    await saveCurrentProject(true);
    const base = query.trim() || "Untitled";
    let number = 1;
    while (projectLibrary.some((project) => project.name.toLowerCase() === `${base} ${number}`.toLowerCase())) number += 1;
    const project = blankProjectDocument(`${base} ${number}`);
    await writeStoredProject(project);
    setProjectLibrary((current) => [project, ...current]);
    openProjectDocument(project);
    setProjectStatus(`New project created as ${project.name}. Rename it at any time.`);
  }

  async function closeCurrentProject() {
    await saveCurrentProject(true);
    projectReadyRef.current = false;
    const blank = blankProjectDocument("No project open");
    openProjectDocument(blank);
    projectReadyRef.current = false;
    setProjectId(null);
    setProjectName("");
    setProjectCreatedAt("");
    window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
    setProjectStatus("Project closed. Choose a saved project or create a new one.");
  }

  async function exportCurrentProject() {
    const project = currentProjectDocument();
    if (!project) return;
    await writeStoredProject(project);
    downloadFile(JSON.stringify(project, null, 2), "application/json;charset=utf-8", projectFilename(project.name));
    setProjectStatus(`Saved locally and downloaded ${projectFilename(project.name)}.`);
  }

  async function importProjectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as TopomapperProject;
      if (!isProjectDocument(imported)) throw new Error("This is not a Topomapper project file.");
      await saveCurrentProject(true);
      const project = { ...imported, id: window.crypto.randomUUID(), name: imported.name.trim() || file.name.replace(/\.topomapper$/i, ""), modifiedAt: new Date().toISOString() };
      await writeStoredProject(project);
      setProjectLibrary((current) => [project, ...current]);
      openProjectDocument(project);
      setProjectStatus(`${file.name} imported as ${project.name}.`);
    } catch (error) {
      setProjectStatus(error instanceof Error ? error.message : "The project file could not be imported.");
    }
    event.target.value = "";
  }

  function sheetLayoutData() {
    return {
      format: "topomapper-sheet-layout",
      version: 1,
      savedAt: new Date().toISOString(),
      sheetRules,
      sheetCount,
      activeSheetIndex,
      sheetPlacements,
      smoothingLevels,
      output: { outputFormat, outputOrientation, customWidthMm, customHeightMm },
      assembly: { gridPitchMm, dowelDiameterMm, holeDiameterMm, holeEdgeClearanceMm },
      partSignature: layoutParts.map((part) => ({ id: part.id, width: svgNumber(part.width), height: svgNumber(part.height) })),
    };
  }

  function applySheetLayoutData(value: unknown) {
    const data = value as {
      format?: string;
      version?: number;
      sheetRules?: SheetRules;
      sheetCount?: number;
      activeSheetIndex?: number;
      sheetPlacements?: SheetPlacement[];
      smoothingLevels?: Record<number, number>;
      output?: { outputFormat?: OutputFormat; outputOrientation?: OutputOrientation; customWidthMm?: number; customHeightMm?: number };
      assembly?: { gridPitchMm?: number; dowelDiameterMm?: number; holeDiameterMm?: number; holeEdgeClearanceMm?: number };
    };
    if (!data || data.format !== "topomapper-sheet-layout" || data.version !== 1 || !Array.isArray(data.sheetPlacements)) throw new Error("Not a Topomapper sheet layout file.");
    suppressLayoutDirtyRef.current = true;
    if (data.sheetRules) setSheetRules(data.sheetRules);
    const count = Math.max(1, Math.round(data.sheetCount ?? 1));
    setSheetCount(count);
    setActiveSheetIndex(Math.max(0, Math.min(count - 1, Math.round(data.activeSheetIndex ?? 0))));
    setSheetPlacements(data.sheetPlacements);
    setSmoothingLevels(data.smoothingLevels ?? {});
    if (data.output?.outputFormat) setOutputFormat(data.output.outputFormat);
    if (data.output?.outputOrientation) setOutputOrientation(data.output.outputOrientation);
    if (Number.isFinite(data.output?.customWidthMm)) setCustomWidthMm(Number(data.output?.customWidthMm));
    if (Number.isFinite(data.output?.customHeightMm)) setCustomHeightMm(Number(data.output?.customHeightMm));
    if (Number.isFinite(data.assembly?.gridPitchMm)) setGridPitchMm(Number(data.assembly?.gridPitchMm));
    if (Number.isFinite(data.assembly?.dowelDiameterMm)) setDowelDiameterMm(Number(data.assembly?.dowelDiameterMm));
    if (Number.isFinite(data.assembly?.holeDiameterMm)) setHoleDiameterMm(Number(data.assembly?.holeDiameterMm));
    if (Number.isFinite(data.assembly?.holeEdgeClearanceMm)) setHoleEdgeClearanceMm(Number(data.assembly?.holeEdgeClearanceMm));
    const maximumInstance = data.sheetPlacements.reduce((maximum, placement) => Math.max(maximum, Number(placement.id.split("-").pop()) || 0), 0);
    placementCounterRef.current = maximumInstance + 1;
    setSelectedPlacementId(null);
    setSelectedViolationIndex(null);
  }

  function saveSheetLayoutLocally() {
    const data = sheetLayoutData();
    window.localStorage.setItem(SHEET_LAYOUT_KEY, JSON.stringify(data));
    setLayoutSaveStatus(`Layout saved locally at ${new Date().toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })}.`);
  }

  function downloadSheetLayoutBackup() {
    const data = sheetLayoutData();
    window.localStorage.setItem(SHEET_LAYOUT_KEY, JSON.stringify(data));
    downloadFile(JSON.stringify(data, null, 2), "application/json;charset=utf-8", "topomapper-sheet-layout.json");
    setLayoutSaveStatus("Layout saved locally and downloaded as a backup file.");
  }

  async function importSheetLayoutBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      applySheetLayoutData(data);
      window.localStorage.setItem(SHEET_LAYOUT_KEY, JSON.stringify(data));
      setLayoutSaveStatus(`Layout restored from ${file.name}. Regenerate the same terrain layers if they are not already loaded.`);
    } catch (error) {
      setLayoutSaveStatus(error instanceof Error ? error.message : "The layout backup could not be restored.");
    }
    event.target.value = "";
  }

  function nextPlacementId(partId: string) {
    const id = `${partId}-${placementCounterRef.current}`;
    placementCounterRef.current += 1;
    return id;
  }

  function addPartToSheet(partId: string, sheetIndex = activeSheetIndex) {
    const offset = sheetPlacements.filter((placement) => placement.sheetIndex === sheetIndex).length * 6;
    const placement: SheetPlacement = { id: nextPlacementId(partId), partId, sheetIndex, x: sheetRules.edgeMargin + offset, y: sheetRules.edgeMargin + offset, rotation: 0 };
    setSheetPlacements((current) => [...current, placement]);
    setSelectedPlacementId(placement.id);
  }

  function updateSheetPlacement(id: string, update: Partial<SheetPlacement>) {
    setSheetPlacements((current) => current.map((placement) => placement.id === id ? { ...placement, ...update } : placement));
  }

  function addReplacementSheet() {
    setSheetCount((current) => current + 1);
    setActiveSheetIndex(sheetCount);
    setSelectedPlacementId(null);
    setSheetZoom(1);
    setSheetViewCenter({ x: sheetRules.width / 2, y: sheetRules.height / 2 });
  }

  function focusSheetPlacement(placement: SheetPlacement, violationIndex: number | null = null) {
    const part = layoutParts.find((candidate) => candidate.id === placement.partId);
    if (!part) return;
    const bounds = placedPartBounds(placement, part);
    setActiveSheetIndex(placement.sheetIndex);
    setSelectedPlacementId(placement.id);
    setSelectedViolationIndex(violationIndex);
    setSheetZoom((current) => Math.max(2, current));
    setSheetViewCenter({ x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 });
  }

  function autoLayoutUnplaced() {
    const placedPartIds = new Set(sheetPlacements.map((placement) => placement.partId));
    const unplaced = layoutParts.filter((part) => !placedPartIds.has(part.id)).sort((left, right) => right.areaMm2 - left.areaMm2);
    const partMap = new Map(layoutParts.map((part) => [part.id, part]));
    let working = [...sheetPlacements];
    let workingSheetCount = sheetCount;
    unplaced.forEach((part) => {
      let fitted: SheetPlacement | null = null;
      for (let sheetIndex = 0; sheetIndex < workingSheetCount && !fitted; sheetIndex += 1) {
        const existing = working.filter((placement) => placement.sheetIndex === sheetIndex);
        const xCandidates = [sheetRules.edgeMargin, ...existing.flatMap((placement) => {
          const existingPart = layoutParts.find((candidate) => candidate.id === placement.partId);
          return existingPart ? [placementBounds(placement, existingPart).right + sheetRules.partSpacing] : [];
        })];
        const yCandidates = [sheetRules.edgeMargin, ...existing.flatMap((placement) => {
          const existingPart = layoutParts.find((candidate) => candidate.id === placement.partId);
          return existingPart ? [placementBounds(placement, existingPart).bottom + sheetRules.partSpacing] : [];
        })];
        for (const rotation of [0, 90] as const) {
          for (const y of [...new Set(yCandidates)].sort((left, right) => left - right)) {
            for (const x of [...new Set(xCandidates)].sort((left, right) => left - right)) {
              const candidate: SheetPlacement = { id: nextPlacementId(part.id), partId: part.id, sheetIndex, x, y, rotation };
              if (candidateFitsConservative(candidate, working, partMap, sheetRules)) { fitted = candidate; break; }
            }
            if (fitted) break;
          }
          if (fitted) break;
        }
      }
      if (!fitted) {
        fitted = { id: nextPlacementId(part.id), partId: part.id, sheetIndex: workingSheetCount, x: sheetRules.edgeMargin, y: sheetRules.edgeMargin, rotation: 0 };
        workingSheetCount += 1;
      }
      working.push(fitted);
    });
    setSheetCount(workingSheetCount);
    setSheetPlacements(working);
    if (unplaced.length) setActiveSheetIndex(working[working.length - 1].sheetIndex);
  }

  function startNestingOptimiser() {
    if (optimizerRunning || !layoutParts.length) return;
    const placedOriginals = new Set(sheetPlacements.map((placement) => placement.partId));
    const missing = layoutParts.filter((part) => !placedOriginals.has(part.id)).map((part) => ({ id: nextPlacementId(part.id), partId: part.id, preferredRotation: 0 }));
    const instances = [
      ...sheetPlacements.map((placement) => ({ id: placement.id, partId: placement.partId, preferredRotation: placement.rotation })),
      ...missing,
    ];
    const partMap = new Map(layoutParts.map((part) => [part.id, part]));
    let best = missing.length || layoutViolations.length ? null : [...sheetPlacements];
    let bestFitness = best ? layoutFitness(best, partMap, sheetRules) : Number.POSITIVE_INFINITY;
    const runId = Date.now();
    const worker = new Worker(new URL("../workers/nesting.worker.ts", import.meta.url), { type: "module" });
    optimizerWorkerRef.current = worker;
    setOptimizerRunning(true);
    setOptimizerStatus(`Background search started with ${rotationStepDeg}° rotations. The current layout remains editable and responsive.`);
    worker.onmessage = (event: MessageEvent<{ type: "attempt"; runId: number; attempt: number; candidate: SheetPlacement[] | null }>) => {
      if (event.data.type !== "attempt" || event.data.runId !== runId || optimizerWorkerRef.current !== worker) return;
      const { candidate, attempt } = event.data;
      try {
        if (candidate) {
          const fitness = layoutFitness(candidate, partMap, sheetRules);
          if (fitness < bestFitness) {
            const preciseViolations = checkLayoutRules(candidate, layoutParts, sheetRules);
            if (preciseViolations.length) {
              if (attempt % 3 === 0) setOptimizerStatus(`${attempt} attempts checked. A tighter preview failed the full-resolution DRC; continuing safely…`);
            } else {
              best = candidate;
              bestFitness = fitness;
              const usedSheets = Math.max(...candidate.map((placement) => placement.sheetIndex)) + 1;
              setSheetPlacements(candidate);
              setSheetCount(usedSheets);
              setActiveSheetIndex(0);
              setSelectedPlacementId(null);
              setSelectedViolationIndex(null);
              setOptimizerStatus(`Improved after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${usedSheets} sheet${usedSheets === 1 ? "" : "s"}. Background search continues until Stop…`);
            }
          } else if (attempt % 5 === 0) {
            const sheets = best?.length ? Math.max(...best.map((placement) => placement.sheetIndex)) + 1 : sheetCount;
            setOptimizerStatus(`${attempt} attempts checked. Best remains ${sheets} sheet${sheets === 1 ? "" : "s"}; continuing…`);
          }
        } else if (attempt % 5 === 0) setOptimizerStatus(`${attempt} attempts checked. Some parts are difficult to place; continuing…`);
      } finally {
        if (optimizerWorkerRef.current === worker) worker.postMessage({ type: "continue", runId });
      }
    };
    worker.onerror = (event) => {
      if (optimizerWorkerRef.current !== worker) return;
      worker.terminate();
      optimizerWorkerRef.current = null;
      setOptimizerRunning(false);
      setOptimizerStatus(`The background optimiser stopped unexpectedly${event.message ? `: ${event.message}` : "."} The best completed layout remains editable.`);
    };
    worker.postMessage({
      type: "start",
      runId,
      instances,
      parts: layoutParts.map((part) => {
        const simplified = simplifyLayoutPartForSearch(part, 48);
        return { id: simplified.id, width: simplified.width, height: simplified.height, areaMm2: simplified.areaMm2, rings: simplified.rings };
      }),
      rules: sheetRules,
      rotationStep: rotationStepDeg,
    });
  }

  function stopNestingOptimiser() {
    optimizerWorkerRef.current?.terminate();
    optimizerWorkerRef.current = null;
    setOptimizerRunning(false);
    setOptimizerStatus("Background search stopped; the best completed result remains editable.");
  }

  function sheetSvgExport(sheetIndex: number) {
    return buildSheetSvg(projectName || "Topomapper project", sheetIndex, sheetRules, layoutParts, sheetPlacements, holeDiameterMm);
  }

  function downloadActiveSheetSvg() {
    const result = sheetSvgExport(activeSheetIndex);
    if (!result.partCount) { setSheetExportStatus(`Sheet ${activeSheetIndex + 1} has no parts to export.`); return; }
    const stem = projectFilename(projectName || "topomapper-project").replace(/\.topomapper$/i, "");
    downloadFile(result.svg, "image/svg+xml;charset=utf-8", `${stem}-sheet-${activeSheetIndex + 1}.svg`);
    const warnings = layoutViolations.filter((violation) => violation.placementIds.some((id) => sheetPlacements.find((placement) => placement.id === id)?.sheetIndex === activeSheetIndex)).length;
    setSheetExportStatus(`Sheet ${activeSheetIndex + 1} cutting SVG downloaded with ${result.partCount} parts.${warnings ? ` Review ${warnings} DRC warning${warnings === 1 ? "" : "s"}.` : ""}`);
  }

  function downloadAllSheetSvgs() {
    const populatedSheets = Array.from({ length: sheetCount }, (_, index) => index).filter((index) => sheetPlacements.some((placement) => placement.sheetIndex === index));
    if (!populatedSheets.length) { setSheetExportStatus("There are no placed parts to export."); return; }
    const stem = projectFilename(projectName || "topomapper-project").replace(/\.topomapper$/i, "");
    const results = populatedSheets.map((sheetIndex) => ({ sheetIndex, result: sheetSvgExport(sheetIndex) }));
    const files = results.map(({ sheetIndex, result }) => ({ name: `${stem}-sheet-${sheetIndex + 1}.svg`, contents: result.svg }));
    files.push({
      name: `${stem}-sheet-notes.txt`,
      contents: [
        `TOPOMAPPER SHEET EXPORT — ${projectName || "Unnamed project"}`,
        "",
        `Stock: ${sheetRules.width} x ${sheetRules.height} x ${sheetRules.thickness} mm`,
        "CUT_OUTLINES: profile through the material",
        "DRILL_HOLES: drill through the material",
        "SHEET_REFERENCE: visual reference only — do not machine",
        "Part engraving is deferred. Use the printable layout guide to identify and orient parts by hand.",
        "",
        ...results.flatMap(({ sheetIndex, result }) => [
          `Sheet ${sheetIndex + 1}: ${result.partCount} parts`,
        ]),
      ].join("\n"),
    });
    downloadFile(createZipArchive(files), "application/zip", `${stem}-sheets.zip`);
    setSheetExportStatus(`${populatedSheets.length} populated cutting SVG${populatedSheets.length === 1 ? "" : "s"} downloaded as a ZIP.`);
  }

  async function downloadLayoutGuidePdf() {
    const populatedSheets = Array.from({ length: sheetCount }, (_, index) => index).filter((index) => sheetPlacements.some((placement) => placement.sheetIndex === index));
    if (!populatedSheets.length) { setSheetExportStatus("There are no placed parts for a layout guide."); return; }
    const partMap = new Map(layoutParts.map((part) => [part.id, part]));
    const sheets = populatedSheets.map((sheetIndex) => ({
      index: sheetIndex,
      parts: sheetPlacements.filter((placement) => placement.sheetIndex === sheetIndex).flatMap((placement) => {
        const part = partMap.get(placement.partId);
        if (!part) return [];
        const label = rotateLayoutPoint(part.labelPoint, part, placement.rotation);
        const north = rotateLayoutPoint({ x: part.labelPoint.x, y: part.labelPoint.y - 10 }, part, placement.rotation);
        return [{
          id: part.id,
          rotation: placement.rotation,
          rings: placedPartRings(placement, part),
          label_point: { x: label.x + placement.x, y: label.y + placement.y },
          north_point: { x: north.x + placement.x, y: north.y + placement.y },
        }];
      }),
    }));
    setSheetExportStatus("Creating the printable layout and orientation guide…");
    try {
      const response = await fetch(`${PROCESSOR_ENDPOINT}/layout-guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: projectName || "Topomapper project", sheet_width_mm: sheetRules.width, sheet_height_mm: sheetRules.height, edge_margin_mm: sheetRules.edgeMargin, sheets }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error || `The layout guide service returned ${response.status}.`);
      }
      const stem = projectFilename(projectName || "topomapper-project").replace(/\.topomapper$/i, "");
      downloadFile(await response.blob(), "application/pdf", `${stem}-layout-guide.pdf`);
      setSheetExportStatus(`Printable guide downloaded for ${populatedSheets.length} sheet${populatedSheets.length === 1 ? "" : "s"}, with part IDs, rotations and assembly-north arrows.`);
    } catch (error) {
      setSheetExportStatus(`${error instanceof Error ? error.message : "The printable guide could not be created."} Restart Topomapper if its local processor was already running before this update.`);
    }
  }

  function downloadSelectedLayerSvg() {
    if (!selectedManufacturingSvg) return;
    const layerName = `L${String(assemblyLayerIndex + 1).padStart(2, "0")}`;
    downloadFile(selectedManufacturingSvg, "image/svg+xml;charset=utf-8", `topomapper-${layerName}.svg`);
    setExportStatus(`${layerName} downloaded at ${previewDimensions.width.toFixed(1)} × ${previewDimensions.height.toFixed(1)} mm.`);
  }

  function downloadManufacturingPackage() {
    if (!fabricationPreview || !assemblyPlan) return;
    const files = fabricationPreview.layers.map((layer) => ({
      name: `layers/topomapper-L${String(layer.index + 1).padStart(2, "0")}.svg`,
      contents: buildLayerSvg(
        fabricationPreview,
        assemblyPlan,
        layer.index,
        previewDimensions.width,
        previewDimensions.height,
        holeDiameterMm,
        materialThicknessMm,
        analysis?.datasets.map((dataset) => dataset.filename) ?? [],
      ),
    }));
    files.push({
      name: "topomapper-overview.svg",
      contents: buildOverviewSvg(fabricationPreview, assemblyPlan, previewDimensions.width, previewDimensions.height, holeDiameterMm),
    });
    files.push({
      name: "manufacturing-notes.txt",
      contents: [
        "TOPOMAPPER MANUFACTURING GEOMETRY",
        "",
        `Finished model: ${previewDimensions.width.toFixed(1)} x ${previewDimensions.height.toFixed(1)} mm`,
        `Material: ${materialThicknessMm.toFixed(1)} mm`,
        `Layers: ${fabricationPreview.layers.length}`,
        `Dowel: ${dowelDiameterMm.toFixed(1)} mm`,
        `Finished holes: ${holeDiameterMm.toFixed(1)} mm`,
        `Elevation sources: ${analysis?.datasets.map((dataset) => dataset.filename).join(", ") || "not recorded"}`,
        "North is at the top of every layer SVG.",
        "",
        "SVG GROUPS",
        "CUT_OUTLINES = red profile paths",
        "DRILL_HOLES = blue volcano-vent and buried-grid circles",
        "ENGRAVE = green covered part IDs and north arrows",
        "WASTE_LABELS = grey small-part IDs and leaders engraved in surrounding waste",
        "",
        "These are finished-size geometry files. Cutter compensation, tabs, nesting and G-code are added in later fabrication stages.",
        ...assemblyPlan.warnings.map((warning) => `WARNING: ${warning}`),
      ].join("\n"),
    });
    const archive = createZipArchive(files);
    downloadFile(archive, "application/zip", "topomapper-svg-package.zip");
    setExportStatus(`${files.length} manufacturing files downloaded as one package.`);
  }

  return (
    <main className={`workspace ${drawing ? "is-drawing" : ""} view-${workspaceView}`}>
      <div ref={mapNode} className="map" aria-label="Interactive map of New Zealand" />

      <header className="topbar">
        <button className="brand" onClick={resetNewZealand} aria-label="Return to the New Zealand overview">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>topo</strong>mapper</span>
        </button>
        <div className="project-toolbar" aria-label="Project controls">
          <label className="project-name-field"><span>Project</span><input value={projectName} disabled={!projectId} onChange={(event) => setProjectName(event.target.value)} onBlur={() => { if (projectId && !projectName.trim()) setProjectName("Untitled project"); }} placeholder="No project open" /></label>
          <select value={projectId ?? ""} onChange={(event) => { if (event.target.value) void openStoredProject(event.target.value); }} aria-label="Open another saved project">
            <option value="">Open project…</option>
            {projectLibrary.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button onClick={() => void createNewProject()}>New</button>
          <button disabled={!projectId} onClick={() => void saveCurrentProject(false)}>Save</button>
          <button disabled={!projectId} onClick={() => void exportCurrentProject()}>Project file</button>
          <label className="project-import-button">Import<input type="file" accept=".topomapper,application/json" onChange={importProjectFile} /></label>
          <button disabled={!projectId} onClick={() => void closeCurrentProject()}>Close</button>
          <span className="project-save-state" role="status">{projectStatus}</span>
        </div>
        <div className="topbar-actions">
          <div className="workspace-view-toggle" aria-label="Topomapper workflow">
            <button className={workspaceView === "two-dimensional" ? "active" : ""} onClick={() => setWorkspaceView("two-dimensional")}>2D Map</button>
            <button disabled={!filledLayerPreview} className={workspaceView === "three-dimensional" ? "active" : ""} onClick={() => setWorkspaceView("three-dimensional")}>3D Model</button>
            <button disabled={!filledLayerPreview} className={workspaceView === "assembly" ? "active" : ""} onClick={() => setWorkspaceView("assembly")}>Assembly</button>
            <button disabled={!filledLayerPreview} className={workspaceView === "manufacturing" ? "active" : ""} onClick={() => setWorkspaceView("manufacturing")}>Manufacture</button>
            <button disabled={!filledLayerPreview} className={workspaceView === "smoothing" ? "active" : ""} onClick={() => setWorkspaceView("smoothing")}>Smoothing</button>
            <button disabled={!filledLayerPreview} className={workspaceView === "sheet-layout" ? "active" : ""} onClick={() => setWorkspaceView("sheet-layout")}>Sheet Layout</button>
            <button disabled>G-code</button>
            <button disabled>Colour Chart</button>
            <button disabled>BOM</button>
          </div>
          <div className="stage-pill"><span /> Stage 10 · Sheet Layout</div>
        </div>
      </header>

      <section className="search-panel" aria-label="Place search">
        <div className="panel-heading">
          <span className="eyebrow">NEW ZEALAND WORKSPACE</span>
          <h1>Find a location</h1>
          <p>Navigate the map here. The numbered model-making workflow is on the right.</p>
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
          <span className="section-label">STEP 1 · AREA &amp; FORMAT</span>
          <strong>{selection ? "Selection ready" : "Draw a rectangle"}</strong>
          <p role="status">{selectionStatus}</p>
        </div>

        <div className="output-format-controls">
          <label htmlFor="output-format">Finished format</label>
          <select
            id="output-format"
            value={outputFormat}
            onChange={(event) => {
              setOutputFormat(event.target.value as OutputFormat);
              setSelectionStatus(event.target.value === "free" ? "Free selection enabled." : "Format selected. Draw a new area or fit the current area to it.");
            }}
          >
            <option value="free">Free selection</option>
            <option value="12x8">12 × 8 inch frame</option>
            <option value="a2">A2</option>
            <option value="square">Square</option>
            <option value="custom">Custom millimetres</option>
          </select>
          {outputFormat !== "free" && outputFormat !== "square" && (
            <div className="orientation-buttons" aria-label="Finished format orientation">
              <button className={outputOrientation === "landscape" ? "active" : ""} onClick={() => setOutputOrientation("landscape")}>Landscape</button>
              <button className={outputOrientation === "portrait" ? "active" : ""} onClick={() => setOutputOrientation("portrait")}>Portrait</button>
            </div>
          )}
          {outputFormat === "custom" && (
            <div className="custom-dimensions">
              <label>Width <span><input type="number" min="1" step="1" value={customWidthMm} onChange={(event) => setCustomWidthMm(Math.max(1, Number(event.target.value)))} /> mm</span></label>
              <label>Height <span><input type="number" min="1" step="1" value={customHeightMm} onChange={(event) => setCustomHeightMm(Math.max(1, Number(event.target.value)))} /> mm</span></label>
            </div>
          )}
          <div className="format-summary">
            {chosenOutput ? (
              <><strong>{chosenOutput.width.toFixed(chosenOutput.width % 1 ? 1 : 0)} × {chosenOutput.height.toFixed(chosenOutput.height % 1 ? 1 : 0)} mm</strong><span>Ratio {(chosenOutput.width / chosenOutput.height).toFixed(3)} · drawing lock active</span></>
            ) : <><strong>Any proportion</strong><span>Choose a format to lock the scene shape</span></>}
          </div>
          <button className="fit-format-button" onClick={fitAreaToOutputFormat} disabled={!selection || !chosenOutput}>Fit current area to format</button>
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
          <button onClick={clearSelection} disabled={!selection}>Clear</button>
          <button onClick={resetTaranakiExample}>Reset Taranaki</button>
        </div>

        <section className="elevation-section" aria-labelledby="elevation-heading">
          <div className="elevation-heading-row">
            <div>
              <span className="section-label">STEP 2 · ELEVATION DATA</span>
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
                <span className="section-label">STEP 3 · LAYER PLAN</span>
                <strong id="layer-editor-heading">Elevation boundaries</strong>
              </div>
              <span className={`layer-ready ${layerValidation ? "invalid" : ""}`}>
                {layerValidation ? "Needs attention" : `${layerBoundaries.length - 1} layers`}
              </span>
            </div>
            <p className="layer-intro">Choose how the heights are spaced, then set the number of plywood layers. Sea level and the analysed maximum stay fixed.</p>

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

            <div className="layer-generation-controls">
              <div className="distribution-control">
                <span>Spacing style</span>
                <div className="preset-row" aria-label="Layer spacing style">
                  <button className={layerDistribution === "log" ? "active" : ""} onClick={() => applyLayerDistribution("log")}>Log</button>
                  <button className={layerDistribution === "linear" ? "active" : ""} onClick={() => applyLayerDistribution("linear")}>Linear</button>
                </div>
                <small>{layerDistribution === "log" ? "Logarithmic spacing keeps bands thinner lower down and broader higher up." : "Every elevation band has the same vertical height."}</small>
              </div>
              <div className="layer-count-control">
                <span>Number of layers</span>
                <div className="layer-stepper">
                  <button onClick={() => adjustLayerCount(-1)} disabled={layerCount <= MIN_LAYER_COUNT} aria-label="Decrease number of layers">−</button>
                  <output aria-live="polite" aria-label={`${layerCount} layers`}>{layerCount}</output>
                  <button onClick={() => adjustLayerCount(1)} disabled={layerCount >= MAX_LAYER_COUNT} aria-label="Increase number of layers">+</button>
                </div>
                <small>{MIN_LAYER_COUNT}–{MAX_LAYER_COUNT} layers</small>
              </div>
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

        {analysis && layerBoundaries.length > 0 && (
          <section className="filled-layer-section" aria-labelledby="filled-layer-heading">
            <div className="filled-layer-heading">
              <div>
                <span className="section-label">STEP 4 · FILLED GEOMETRY</span>
                <strong id="filled-layer-heading">Filled 2D layer preview</strong>
              </div>
              {filledLayerPreview && <span>{visibleLayerIndices.length}/{filledLayerPreview.layers.length} visible</span>}
            </div>
            <p>Build cumulative shapes that can eventually be stacked and cut, including separate pieces and enclosed holes.</p>
            <button
              className="generate-layers-button"
              onClick={generateFilledLayerPreview}
              disabled={Boolean(layerValidation) || generatingLayers || processorStatus !== "ready"}
            >
              {generatingLayers ? "Generating filled polygons…" : filledLayerPreview ? "Regenerate 2D preview" : `Generate ${layerBoundaries.length - 1} filled layers`}
            </button>
            <p className={`layer-generation-status ${layerGenerationStatus.includes("could not") || layerGenerationStatus.includes("changed") ? "warning" : ""}`} role="status">{layerGenerationStatus}</p>

            {filledLayerPreview && (
              <div className="filled-layer-results">
                <div className="preview-summary">
                  <span><strong>{filledLayerPreview.layers.length}</strong> cumulative layers</span>
                  <span><strong>{filledLayerPreview.grid.width} × {filledLayerPreview.grid.height}</strong> preview grid</span>
                </div>
                <div className="visibility-actions">
                  <button onClick={() => setAllFilledLayers(true)}>Show all</button>
                  <button onClick={() => setAllFilledLayers(false)}>Hide all</button>
                </div>
                <ol className="filled-layer-list">
                  {[...filledLayerPreview.layers].reverse().map((layer) => {
                    const visible = visibleLayerIndices.includes(layer.index);
                    return (
                      <li key={layer.index} className={visible ? "visible" : ""}>
                        <button onClick={() => toggleFilledLayer(layer.index)} aria-pressed={visible}>
                          <i style={{ backgroundColor: layerColour(layer.lower_elevation, layerMaximum) }} aria-hidden="true" />
                          <span>
                            <strong>Layer {layer.index + 1}</strong>
                            <small>{formatBoundaryValue(layer.lower_elevation)}–{formatBoundaryValue(layer.upper_elevation)} m · {layer.piece_count} piece{layer.piece_count === 1 ? "" : "s"}{layer.hole_count ? ` · ${layer.hole_count} hole${layer.hole_count === 1 ? "" : "s"}` : ""}</small>
                          </span>
                          <b aria-hidden="true">{visible ? "✓" : ""}</b>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </section>
        )}
      </aside>

      {fabricationPreview && measurements && workspaceView === "three-dimensional" && (
        <section className="stack-preview" aria-labelledby="stack-preview-heading">
          <div className="stack-preview-heading">
            <div>
              <span className="section-label">STEP 5 · PHYSICAL STACK</span>
              <strong id="stack-preview-heading">Equal-thickness 3D preview</strong>
            </div>
              <span>{previewDimensions.label} · {Math.round(stackYaw)}° / {Math.round(stackPitch)}°</span>
          </div>
          <div className="stack-preview-toolbar">
            <div className="stack-view-buttons" aria-label="Stack viewpoint">
              <button className={stackView === "three-dimensional" ? "active" : ""} onClick={() => { setStackView("three-dimensional"); setStackPitch(34); }}>3D</button>
              <button className={stackView === "side" ? "active" : ""} onClick={() => { setStackView("side"); setStackPitch(0); }}>Side</button>
              <button className={stackView === "top" ? "active" : ""} onClick={() => { setStackView("top"); setStackPitch(90); }}>Top</button>
              <button onClick={() => { setStackView("three-dimensional"); setStackYaw(0); setStackPitch(34); }}>North up</button>
            </div>
            <label className="thickness-control">Material <span><input type="number" min="0.5" max="50" step="0.5" value={materialThicknessMm} onChange={(event) => setMaterialThicknessMm(Math.max(0.5, Number(event.target.value)))} /> mm</span></label>
            <label className="true-profile-toggle"><input type="checkbox" checked={showTrueElevation} onChange={(event) => setShowTrueElevation(event.target.checked)} disabled={stackView === "top"} /> True-elevation reference</label>
          </div>
          <div className="stack-canvas-wrap">
            <StackPreviewCanvas
              preview={fabricationPreview}
              visibleLayers={visibleLayerIndices}
              modelWidth={previewDimensions.width}
              modelHeight={previewDimensions.height}
              materialThickness={materialThicknessMm}
              groundWidth={measurements.width}
              view={stackView}
              yaw={stackYaw}
              pitch={stackPitch}
              showTrueElevation={showTrueElevation}
              onYawChange={setStackYaw}
              onViewChange={(nextYaw, nextPitch) => { setStackYaw(nextYaw); setStackPitch(nextPitch); setStackView("three-dimensional"); }}
            />
            <span>Drag left/right to rotate and up/down to tilt · dashed orange lines show true scaled elevations</span>
          </div>
          <div className="stack-metrics">
            <span><small>Finished size</small><strong>{previewDimensions.width.toFixed(1)} × {previewDimensions.height.toFixed(1)} mm</strong></span>
            <span><small>Physical height</small><strong>{physicalStackHeight.toFixed(1)} mm</strong></span>
            <span><small>True scaled relief</small><strong>{trueScaledHeight.toFixed(1)} mm</strong></span>
            <span><small>Vertical exaggeration</small><strong>{verticalExaggeration.toFixed(2)}×</strong></span>
          </div>
        </section>
      )}

      {fabricationPreview && assemblyPlan && selectedAssemblyLayer && workspaceView === "assembly" && (
        <section className="assembly-preview" aria-labelledby="assembly-preview-heading">
          <div className="assembly-preview-heading">
            <div>
              <span className="section-label">STAGE 7 · PARTS &amp; REGISTRATION</span>
              <strong id="assembly-preview-heading">Assembly machining plan</strong>
            </div>
            <span className={assemblyPlan.ventComplete ? "ready" : "warning"}>{assemblyPlan.ventComplete ? "Peak vents ready" : "Peak vents need attention"}</span>
          </div>

          <div className="assembly-toolbar">
            <div className="assembly-layer-control">
              <button onClick={() => setAssemblyLayerIndex(Math.max(0, assemblyLayerIndex - 1))} disabled={assemblyLayerIndex === 0} aria-label="Previous physical layer">←</button>
              <select value={assemblyLayerIndex} onChange={(event) => setAssemblyLayerIndex(Number(event.target.value))} aria-label="Physical layer to inspect">
                {fabricationPreview.layers.map((layer) => <option key={layer.index} value={layer.index}>L{String(layer.index + 1).padStart(2, "0")} · {formatBoundaryValue(layer.lower_elevation)}–{formatBoundaryValue(layer.upper_elevation)} m</option>)}
              </select>
              <button onClick={() => setAssemblyLayerIndex(Math.min(filledLayerPreview.layers.length - 1, assemblyLayerIndex + 1))} disabled={assemblyLayerIndex === filledLayerPreview.layers.length - 1} aria-label="Next physical layer">→</button>
            </div>
            <label>Grid pitch <span><input type="number" min="20" step="5" value={gridPitchMm} onChange={(event) => setGridPitchMm(Math.max(20, Number(event.target.value)))} /> mm</span></label>
            <label>Dowel <span><input type="number" min="1" step="0.1" value={dowelDiameterMm} onChange={(event) => setDowelDiameterMm(Math.max(1, Number(event.target.value)))} /> mm</span></label>
            <label>Hole <span><input type="number" min="1" step="0.1" value={holeDiameterMm} onChange={(event) => setHoleDiameterMm(Math.max(1, Number(event.target.value)))} /> mm</span></label>
            <label>Edge clearance <span><input type="number" min="0" step="1" value={holeEdgeClearanceMm} onChange={(event) => setHoleEdgeClearanceMm(Math.max(0, Number(event.target.value)))} /> mm</span></label>
          </div>

          <div className="assembly-workspace">
            <div className="assembly-canvas-wrap">
              <AssemblyPreviewCanvas
                preview={fabricationPreview}
                plan={assemblyPlan}
                layerIndex={assemblyLayerIndex}
                modelWidth={previewDimensions.width}
                modelHeight={previewDimensions.height}
                holeDiameter={holeDiameterMm}
              />
              <div className="assembly-legend"><span><i className="grid-hole" /> Buried grid hole</span><span><i className="vent-hole" /> Peak-to-base vent</span><span><b>↑N</b> covered engraving</span></div>
            </div>

            <aside className="assembly-details">
              <div className="assembly-layer-summary">
                <span><small>Layer</small><strong>L{String(assemblyLayerIndex + 1).padStart(2, "0")}</strong></span>
                <span><small>Parts</small><strong>{selectedAssemblyParts.length}</strong></span>
                <span><small>Drill holes</small><strong>{selectedAssemblyHoles.length}</strong></span>
              </div>
              <p>Orange peak vents pass through every supporting layer to the base and stop beneath a solid cap. White grid holes provide extra alignment where terrain permits.</p>
              <ol className="assembly-part-list">
                {selectedAssemblyParts.map((part) => {
                  const partHoles = assemblyPlan.holes.filter((hole) => hole.partIds.includes(part.id)).length;
                  return <li key={part.id}><strong>{part.id}</strong><span>{Math.round(part.areaMm2).toLocaleString("en-NZ")} mm² · {partHoles} hole{partHoles === 1 ? "" : "s"}</span><small>{part.machineLabel ? "Machine ID + north arrow in covered area" : "Identify on assembly sheet — too small to engrave safely"}</small></li>;
                })}
              </ol>
              <div className="assembly-plan-summary">
                <span><strong>{assemblyPlan.parts.length}</strong> named parts</span>
                <span><strong>{assemblyPlan.holes.filter((hole) => hole.kind === "grid").length}</strong> buried grid holes</span>
                <span><strong>{assemblyPlan.holes.filter((hole) => hole.kind === "vent").length}</strong> peak-to-base vents</span>
              </div>
              {(holeDiameterMm <= dowelDiameterMm || assemblyPlan.warnings.length > 0) && (
                <div className="assembly-warnings" role="status">
                  {holeDiameterMm <= dowelDiameterMm && <p>Hole diameter should normally exceed dowel diameter; confirm with a plywood test cut.</p>}
                  {assemblyPlan.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              )}
            </aside>
          </div>
        </section>
      )}

      {filledLayerPreview && fabricationPreview && originalSmoothingMetrics && smoothedSmoothingMetrics && workspaceView === "smoothing" && (
        <section className="smoothing-preview" aria-labelledby="smoothing-preview-heading">
          <div className="smoothing-preview-heading">
            <div><span className="section-label">STAGE 9 · CUTTER-SCALE CLEANUP</span><strong id="smoothing-preview-heading">Smooth manufacturing outlines</strong></div>
            <span>{(smoothingLevels[smoothingLayerIndex] ?? 0).toFixed(1)} mm cleanup</span>
          </div>
          <div className="smoothing-toolbar">
            <div className="assembly-layer-control">
              <button onClick={() => setSmoothingLayerIndex(Math.max(0, smoothingLayerIndex - 1))} disabled={smoothingLayerIndex === 0} aria-label="Previous smoothing layer">←</button>
              <select value={smoothingLayerIndex} onChange={(event) => setSmoothingLayerIndex(Number(event.target.value))} aria-label="Layer to smooth">
                {fabricationPreview.layers.map((layer) => <option key={layer.index} value={layer.index}>L{String(layer.index + 1).padStart(2, "0")} · {formatBoundaryValue(layer.lower_elevation)}–{formatBoundaryValue(layer.upper_elevation)} m</option>)}
              </select>
              <button onClick={() => setSmoothingLayerIndex(Math.min(fabricationPreview.layers.length - 1, smoothingLayerIndex + 1))} disabled={smoothingLayerIndex === fabricationPreview.layers.length - 1} aria-label="Next smoothing layer">→</button>
            </div>
            <label className="smoothing-range">Cleanup size <strong>{(smoothingLevels[smoothingLayerIndex] ?? 0).toFixed(1)} mm</strong><input type="range" min="0" max="12" step="0.5" value={smoothingLevels[smoothingLayerIndex] ?? 0} onChange={(event) => setLayerSmoothing(Number(event.target.value))} /></label>
            <label className="smoothing-zoom">Zoom <select value={smoothingZoom} onChange={(event) => setSmoothingZoom(Number(event.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>
            <button onClick={applySmoothingToAll}>Apply to all</button>
            <button onClick={() => setSmoothingLevels({})}>Reset all</button>
          </div>
          <div className="smoothing-workspace">
            <div className="smoothing-canvas-wrap">
              <SmoothingPreviewCanvas original={filledLayerPreview} smoothed={fabricationPreview} layerIndex={smoothingLayerIndex} modelWidth={previewDimensions.width} modelHeight={previewDimensions.height} zoom={smoothingZoom} />
              <div className="smoothing-legend"><span><i className="original-edge" /> Original raster edge</span><span><i className="clean-edge" /> Smoothed cut edge</span></div>
            </div>
            <aside className="smoothing-details">
              <p>Frame boundaries remain locked and dead straight. Increasing cleanup rounds raster steps and removes islands or holes smaller than the selected physical size.</p>
              <div className="smoothing-comparison">
                <span><small>Parts</small><b>{originalSmoothingMetrics.parts}</b><strong>{smoothedSmoothingMetrics.parts}</strong></span>
                <span><small>Smallest part</small><b>{originalSmoothingMetrics.smallestPart.toFixed(1)} mm²</b><strong>{smoothedSmoothingMetrics.smallestPart.toFixed(1)} mm²</strong></span>
                <span><small>Holes</small><b>{originalSmoothingMetrics.holes}</b><strong>{smoothedSmoothingMetrics.holes}</strong></span>
                <span><small>Smallest hole</small><b>{originalSmoothingMetrics.smallestHole ? `${originalSmoothingMetrics.smallestHole.toFixed(1)} mm²` : "none"}</b><strong>{smoothedSmoothingMetrics.smallestHole ? `${smoothedSmoothingMetrics.smallestHole.toFixed(1)} mm²` : "none"}</strong></span>
              </div>
              <div className="comparison-key"><span>Original</span><strong>After cleanup</strong></div>
              <ol className="smoothing-layer-list">
                {fabricationPreview.layers.map((layer) => {
                  const metrics = layerGeometryMetrics(fabricationPreview, layer.index, previewDimensions.width, previewDimensions.height);
                  return <li key={layer.index} className={layer.index === smoothingLayerIndex ? "active" : ""}><button onClick={() => setSmoothingLayerIndex(layer.index)}><strong>L{String(layer.index + 1).padStart(2, "0")}</strong><span>{(smoothingLevels[layer.index] ?? 0).toFixed(1)} mm</span><small>{metrics.parts} parts · {metrics.holes} holes</small></button></li>;
                })}
              </ol>
            </aside>
          </div>
        </section>
      )}

      {fabricationPreview && assemblyPlan && workspaceView === "sheet-layout" && (
        <section className="sheet-layout-preview" aria-labelledby="sheet-layout-heading">
          <div className="sheet-layout-heading">
            <div><span className="section-label">STAGE 10 · MANUAL SHEET LAYOUT</span><strong id="sheet-layout-heading">Place production or replacement parts</strong></div>
            <span className={sheetPartDragging ? "checking" : layoutViolations.length ? "warning" : "ready"}>{sheetPartDragging ? "Moving · DRC on release" : layoutViolations.length ? `${layoutViolations.length} DRC warning${layoutViolations.length === 1 ? "" : "s"}` : "DRC clear"}</span>
          </div>
          <div className="sheet-rules-toolbar">
            <label>Sheet W <span><input type="number" min="100" step="10" value={sheetRules.width} onChange={(event) => setSheetRules((rules) => ({ ...rules, width: Math.max(100, Number(event.target.value)) }))} /> mm</span></label>
            <label>Sheet H <span><input type="number" min="100" step="10" value={sheetRules.height} onChange={(event) => setSheetRules((rules) => ({ ...rules, height: Math.max(100, Number(event.target.value)) }))} /> mm</span></label>
            <label>Material <span><input type="number" min="0.5" step="0.5" value={sheetRules.thickness} onChange={(event) => setSheetRules((rules) => ({ ...rules, thickness: Math.max(.5, Number(event.target.value)) }))} /> mm</span></label>
            <label>Edge zone <span><input type="number" min="0" step="1" value={sheetRules.edgeMargin} onChange={(event) => setSheetRules((rules) => ({ ...rules, edgeMargin: Math.max(0, Number(event.target.value)) }))} /> mm</span></label>
            <label>Part spacing <span><input type="number" min="0" step="1" value={sheetRules.partSpacing} onChange={(event) => setSheetRules((rules) => ({ ...rules, partSpacing: Math.max(0, Number(event.target.value)) }))} /> mm</span></label>
            <label>Rotation <span><select value={rotationStepDeg} onChange={(event) => setRotationStepDeg(Number(event.target.value))}><option value={1}>1°</option><option value={2}>2°</option><option value={5}>5°</option><option value={10}>10°</option><option value={15}>15°</option></select></span></label>
            <button onClick={autoLayoutUnplaced}>Auto layout unplaced</button>
            <button onClick={addReplacementSheet}>+ Replacement sheet</button>
            <button disabled={optimizerRunning || !layoutParts.length} onClick={() => void startNestingOptimiser()}>Optimise continuously</button>
            <button disabled={!optimizerRunning} onClick={stopNestingOptimiser}>Stop</button>
          </div>
          <p className={`optimizer-status ${optimizerRunning ? "running" : ""}`} role="status">{optimizerStatus}</p>
          <div className="sheet-tabs" aria-label="Material sheets">
            {Array.from({ length: sheetCount }, (_, index) => <button key={index} className={index === activeSheetIndex ? "active" : ""} onClick={() => { setActiveSheetIndex(index); setSelectedPlacementId(null); setSheetZoom(1); setSheetViewCenter({ x: sheetRules.width / 2, y: sheetRules.height / 2 }); }}>Sheet {index + 1}<small>{sheetPlacements.filter((placement) => placement.sheetIndex === index).length} parts</small></button>)}
            <div className="sheet-view-controls"><span>View</span>{[1, 2, 4, 8].map((value) => <button key={value} className={sheetZoom === value ? "active" : ""} onClick={() => setSheetZoom(value)}>{value}×</button>)}<button onClick={() => { setSheetZoom(1); setSheetViewCenter({ x: sheetRules.width / 2, y: sheetRules.height / 2 }); }}>Fit</button><button disabled={!selectedPlacement} onClick={() => selectedPlacement && focusSheetPlacement(selectedPlacement)}>Focus selected</button><button disabled={!selectedPlacement} onClick={() => { setSelectedPlacementId(null); setSelectedViolationIndex(null); }}>Deselect</button></div>
          </div>
          <div className="sheet-layout-workspace">
            <div className="sheet-canvas-wrap">
              <SheetLayoutCanvas
                rules={sheetRules}
                parts={layoutParts}
                placements={sheetPlacements}
                sheetIndex={activeSheetIndex}
                selectedId={selectedPlacementId}
                violations={layoutViolations}
                highlightedIds={highlightedPlacementIds}
                zoom={sheetZoom}
                viewCenter={sheetViewCenter}
                onSelect={(id) => { setSelectedPlacementId(id); setSelectedViolationIndex(null); }}
                onMove={(id, x, y) => { setSelectedViolationIndex(null); updateSheetPlacement(id, { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 }); }}
                onPan={setSheetViewCenter}
                onDragStateChange={setSheetPartDragging}
              />
              <div className="sheet-scale-note">{sheetRules.width} × {sheetRules.height} mm · {sheetZoom}× view · drag empty sheet to pan · blue halos show {sheetRules.partSpacing} mm clearance</div>
            </div>
            <aside className="sheet-layout-details">
              <div className="sheet-layout-metrics"><span><small>Sheets</small><strong>{sheetCount}</strong></span><span><small>Instances</small><strong>{sheetPlacements.length}</strong></span><span><small>Area use</small><strong>{sheetUtilisation.toFixed(1)}%</strong></span></div>
              <p className="layout-save-status" role="status">Project: {projectName || "none"} · {projectStatus}</p>
              <div className="sheet-export-actions">
                <button disabled={!sheetPlacements.some((placement) => placement.sheetIndex === activeSheetIndex)} onClick={downloadActiveSheetSvg}>Download Sheet {activeSheetIndex + 1} SVG</button>
                <button disabled={!sheetPlacements.length} onClick={downloadAllSheetSvgs}>Download all sheet SVGs</button>
                <button disabled={!sheetPlacements.length} onClick={() => void downloadLayoutGuidePdf()}>Download printable layout guide PDF</button>
              </div>
              <p className="sheet-export-status" role="status">{sheetExportStatus}</p>
              {selectedPlacement && (
                <div className="selected-placement-controls">
                  <strong>{selectedPlacement.partId}</strong><span>Sheet {selectedPlacement.sheetIndex + 1} · {selectedPlacement.rotation}° · X {selectedPlacement.x.toFixed(1)}, Y {selectedPlacement.y.toFixed(1)} mm</span>
                  <div><button onClick={() => updateSheetPlacement(selectedPlacement.id, { rotation: (selectedPlacement.rotation + 359) % 360 })}>−1°</button><button onClick={() => updateSheetPlacement(selectedPlacement.id, { rotation: (selectedPlacement.rotation + 1) % 360 })}>+1°</button><button onClick={() => updateSheetPlacement(selectedPlacement.id, { rotation: (selectedPlacement.rotation + 360 - rotationStepDeg) % 360 })}>−{rotationStepDeg}°</button><button onClick={() => updateSheetPlacement(selectedPlacement.id, { rotation: (selectedPlacement.rotation + rotationStepDeg) % 360 })}>+{rotationStepDeg}°</button><button onClick={() => updateSheetPlacement(selectedPlacement.id, { rotation: (selectedPlacement.rotation + 90) % 360 })}>+90°</button><button onClick={() => { setSheetPlacements((current) => current.filter((placement) => placement.id !== selectedPlacement.id)); setSelectedPlacementId(null); }}>Remove</button></div>
                </div>
              )}
              <label className="part-library-search">Parts library<input value={partLibraryFilter} onChange={(event) => setPartLibraryFilter(event.target.value)} placeholder="Find L06C…" /></label>
              <ol className="part-library-list">
                {layoutParts.filter((part) => part.id.toLowerCase().includes(partLibraryFilter.trim().toLowerCase())).map((part) => {
                  const copies = sheetPlacements.filter((placement) => placement.partId === part.id).length;
                  const activeCopy = sheetPlacements.find((placement) => placement.partId === part.id && placement.sheetIndex === activeSheetIndex);
                  return <li key={part.id}><button className="part-library-focus" disabled={!activeCopy} onClick={() => activeCopy && focusSheetPlacement(activeCopy)}><strong>{part.id}</strong><small>{part.width.toFixed(1)} × {part.height.toFixed(1)} mm · L{String(part.layerIndex + 1).padStart(2, "0")}</small></button><b>{copies} placed</b><button onClick={() => addPartToSheet(part.id)}>Add</button></li>;
                })}
              </ol>
              <div className={`drc-panel ${layoutViolations.length ? "has-warnings" : ""}`}>
                <strong>Design rule check</strong>
                <p>{sheetPartDragging ? "Precise checking is paused while the part follows the pointer and refreshes when released." : "Warnings do not block placement or saving. Clearance follows each part’s rotated coastline."}</p>
                {layoutViolations.length ? <ul>{layoutViolations.slice(0, 12).map((violation, index) => <li key={`${violation.message}-${index}`} className={selectedViolationIndex === index || Boolean(selectedPlacementId && violation.placementIds.includes(selectedPlacementId)) ? "active" : ""}><button onClick={() => { const placement = sheetPlacements.find((candidate) => candidate.id === violation.placementIds[0]); if (placement) focusSheetPlacement(placement, index); }}>{violation.message}</button></li>)}</ul> : <span>No rule violations on placed parts.</span>}
              </div>
            </aside>
          </div>
        </section>
      )}

      {fabricationPreview && assemblyPlan && selectedAssemblyLayer && workspaceView === "manufacturing" && (
        <section className="manufacturing-preview" aria-labelledby="manufacturing-preview-heading">
          <div className="manufacturing-preview-heading">
            <div>
              <span className="section-label">STAGE 8 · MANUFACTURING GEOMETRY</span>
              <strong id="manufacturing-preview-heading">Finished-size SVG files</strong>
            </div>
            <span className="ready">Scale verified in millimetres</span>
          </div>

          <div className="manufacturing-toolbar">
            <div className="assembly-layer-control">
              <button onClick={() => setAssemblyLayerIndex(Math.max(0, assemblyLayerIndex - 1))} disabled={assemblyLayerIndex === 0} aria-label="Previous manufacturing layer">←</button>
              <select value={assemblyLayerIndex} onChange={(event) => setAssemblyLayerIndex(Number(event.target.value))} aria-label="Manufacturing layer to inspect">
                {fabricationPreview.layers.map((layer) => <option key={layer.index} value={layer.index}>L{String(layer.index + 1).padStart(2, "0")} · {formatBoundaryValue(layer.lower_elevation)}–{formatBoundaryValue(layer.upper_elevation)} m</option>)}
              </select>
              <button onClick={() => setAssemblyLayerIndex(Math.min(filledLayerPreview.layers.length - 1, assemblyLayerIndex + 1))} disabled={assemblyLayerIndex === filledLayerPreview.layers.length - 1} aria-label="Next manufacturing layer">→</button>
            </div>
            <button className="download-layer-button" onClick={downloadSelectedLayerSvg}>Download L{String(assemblyLayerIndex + 1).padStart(2, "0")} SVG</button>
            <button className="download-package-button" onClick={downloadManufacturingPackage}>Download all SVGs</button>
          </div>

          <div className="manufacturing-workspace">
            <div className="manufacturing-canvas-wrap">
              <div className="manufacturing-svg-preview" role="img" aria-label={`Finished-size manufacturing geometry for layer ${assemblyLayerIndex + 1}`} dangerouslySetInnerHTML={{ __html: selectedManufacturingSvg }} />
              <div className="manufacturing-legend">
                <span><i className="cut-path" /> Profile cut</span>
                <span><i className="drill-path" /> Drill</span>
                <span><i className="engrave-path" /> Covered engraving</span>
                <span><i className="waste-label-path" /> Waste ID + leader</span>
              </div>
            </div>

            <aside className="manufacturing-details">
              <div className="manufacturing-dimensions">
                <span><small>Width</small><strong>{previewDimensions.width.toFixed(1)} mm</strong></span>
                <span><small>Height</small><strong>{previewDimensions.height.toFixed(1)} mm</strong></span>
                <span><small>Material</small><strong>{materialThicknessMm.toFixed(1)} mm</strong></span>
              </div>
              <p className="manufacturing-status" role="status">{exportStatus}</p>
              <div className="manufacturing-operation-list">
                <span><i className="cut-path" /><b>{selectedAssemblyParts.length}</b><small>part profile{selectedAssemblyParts.length === 1 ? "" : "s"}</small></span>
                <span><i className="drill-path" /><b>{selectedAssemblyHoles.length}</b><small>drill hole{selectedAssemblyHoles.length === 1 ? "" : "s"}</small></span>
                <span><i className="engrave-path" /><b>{selectedAssemblyParts.filter((part) => part.machineLabel).length}</b><small>safe engraving{selectedAssemblyParts.filter((part) => part.machineLabel).length === 1 ? "" : "s"}</small></span>
              </div>
              <p className="waste-label-summary"><strong>{selectedWasteLabels.length}</strong> small-part ID{selectedWasteLabels.length === 1 ? "" : "s"} placed in nearby waste with leaders that stop before the cut edge.</p>
              <h3>Package contents</h3>
              <ul className="manufacturing-file-list">
                <li><strong>{fabricationPreview.layers.length} layer SVGs</strong><span>One finished-size file per sheet layer</span></li>
                <li><strong>Assembly overview</strong><span>Every layer arranged at the same physical scale</span></li>
                <li><strong>Manufacturing notes</strong><span>Dimensions, material, holes and warnings</span></li>
              </ul>
              <div className="manufacturing-note">
                <strong>Geometry only</strong>
                <p>These paths do not yet include cutter compensation, smoothing, tabs or sheet nesting. Those remain visible future steps before G-code is produced.</p>
              </div>
            </aside>
          </div>
        </section>
      )}

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
