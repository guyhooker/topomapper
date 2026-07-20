type Point = { x: number; y: number };
type Part = { id: string; width: number; height: number; areaMm2: number; rings: Point[][] };
type Placement = { id: string; partId: string; sheetIndex: number; x: number; y: number; rotation: number };
type Instance = { id: string; partId: string; preferredRotation: number };
type Rules = { width: number; height: number; edgeMargin: number; partSpacing: number };
type Job = { runId: number; instances: Instance[]; parts: Part[]; rules: Rules; rotationStep: number; attempt: number };

let job: Job | null = null;

function rotate(point: Point, part: Part, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }]
    .map((corner) => ({ x: corner.x * cosine - corner.y * sine, y: corner.x * sine + corner.y * cosine }));
  const minimumX = Math.min(...corners.map((corner) => corner.x));
  const minimumY = Math.min(...corners.map((corner) => corner.y));
  return { x: point.x * cosine - point.y * sine - minimumX, y: point.x * sine + point.y * cosine - minimumY };
}

function rings(placement: Placement, part: Part) {
  return part.rings.map((ring) => ring.map((point) => {
    const transformed = rotate(point, part, placement.rotation);
    return { x: transformed.x + placement.x, y: transformed.y + placement.y };
  }));
}

function bounds(placement: Placement, part: Part) {
  const points = rings(placement, part).flat();
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function pointInRing(point: Point, ring: Point[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const left = ring[index];
    const right = ring[previous];
    if ((left.y > point.y) !== (right.y > point.y) && point.x < (right.x - left.x) * (point.y - left.y) / (right.y - left.y || 1e-12) + left.x) inside = !inside;
  }
  return inside;
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, point: Point) {
  return point.x >= Math.min(a.x, b.x) - 1e-9 && point.x <= Math.max(a.x, b.x) + 1e-9 && point.y >= Math.min(a.y, b.y) - 1e-9 && point.y <= Math.max(a.y, b.y) + 1e-9;
}

function intersects(a: Point, b: Point, c: Point, d: Point) {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return (first * second < 0 && third * fourth < 0)
    || (Math.abs(first) < 1e-9 && onSegment(a, b, c))
    || (Math.abs(second) < 1e-9 && onSegment(a, b, d))
    || (Math.abs(third) < 1e-9 && onSegment(c, d, a))
    || (Math.abs(fourth) < 1e-9 && onSegment(c, d, b));
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const position = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (start.x + position * dx), point.y - (start.y + position * dy));
}

function clearance(leftPlacement: Placement, leftPart: Part, rightPlacement: Placement, rightPart: Part) {
  const leftRings = rings(leftPlacement, leftPart);
  const rightRings = rings(rightPlacement, rightPart);
  if (pointInRing(leftRings[0][0], rightRings[0]) || pointInRing(rightRings[0][0], leftRings[0])) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (const leftRing of leftRings) for (let leftIndex = 1; leftIndex < leftRing.length; leftIndex += 1) {
    const leftStart = leftRing[leftIndex - 1];
    const leftEnd = leftRing[leftIndex];
    for (const rightRing of rightRings) for (let rightIndex = 1; rightIndex < rightRing.length; rightIndex += 1) {
      const rightStart = rightRing[rightIndex - 1];
      const rightEnd = rightRing[rightIndex];
      if (intersects(leftStart, leftEnd, rightStart, rightEnd)) return 0;
      minimum = Math.min(minimum, distanceToSegment(leftStart, rightStart, rightEnd), distanceToSegment(leftEnd, rightStart, rightEnd), distanceToSegment(rightStart, leftStart, leftEnd), distanceToSegment(rightEnd, leftStart, leftEnd));
    }
  }
  return minimum;
}

function fits(candidate: Placement, placements: Placement[], partMap: Map<string, Part>, rules: Rules) {
  const part = partMap.get(candidate.partId);
  if (!part) return false;
  const candidateBounds = bounds(candidate, part);
  if (candidateBounds.left < rules.edgeMargin || candidateBounds.top < rules.edgeMargin || candidateBounds.right > rules.width - rules.edgeMargin || candidateBounds.bottom > rules.height - rules.edgeMargin) return false;
  return placements.every((placement) => {
    if (placement.sheetIndex !== candidate.sheetIndex) return true;
    const otherPart = partMap.get(placement.partId);
    if (!otherPart) return true;
    const otherBounds = bounds(placement, otherPart);
    if (candidateBounds.right + rules.partSpacing <= otherBounds.left || otherBounds.right + rules.partSpacing <= candidateBounds.left || candidateBounds.bottom + rules.partSpacing <= otherBounds.top || otherBounds.bottom + rules.partSpacing <= candidateBounds.top) return true;
    return clearance(candidate, part, placement, otherPart) >= rules.partSpacing;
  });
}

