type Point = { x: number; y: number };
type Part = { id: string; width: number; height: number; areaMm2: number; rings: Point[][]; searchErrorMm?: number };
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

function envelopeBounds(placement: Placement, part: Part) {
  const radians = placement.rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return { left: placement.x, top: placement.y, right: placement.x + part.width * cosine + part.height * sine, bottom: placement.y + part.width * sine + part.height * cosine };
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

function proxyClearanceAllowance(leftPart: Part, rightPart: Part) {
  // Applying the full simplification error to both outlines created visibly
  // excessive gaps. Exact full-resolution DRC still validates every published
  // candidate on the main thread.
  return Math.min(1.5, ((leftPart.searchErrorMm ?? 0) + (rightPart.searchErrorMm ?? 0)) * .2);
}

function fits(candidate: Placement, placements: Placement[], partMap: Map<string, Part>, rules: Rules) {
  const part = partMap.get(candidate.partId);
  if (!part) return false;
  const candidateBounds = envelopeBounds(candidate, part);
  if (candidateBounds.left < rules.edgeMargin || candidateBounds.top < rules.edgeMargin || candidateBounds.right > rules.width - rules.edgeMargin || candidateBounds.bottom > rules.height - rules.edgeMargin) return false;
  return placements.every((placement) => {
    if (placement.sheetIndex !== candidate.sheetIndex) return true;
    const otherPart = partMap.get(placement.partId);
    if (!otherPart) return true;
    const otherBounds = bounds(placement, otherPart);
    const safeSpacing = rules.partSpacing + proxyClearanceAllowance(part, otherPart) + .25;
    if (candidateBounds.right + safeSpacing <= otherBounds.left || otherBounds.right + safeSpacing <= candidateBounds.left || candidateBounds.bottom + safeSpacing <= otherBounds.top || otherBounds.bottom + safeSpacing <= candidateBounds.top) return true;
    return clearance(candidate, part, placement, otherPart) >= safeSpacing;
  });
}

function atOrigin(instance: Instance, part: Part, sheetIndex: number, left: number, top: number, rotation: number): Placement {
  return { id: instance.id, partId: instance.partId, sheetIndex, x: left, y: top, rotation };
}

function sampledContactAnchors(instance: Instance, part: Part, rotation: number, existing: Placement[], partMap: Map<string, Part>, spacing: number, attemptIndex: number) {
  const movingPlacement = atOrigin(instance, part, 0, 0, 0, rotation);
  const movingRing = rings(movingPlacement, part)[0];
  if (!movingRing?.length) return [];
  const anchors: { x: number; y: number }[] = [];
  for (const placement of existing) {
    const stationaryPart = partMap.get(placement.partId);
    if (!stationaryPart) continue;
    const stationaryRing = rings(placement, stationaryPart)[0];
    if (!stationaryRing?.length) continue;
    const stationaryCentre = stationaryRing.reduce((total, point) => ({ x: total.x + point.x / stationaryRing.length, y: total.y + point.y / stationaryRing.length }), { x: 0, y: 0 });
    const samples = Math.min(5, stationaryRing.length, movingRing.length);
    for (let sample = 0; sample < samples; sample += 1) {
      const stationaryIndex = (attemptIndex * 7 + sample * Math.max(1, Math.floor(stationaryRing.length / samples))) % stationaryRing.length;
      const movingIndex = (attemptIndex * 11 + sample * Math.max(1, Math.floor(movingRing.length / samples))) % movingRing.length;
      const stationary = stationaryRing[stationaryIndex];
      const moving = movingRing[movingIndex];
      const next = stationaryRing[(stationaryIndex + 1) % stationaryRing.length];
      const radialLength = Math.max(.001, Math.hypot(stationary.x - stationaryCentre.x, stationary.y - stationaryCentre.y));
      const edgeLength = Math.max(.001, Math.hypot(next.x - stationary.x, next.y - stationary.y));
      const directions = [
        { x: (stationary.x - stationaryCentre.x) / radialLength, y: (stationary.y - stationaryCentre.y) / radialLength },
        { x: -(next.y - stationary.y) / edgeLength, y: (next.x - stationary.x) / edgeLength },
        { x: (next.y - stationary.y) / edgeLength, y: -(next.x - stationary.x) / edgeLength },
      ];
      const safeSpacing = spacing + proxyClearanceAllowance(part, stationaryPart);
      for (const direction of directions) anchors.push({ x: stationary.x - moving.x + direction.x * safeSpacing, y: stationary.y - moving.y + direction.y * safeSpacing });
    }
  }
  return anchors;
}

function evenlySample(values: number[], limit: number, offset: number) {
  const unique = [...new Set(values.map((value) => Math.round(value * 2) / 2))].sort((left, right) => left - right);
  if (unique.length <= limit) return unique;
  const sampled = new Set<number>([unique[0], unique[unique.length - 1]]);
  for (let index = 1; sampled.size < limit && index < limit * 2; index += 1) {
    const position = Math.min(unique.length - 1, Math.floor((index + (offset % 3) / 3) * (unique.length - 1) / (limit - 1)));
    sampled.add(unique[position]);
  }
  return [...sampled].sort((left, right) => left - right);
}

function cavityAnchors(existing: Placement[], partMap: Map<string, Part>, rules: Rules, attemptIndex: number) {
  const xValues = [rules.edgeMargin];
  const yValues = [rules.edgeMargin];
  for (const placement of existing) {
    const placedPart = partMap.get(placement.partId);
    if (!placedPart) continue;
    const outline = bounds(placement, placedPart);
    xValues.push(outline.left, outline.right + rules.partSpacing);
    yValues.push(outline.top, outline.bottom + rules.partSpacing);
  }
  const xs = evenlySample(xValues, 20, attemptIndex);
  const ys = evenlySample(yValues, 20, attemptIndex + 1);
  return ys.flatMap((top) => xs.map((left) => ({ left, top })));
}

function placementGrowthScore(candidate: Placement, part: Part, existing: Placement[], partMap: Map<string, Part>, rules: Rules) {
  const candidateBounds = bounds(candidate, part);
  const existingBounds = existing.map((placement) => {
    const existingPart = partMap.get(placement.partId);
    return existingPart ? bounds(placement, existingPart) : null;
  }).filter((value): value is ReturnType<typeof bounds> => Boolean(value));
  const currentRight = existingBounds.length ? Math.max(...existingBounds.map((outline) => outline.right)) : rules.edgeMargin;
  const currentBottom = existingBounds.length ? Math.max(...existingBounds.map((outline) => outline.bottom)) : rules.edgeMargin;
  const nextRight = Math.max(currentRight, candidateBounds.right);
  const nextBottom = Math.max(currentBottom, candidateBounds.bottom);
  const currentArea = Math.max(0, currentRight - rules.edgeMargin) * Math.max(0, currentBottom - rules.edgeMargin);
  const nextArea = Math.max(0, nextRight - rules.edgeMargin) * Math.max(0, nextBottom - rules.edgeMargin);
  const sheetArea = Math.max(1, rules.width * rules.height);
  return candidate.sheetIndex * 1e12
    + (nextArea - currentArea) / sheetArea * 1e9
    + nextRight / Math.max(1, rules.width) * 1e6
    + nextBottom / Math.max(1, rules.height) * 1e3;
}

function compactTowardOrigin(placements: Placement[], partMap: Map<string, Part>, rules: Rules) {
  const compacted = placements.map((placement) => ({ ...placement }));
  const movedIds = new Set<string>();
  let distanceMm = 0;
  function settle(axis: "x" | "y") {
    let passDistance = 0;
    const order = compacted.map((placement, index) => ({ placement, index }))
      .sort((left, right) => left.placement.sheetIndex - right.placement.sheetIndex
        || (axis === "x"
          ? bounds(left.placement, partMap.get(left.placement.partId)!).left - bounds(right.placement, partMap.get(right.placement.partId)!).left
          : bounds(left.placement, partMap.get(left.placement.partId)!).top - bounds(right.placement, partMap.get(right.placement.partId)!).top)
        || (partMap.get(right.placement.partId)?.areaMm2 ?? 0) - (partMap.get(left.placement.partId)?.areaMm2 ?? 0));
    for (const item of order) {
      const index = item.index;
      const part = partMap.get(compacted[index].partId);
      if (!part) continue;
      let current = compacted[index];
      const startingPosition = current[axis];
      const others = compacted.filter((_, placementIndex) => placementIndex !== index);
      for (const step of [10, 2, .5]) {
        while (true) {
          const candidate = { ...current, [axis]: current[axis] - step };
          if (!fits(candidate, others, partMap, rules)) break;
          current = candidate;
        }
      }
      compacted[index] = current;
      const moved = startingPosition - current[axis];
      if (moved > .01) {
        movedIds.add(current.id);
        distanceMm += moved;
        passDistance += moved;
      }
    }
    return passDistance;
  }
  for (let pass = 0; pass < 4; pass += 1) {
    if (settle("x") + settle("y") < .01) break;
  }
  return { placements: compacted, movedParts: movedIds.size, distanceMm };
}

function attempt(jobValue: Job) {
  // The first pass deliberately uses each part's complete rectangular envelope.
  // It is conservative but guarantees a valid recovery layout even when the
  // saved starting arrangement contains overlaps or off-sheet pieces.
  const searchParts = jobValue.attempt === 0 ? jobValue.parts.map((part) => ({
    ...part,
    searchErrorMm: 0,
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
      if (jobValue.attempt > 0) anchors.push(...cavityAnchors(existing, partMap, jobValue.rules, jobValue.attempt));
      for (const rotation of rotations) {
        const contactAnchors = jobValue.attempt === 0 ? [] : sampledContactAnchors(instance, part, rotation, existing, partMap, jobValue.rules.partSpacing + .25, jobValue.attempt);
        const candidates = [
          ...anchors.map((anchor) => atOrigin(instance, part, sheetIndex, anchor.left, anchor.top, rotation)),
          ...contactAnchors.map((anchor) => ({ id: instance.id, partId: instance.partId, sheetIndex, x: anchor.x, y: anchor.y, rotation })),
        ];
        for (const candidate of candidates) {
        if (!fits(candidate, placed, partMap, jobValue.rules)) continue;
        const score = placementGrowthScore(candidate, part, existing, partMap, jobValue.rules);
        if (score < bestScore) { best = candidate; bestScore = score; }
        }
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
  postMessage({ type: "compacting", runId: jobValue.runId, attempt: jobValue.attempt + 1 });
  return compactTowardOrigin(placed, partMap, jobValue.rules);
}

function runNext() {
  if (!job) return;
  const current = job;
  const result = attempt(current);
  current.attempt += 1;
  postMessage({
    type: "attempt",
    runId: current.runId,
    attempt: current.attempt,
    candidate: result?.placements ?? null,
    compactedParts: result?.movedParts ?? 0,
    compactedDistanceMm: result?.distanceMm ?? 0,
  });
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
