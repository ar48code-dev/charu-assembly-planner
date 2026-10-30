import { resolvePartLayout } from "./geometry-layout";
import type { SceneMember, StudioObject, StudioScene } from "./studio-store";

export interface SceneEditPlan {
  scene: StudioScene;
  changes: string[];
}

export type SceneEditResult =
  | { ok: true; plan: SceneEditPlan }
  | { ok: false; error: string };

const MAX_SCENE_MEMBERS = 20;
const MAX_POSITION_CM = 10_000;
const MAX_COMMAND_LINES = 5;

function normalizeScene(scene: StudioScene): StudioScene {
  return {
    ...scene,
    members: scene.members.map(member => ({ ...member, position: [...member.position] as SceneMember["position"] })),
    connections: scene.connections.map(connection => ({ ...connection })),
  };
}

function findTarget(
  text: string,
  objects: StudioObject[],
): { object: StudioObject; tail: string } | null {
  const normalized = text.trim().toLocaleLowerCase();
  const ordered = [...objects].sort((a, b) => b.name.length - a.name.length);
  for (const object of ordered) {
    const name = object.name.toLocaleLowerCase();
    if ((normalized === name || normalized.startsWith(`${name} `))
      && objects.filter(item => item.name.toLocaleLowerCase() === name).length > 1) {
      throw new Error(`More than one saved object is named “${object.name}”. Give them distinct names before using scene commands.`);
    }
    if (normalized === name) return { object, tail: "" };
    if (normalized.startsWith(`${name} `)) return { object, tail: text.trim().slice(object.name.length).trim() };
  }
  return null;
}

function objectWidthCm(object: StudioObject, rotationDegrees = 0): number {
  const laidOut = resolvePartLayout(object.parts.map(part => ({ ...part })));
  if (!laidOut.length) return 1;
  const angle = rotationDegrees * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const extents = laidOut.map(part => {
    const center = part.position![0] * cos + part.position![2] * sin;
    const halfWidth = Math.abs(cos) * part.dimensions.x / 2 + Math.abs(sin) * part.dimensions.z / 2;
    return { min: center - halfWidth, max: center + halfWidth };
  });
  const min = Math.min(...extents.map(part => part.min));
  const max = Math.max(...extents.map(part => part.max));
  return Math.max(1, max - min);
}

function addPosition(scene: StudioScene, object: StudioObject, objects: StudioObject[]): SceneMember["position"] {
  if (!scene.members.length) return [0, 0, 0];
  const objectById = new Map(objects.map(item => [item.id, item]));
  const rightEdge = Math.max(...scene.members.map(member => {
    const memberObject = objectById.get(member.objectId);
    return member.position[0] + (memberObject ? objectWidthCm(memberObject, member.rotation) / 2 : 0);
  }));
  return [rightEdge + objectWidthCm(object) / 2 + 2, 0, 0];
}

function isSafePosition(position: number[]) {
  return position.length === 3 && position.every(value => Number.isFinite(value) && Math.abs(value) <= MAX_POSITION_CM);
}

