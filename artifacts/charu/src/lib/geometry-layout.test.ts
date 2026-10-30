import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as THREE from "three";
import { cylinderAxis, primitiveFaces, resolvePartLayout, worldPoint, type ViewportPart } from "./geometry-layout";
import { createPartGeometry, createPartGroup } from "./three-model";

const part = (id: string, dimensions = {x: 2, y: 2, z: 30}, shape: "box" | "cylinder" = "cylinder"): ViewportPart =>
  ({id, name: id, dimensions, shape, color: "#8bc6c1"});
const close = (a: number, b: number) => assert.ok(Math.abs(a-b) < 1e-5, `${a} != ${b}`);

for (const [axis, dimensions] of [
  ["z", {x: 2,y: 2,z: 30}], ["x", {x: 30,y: 2,z: 2}], ["y", {x: 10,y: 2,z: 10}],
  ["y", {x: 2,y: 30,z: 2}], ["y", {x: 3,y: 3,z: 3}], ["z", {x: 2,y: 3,z: 30}],
] as const) {
  test(`cylinder ${JSON.stringify(dimensions)} infers ${axis} and preserves XYZ extents in 3D and SVG`, () => {
    const p = part("cylinder", dimensions);
    assert.equal(cylinderAxis(dimensions), axis);
    const geometry = createPartGeometry(p);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!.getSize(new THREE.Vector3());
    const faces = primitiveFaces(p).flat();
    for (const a of ["x","y","z"] as const) {
      close(bounds[a], dimensions[a]);
      close(Math.max(...faces.map(v => v[a])) - Math.min(...faces.map(v => v[a])), dimensions[a]);
    }
    geometry.dispose();
  });
}

test("the live proposal's different-size parts are centered, grounded and non-overlapping", () => {
  const inputs = [
    part("base", {x:10,y:10,z:2}, "box"), part("rail"),
    part("carriage", {x:8,y:5,z:3}, "box"), part("foot", {x:5,y:5,z:2}, "box"),
  ];
  const resolved = resolvePartLayout(inputs);
  resolved.forEach((p, index) => {
    close(p.position![1], p.dimensions.y / 2);
    if (index) assert.ok(p.position![0] - p.dimensions.x/2 > resolved[index-1].position![0] + resolved[index-1].dimensions.x/2);
  });
  close(resolved[0].position![0] - 5, -(resolved[3].position![0] + 2.5));
  assert.equal(inputs[0].position, undefined, "layout must not mutate model output");
});

test("rotated parts use their rotated width and explicit positions stay unchanged", () => {
  const positioned = {...part("fixed", {x:4,y:2,z:8}, "box"), position: [20,3,1] as [number,number,number]};
  const rotated = {...part("rotated", {x:2,y:2,z:30}), rotation:Math.PI/2};
  const [fixed, moving] = resolvePartLayout([positioned, rotated]);
  assert.deepEqual(fixed.position, [20,3,1]);
  assert.ok(moving.position![0] - 15 > 22);
});

test("group layout remains local and SVG world centers agree with Three.js scene transforms", () => {
  const p = {...part("grouped"), groupId:"object", groupPosition:[10,4,-7] as [number,number,number], rotation:Math.PI/2};
  const resolved = resolvePartLayout([p])[0];
  const root = createPartGroup([resolved]);
  root.updateMatrixWorld(true);
  const mesh = root.getObjectByName("grouped")!;
  const actual = mesh.getWorldPosition(new THREE.Vector3());
  const svg = worldPoint(resolved, {x:0,y:0,z:0});
  close(actual.x, svg.x); close(actual.y, svg.y); close(actual.z, svg.z);
});

test("independent object groups do not affect each other's automatic local spacing", () => {
  const a = {...part("a"),groupId:"a"}, b = {...part("b"),groupId:"b"};
  const [first, second] = resolvePartLayout([a,b]);
  close(first.position![0], 0); close(second.position![0], 0);
});
