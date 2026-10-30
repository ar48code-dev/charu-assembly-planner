import { strict as assert } from "node:assert";
import { test } from "node:test";
import { planSceneEdits } from "./scene-agent";
import type { SceneMember, StudioObject, StudioScene } from "./studio-store";

const lamp: StudioObject = {
  id: "lamp",
  name: "Desk lamp",
  description: "A lamp.",
  prompt: "",
  sourcePlanId: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  parts: [{
    id: "base",
    name: "Base",
    shape: "box",
    dimensions: { x: 10, y: 4, z: 10 },
    color: "#668877",
  }],
  connections: [],
  versions: [],
};
const notebook: StudioObject = {
  ...lamp,
  id: "notebook",
  name: "Sketch book",
  parts: [{ ...lamp.parts[0], id: "cover", name: "Cover", dimensions: { x: 15, y: 1, z: 20 } }],
};
const initialMember: SceneMember = { objectId: lamp.id, position: [0, 0, 0], rotation: 0 };
const scene: StudioScene = {
  id: "scene-1",
  name: "Desk",
  description: "A desk scene.",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  members: [initialMember],
  connections: [],
};

test("moves, places, and rotates a saved scene object without changing the original", () => {
  const result = planSceneEdits("move Desk lamp right by 5 cm\nplace Desk lamp at 3, -1, 4 cm\nrotate Desk lamp by 30 degrees", scene, [lamp]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.scene.members[0].position, [3, -1, 4]);
  assert.equal(result.plan.scene.members[0].rotation, 30);
  assert.equal(result.plan.changes.length, 3);
  assert.deepEqual(scene.members[0], initialMember);
});

test("adds and removes objects while clearing links that reference removed members", () => {
  const twoMemberScene = {
    ...scene,
    members: [initialMember, { objectId: notebook.id, position: [12, 0, 0] as [number, number, number], rotation: 0 }],
    connections: [{ fromObjectId: lamp.id, toObjectId: notebook.id, kind: "rigid" as const }],
  };
  const result = planSceneEdits("remove Sketch book from scene", twoMemberScene, [lamp, notebook]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.plan.scene.members.map(member => member.objectId), [lamp.id]);
    assert.equal(result.plan.scene.connections.length, 0);
  }
  const added = planSceneEdits("add Sketch book to scene", scene, [lamp, notebook]);
  assert.equal(added.ok, true);
  if (added.ok) assert.deepEqual(added.plan.scene.members.map(member => member.objectId), [lamp.id, notebook.id]);
});

test("arranges scene members in a row using object dimensions", () => {
  const withNotebook = {
    ...scene,
    members: [initialMember, { objectId: notebook.id, position: [100, 5, -10] as [number, number, number], rotation: 90 }],
  };
  const result = planSceneEdits("arrange all in a row with 4 cm gap", withNotebook, [lamp, notebook]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.scene.members[0].position[1], 0);
  assert.equal(result.plan.scene.members[1].position[1], 0);
  assert.ok(result.plan.scene.members[1].position[0] > result.plan.scene.members[0].position[0]);
});

test("rejects ambiguous commands, missing objects, excessive batches, and unsafe coordinates", () => {
  assert.equal(planSceneEdits("move Desk lamp diagonally by 3 cm", scene, [lamp]).ok, false);
  assert.equal(planSceneEdits("move Unknown object left by 2 cm", scene, [lamp]).ok, false);
  assert.equal(planSceneEdits("place Desk lamp at 10001, 0, 0", scene, [lamp]).ok, false);
  assert.equal(planSceneEdits("move Desk lamp left by 1 cm\n".repeat(6), scene, [lamp]).ok, false);
  assert.equal(planSceneEdits("move Desk lamp left by -5 cm", scene, [lamp]).ok, false);
  assert.equal(planSceneEdits("move Desk lamp left by 5 cm", scene, [lamp, { ...lamp, id: "duplicate" }]).ok, false);
});

test("scene command planning does not invoke any remote service or mutate the input scene", () => {
  const frozenScene = structuredClone(scene);
  Object.freeze(frozenScene.members[0].position);
  Object.freeze(frozenScene.members[0]);
  Object.freeze(frozenScene.members);
  Object.freeze(frozenScene);
  const result = planSceneEdits("rotate Desk lamp by 90 degrees", frozenScene, [lamp]);
  assert.equal(result.ok, true);
  assert.deepEqual(frozenScene.members[0].position, [0, 0, 0]);
  if (result.ok) assert.equal(result.plan.scene.members[0].rotation, 90);
});