function applyLine(line: string, scene: StudioScene, objects: StudioObject[]): string {
  const lower = line.toLocaleLowerCase();

  if (/^(arrange|line up)\b/.test(lower)) {
    const match = lower.match(/^(?:arrange|line up)(?: all| the scene| objects)?(?: in a row)?(?: with (-?\d+(?:\.\d+)?) cm gap)?$/);
    if (!match) throw new Error(`I could not understand “${line}”. Try “arrange all in a row with 2 cm gap”.`);
    const gap = match[1] === undefined ? 2 : Number(match[1]);
    if (!Number.isFinite(gap) || gap < 0 || gap > 100) throw new Error("The row gap must be between 0 and 100 cm.");
    if (!scene.members.length) throw new Error("Add at least one object before arranging a scene.");
    const objectById = new Map(objects.map(item => [item.id, item]));
    const widths = scene.members.map(member => {
      const object = objectById.get(member.objectId);
      return object ? objectWidthCm(object, member.rotation) : 1;
    });
    const fullWidth = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
    if (fullWidth > MAX_POSITION_CM) throw new Error("This row would exceed the supported scene range.");
    let cursor = -fullWidth / 2;
    scene.members = scene.members.map((member, index) => {
      const width = widths[index];
      const position: SceneMember["position"] = [cursor + width / 2, 0, 0];
      cursor += width + gap;
      return { ...member, position };
    });
    return `Arranged ${scene.members.length} scene objects in a row with ${gap} cm gaps.`;
  }

  const prefix = lower.startsWith("move ") ? "move "
    : lower.startsWith("place ") ? "place "
    : lower.startsWith("rotate ") ? "rotate "
    : lower.startsWith("add ") ? "add "
    : lower.startsWith("remove ") ? "remove "
    : null;
  if (!prefix) throw new Error(`I could not safely interpret “${line}”. Use move, place, rotate, add, remove, or arrange commands.`);

  const target = findTarget(line.slice(prefix.length), objects);
  if (!target) throw new Error(`Name a saved object exactly in “${line}”.`);
  const memberIndex = scene.members.findIndex(member => member.objectId === target.object.id);
  const name = target.object.name;

  if (prefix === "add ") {
    if (!/^(?:to the scene|to scene)?$/i.test(target.tail)) throw new Error(`Use “add ${name} to scene”.`);
    if (memberIndex >= 0) throw new Error(`${name} is already in this scene.`);
    if (scene.members.length >= MAX_SCENE_MEMBERS) throw new Error(`Scenes are limited to ${MAX_SCENE_MEMBERS} objects.`);
    scene.members.push({ objectId: target.object.id, position: addPosition(scene, target.object, objects), rotation: 0 });
    return `Added ${name} to the scene.`;
  }

  if (memberIndex < 0) throw new Error(`${name} is not in the selected scene. Add it first.`);

  if (prefix === "remove ") {
    if (!/^(?:from the scene|from scene)?$/i.test(target.tail)) throw new Error(`Use “remove ${name} from scene”.`);
    scene.members.splice(memberIndex, 1);
    scene.connections = scene.connections.filter(connection => connection.fromObjectId !== target.object.id && connection.toObjectId !== target.object.id);
    return `Removed ${name} and its scene links.`;
  }

  if (prefix === "move ") {
    const match = target.tail.match(/^(?:to\s+)?(left|right|up|down|front|forward|back|backward)(?:\s+by)?\s+(-?\d+(?:\.\d+)?)\s*(?:cm)?$/i);
    if (!match) throw new Error(`Use “move ${name} left by 5 cm” (directions: left, right, up, down, front, back).`);
    const amount = Number(match[2]);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) throw new Error("Move distances must be greater than 0 and no more than 1,000 cm.");
    const vector: Record<string, [number, number, number]> = {
      left: [-1, 0, 0], right: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
      front: [0, 0, -1], forward: [0, 0, -1], back: [0, 0, 1], backward: [0, 0, 1],
    };
    const direction = vector[match[1].toLocaleLowerCase()];
    const member = scene.members[memberIndex];
    const position: SceneMember["position"] = [
      member.position[0] + direction[0] * amount,
      member.position[1] + direction[1] * amount,
      member.position[2] + direction[2] * amount,
    ];
    if (!isSafePosition(position)) throw new Error("That move would place the object outside the supported scene range.");
    scene.members[memberIndex] = { ...member, position };
    return `Moved ${name} ${match[1]} by ${amount} cm.`;
  }

  if (prefix === "place ") {
    const match = target.tail.match(/^at\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:cm)?$/i);
    if (!match) throw new Error(`Use “place ${name} at 0, 0, 0 cm”.`);
    const position = match.slice(1).map(Number);
    if (!isSafePosition(position)) throw new Error("Scene positions must be between -10,000 and 10,000 cm.");
    scene.members[memberIndex] = { ...scene.members[memberIndex], position: position as SceneMember["position"] };
    return `Placed ${name} at ${position.map(value => `${value} cm`).join(", ")}.`;
  }

  const rotation = target.tail.match(/^(?:by\s+)?(-?\d+(?:\.\d+)?)\s*(?:deg|degrees?)?$/i);
  if (!rotation) throw new Error(`Use “rotate ${name} by 15 degrees”.`);
  const degrees = Number(rotation[1]);
  if (!Number.isFinite(degrees) || Math.abs(degrees) > 3600) throw new Error("Rotation must be between -3,600 and 3,600 degrees.");
  const member = scene.members[memberIndex];
  scene.members[memberIndex] = { ...member, rotation: ((member.rotation + degrees) % 360 + 360) % 360 };
  return `Rotated ${name} by ${degrees} degrees.`;
}

/** Parses a small, explicit command set into a reviewable local scene edit plan. */
export function planSceneEdits(commandText: string, scene: StudioScene, objects: StudioObject[]): SceneEditResult {
  const lines = commandText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: "Enter one or more scene instructions." };
  if (lines.length > MAX_COMMAND_LINES) return { ok: false, error: `Use no more than ${MAX_COMMAND_LINES} instructions at a time.` };
  if (!scene || !Array.isArray(scene.members) || !Array.isArray(scene.connections)) {
    return { ok: false, error: "The selected scene could not be read. Reopen it and try again." };
  }
  const nextScene = normalizeScene(scene);
  const changes: string[] = [];
  try {
    for (const line of lines) changes.push(applyLine(line, nextScene, objects));
    return { ok: true, plan: { scene: nextScene, changes } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The scene instruction could not be applied." };
  }
}