function atOrigin(instance: Instance, part: Part, sheetIndex: number, left: number, top: number, rotation: number): Placement {
  const provisional = { id: instance.id, partId: instance.partId, sheetIndex, x: 0, y: 0, rotation };
  const outline = bounds(provisional, part);
  return { ...provisional, x: left - outline.left, y: top - outline.top };
}

function attempt(jobValue: Job) {
  // The first pass deliberately uses each part's complete rectangular envelope.
  // It is conservative but guarantees a valid recovery layout even when the
  // saved starting arrangement contains overlaps or off-sheet pieces.
  const searchParts = jobValue.attempt === 0 ? jobValue.parts.map((part) => ({
    ...part,
    rings: [[{ x: 0, y: 0 }, { x: part.width, y: 0 }, { x: part.width, y: part.height }, { x: 0, y: part.height }, { x: 0, y: 0 }]],
  })) : jobValue.parts;
  const partMap = new Map(searchParts.map((part) => [part.id, part]));
  const ordered = jobValue.instances.map((instance) => ({ instance, weight: (partMap.get(instance.partId)?.areaMm2 ?? 0) * (jobValue.attempt === 0 ? 1 : .82 + Math.random() * .36) }))
    .sort((left, right) => right.weight - left.weight).map((item) => item.instance);
  const placed: Placement[] = [];
  let sheetCount = 1;
  for (let orderedIndex = 0; orderedIndex < ordered.length; orderedIndex += 1) {
    const instance = ordered[orderedIndex];
    const part = partMap.get(instance.partId);
    if (!part) continue;
    const rotationCount = Math.max(1, Math.floor(360 / jobValue.rotationStep));
    const rotations = [...new Set([instance.preferredRotation, 0, 90, 180, 270, ...Array.from({ length: Math.min(10, rotationCount) }, (_, index) => ((jobValue.attempt * 7 + index * Math.max(1, Math.floor(rotationCount / 10))) % rotationCount) * jobValue.rotationStep)]
      .map((value) => ((Math.round(value / jobValue.rotationStep) * jobValue.rotationStep) % 360 + 360) % 360))];
    let best: Placement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
      const existing = placed.filter((placement) => placement.sheetIndex === sheetIndex);
      const anchors = [{ left: jobValue.rules.edgeMargin, top: jobValue.rules.edgeMargin }];
      for (const placement of existing) {
        const existingPart = partMap.get(placement.partId);
        if (!existingPart) continue;
        const outline = bounds(placement, existingPart);
        anchors.push({ left: outline.right + jobValue.rules.partSpacing, top: outline.top }, { left: outline.left, top: outline.bottom + jobValue.rules.partSpacing }, { left: outline.right + jobValue.rules.partSpacing, top: jobValue.rules.edgeMargin }, { left: jobValue.rules.edgeMargin, top: outline.bottom + jobValue.rules.partSpacing });
      }
      for (let sample = 0; sample < 10; sample += 1) anchors.push({ left: jobValue.rules.edgeMargin + Math.pow(Math.random(), 1.8) * Math.max(0, jobValue.rules.width - jobValue.rules.edgeMargin * 2 - part.width), top: jobValue.rules.edgeMargin + Math.random() * Math.max(0, jobValue.rules.height - jobValue.rules.edgeMargin * 2 - part.height) });
      for (const rotation of rotations) for (const anchor of anchors) {
        const candidate = atOrigin(instance, part, sheetIndex, anchor.left, anchor.top, rotation);
        if (!fits(candidate, placed, partMap, jobValue.rules)) continue;
        const outline = bounds(candidate, part);
        const score = sheetIndex * 1e10 + outline.bottom * 1e5 + outline.right;
        if (score < bestScore) { best = candidate; bestScore = score; }
      }
    }
    if (!best) {
      for (const rotation of rotations) {
        const candidate = atOrigin(instance, part, sheetCount, jobValue.rules.edgeMargin, jobValue.rules.edgeMargin, rotation);
        if (fits(candidate, placed, partMap, jobValue.rules)) { best = candidate; break; }
      }
      if (best) sheetCount += 1;
    }
    if (!best) return null;
    placed.push(best);
    if ((orderedIndex + 1) % 5 === 0 || orderedIndex === ordered.length - 1) postMessage({
      type: "progress",
      runId: jobValue.runId,
      attempt: jobValue.attempt + 1,
      placed: orderedIndex + 1,
      total: ordered.length,
      recovery: jobValue.attempt === 0,
    });
  }
  return placed;
}

function runNext() {
  if (!job) return;
  const current = job;
  const candidate = attempt(current);
  current.attempt += 1;
  postMessage({ type: "attempt", runId: current.runId, attempt: current.attempt, candidate });
}

self.onmessage = (event: MessageEvent) => {
  if (event.data?.type === "start") {
    job = { ...event.data, attempt: 0 };
    runNext();
  } else if (event.data?.type === "continue" && job?.runId === event.data.runId) {
    runNext();
  } else if (event.data?.type === "stop") {
    job = null;
  }
};

export {};
