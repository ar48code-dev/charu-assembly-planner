import type { AssemblyPart } from "@workspace/api-client-react";

export type Axis = "x" | "y" | "z";
export type Vec3 = [number, number, number];
export type ViewportPart = AssemblyPart & {
  position?: Vec3;
  rotation?: number;
  groupId?: string;
  groupPosition?: Vec3;
};
export interface Point3 { x: number; y: number; z: number }

// Dimensions are full XYZ extents, never an implicit radius or height.
// With no explicit cylinder axis in the API, infer it from the closest
// perpendicular pair. Equal XYZ extents conventionally use the Y axis.
export function cylinderAxis(dimensions: AssemblyPart["dimensions"]): Axis {
  const axes: Axis[] = ["y", "x", "z"];
  return axes.reduce((best, axis) => {
    const error = (candidate: Axis) => {
      const perpendicular = axes.filter(a => a !== candidate);
      const a = dimensions[perpendicular[0]], b = dimensions[perpendicular[1]];
      return Math.abs(a - b) / Math.max(a, b);
    };
    return error(axis) < error(best) - 1e-9 ? axis : best;
  }, "y");
}

function projectedWidth(part: ViewportPart) {
  const angle = part.groupId ? 0 : part.rotation ?? 0;
  return Math.abs(Math.cos(angle)) * part.dimensions.x + Math.abs(Math.sin(angle)) * part.dimensions.z;
}

/** Dimension-aware exploded inspection; explicit user positions are preserved. */
export function resolvePartLayout(parts: ViewportPart[]): ViewportPart[] {
  const groups = new Map<string, ViewportPart[]>();
  for (const part of parts) {
    const key = part.groupId ?? "";
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  const positions = new Map<ViewportPart, Vec3>();
  for (const members of groups.values()) {
    const gap = Math.max(.25, ...members.flatMap(p => Object.values(p.dimensions).map(d => d * .12)));
    const fixed = members.filter(p => p.position);
    let cursor = fixed.length ? Math.max(...fixed.map(p => p.position![0] + projectedWidth(p) / 2)) + gap : 0;
    const start = cursor;
    for (const part of members) {
      if (part.position) { positions.set(part, [...part.position]); continue; }
      const width = projectedWidth(part);
      positions.set(part, [cursor + width / 2, part.dimensions.y / 2, 0]);
      cursor += width + gap;
    }
    if (!fixed.length) {
      const center = (start + cursor - gap) / 2;
      for (const part of members) positions.get(part)![0] -= center;
    }
  }
  return parts.map(part => ({ ...part, position: positions.get(part)! }));
}

export function worldPoint(part: ViewportPart, point: Point3): Point3 {
  const position = part.position ?? [0, part.dimensions.y / 2, 0];
  const root = part.groupPosition ?? [0, 0, 0];
  const yaw = part.rotation ?? 0;
  const x = point.x + (part.groupId ? position[0] : 0);
  const z = point.z + (part.groupId ? position[2] : 0);
  return {
    x: root[0] + x * Math.cos(yaw) + z * Math.sin(yaw) + (part.groupId ? 0 : position[0]),
    y: root[1] + position[1] + point.y,
    z: root[2] - x * Math.sin(yaw) + z * Math.cos(yaw) + (part.groupId ? 0 : position[2]),
  };
}

/** Shared primitive surfaces for the SVG inspection of the same XYZ geometry. */
export function primitiveFaces(part: ViewportPart): Point3[][] {
  const { x, y, z } = part.dimensions;
  if (part.shape === "box") {
    const points = [
      [-x/2,-y/2,-z/2], [x/2,-y/2,-z/2], [x/2,-y/2,z/2], [-x/2,-y/2,z/2],
      [-x/2,y/2,-z/2], [x/2,y/2,-z/2], [x/2,y/2,z/2], [-x/2,y/2,z/2],
    ].map(([x,y,z]) => ({x,y,z}));
    return [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]].map(face => face.map(i => points[i]));
  }
  const axis = cylinderAxis(part.dimensions);
  const perpendicular = (["x", "y", "z"] as Axis[]).filter(a => a !== axis);
  const rings = [-1, 1].map(sign => Array.from({length: 32}, (_, i) => {
    const p = {x: 0, y: 0, z: 0};
    p[axis] = sign * part.dimensions[axis] / 2;
    p[perpendicular[0]] = Math.cos(i * Math.PI / 16) * part.dimensions[perpendicular[0]] / 2;
    p[perpendicular[1]] = Math.sin(i * Math.PI / 16) * part.dimensions[perpendicular[1]] / 2;
    return p;
  }));
  return [
    rings[0], rings[1],
    ...rings[0].map((p, i) => [p, rings[0][(i+1)%32], rings[1][(i+1)%32], rings[1][i]]),
  ];
}
