// A deterministic toy dataset and weighted k-means example, not a benchmark.
export const pointCount = 1200;
export const representativeCount = 24;

export function makePoints() {
  let seed = 42;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const spread = () => Array.from({ length: 6 }, random).reduce((a, b) => a + b, 0) - 3;
  const clusters = [
    { x: 148, y: 116, sx: 55, sy: 43 },
    { x: 318, y: 222, sx: 50, sy: 42 },
    { x: 468, y: 111, sx: 55, sy: 45 }
  ];
  return clusters.flatMap(cluster => Array.from({ length: pointCount / 3 }, () => ({
    x: Math.max(35, Math.min(565, cluster.x + spread() * cluster.sx)),
    y: Math.max(35, Math.min(290, cluster.y + spread() * cluster.sy)),
    weight: 1
  })));
}

export function squaredDistance(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function nearest(point, centers) {
  let best = 0;
  for (let i = 1; i < centers.length; i++) {
    if (squaredDistance(point, centers[i]) < squaredDistance(point, centers[best])) best = i;
  }
  return best;
}

export function objective(points, centers) {
  return points.reduce((sum, point) => sum + point.weight * squaredDistance(point, centers[nearest(point, centers)]), 0);
}

export function lloydStep(points, centers) {
  const sums = centers.map(() => ({ x: 0, y: 0, weight: 0 }));
  for (const point of points) {
    const sum = sums[nearest(point, centers)];
    sum.x += point.x * point.weight;
    sum.y += point.y * point.weight;
    sum.weight += point.weight;
  }
  return sums.map((sum, i) => sum.weight
    ? { x: sum.x / sum.weight, y: sum.y / sum.weight }
    : { ...centers[i] });
}

// Quantize the toy cloud into small groups; retain one original point per group.
// These group weights illustrate a coreset's role without claiming a size bound.
export function compress(points, count = representativeCount) {
  let centers = [{ ...points[0] }];
  while (centers.length < count) {
    let farthest = points[0];
    for (const point of points) {
      if (squaredDistance(point, centers[nearest(point, centers)]) >
          squaredDistance(farthest, centers[nearest(farthest, centers)])) farthest = point;
    }
    centers.push({ ...farthest });
  }
  for (let iteration = 0; iteration < 5; iteration++) centers = lloydStep(points, centers);
  const groups = centers.map(() => []);
  points.forEach((point, index) => groups[nearest(point, centers)].push(index));
  const representatives = [];
  const membership = Array(points.length);
  groups.forEach((group, centerIndex) => {
    if (!group.length) return;
    const medoid = group.reduce((best, index) =>
      squaredDistance(points[index], centers[centerIndex]) < squaredDistance(points[best], centers[centerIndex]) ? index : best);
    const representativeIndex = representatives.length;
    representatives.push({ ...points[medoid], weight: group.length, sourceIndex: medoid });
    group.forEach(index => { membership[index] = representativeIndex; });
  });
  return { representatives, membership };
}

export function solve(points) {
  const history = [[{ x: 228, y: 183 }, { x: 301, y: 91 }, { x: 422, y: 232 }]];
  for (let iteration = 0; iteration < 9; iteration++) {
    const previous = history[history.length - 1];
    const next = lloydStep(points, previous);
    history.push(next);
    if (next.every((center, i) => squaredDistance(center, previous[i]) < 0.0001)) break;
  }
  return history;
}

export function makeExample() {
  const points = makePoints();
  const { representatives, membership } = compress(points);
  const history = solve(representatives);
  const centers = history[history.length - 1];
  return { points, representatives, membership, history, centers,
    assignments: points.map(point => nearest(point, centers)) };
}
