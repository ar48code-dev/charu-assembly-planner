import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { AssemblyPart } from "@workspace/api-client-react";
import { cylinderAxis, resolvePartLayout, type ViewportPart } from "./geometry-layout";
export type { ViewportPart } from "./geometry-layout";

export function createPartGeometry(part: AssemblyPart) {
  const { x, y, z } = part.dimensions;
  if (part.shape === "box") return new THREE.BoxGeometry(x, y, z);
  const geometry = new THREE.CylinderGeometry(.5, .5, 1, 32);
  const axis = cylinderAxis(part.dimensions);
  if (axis === "x") geometry.rotateZ(-Math.PI / 2);
  if (axis === "z") geometry.rotateX(Math.PI / 2);
  geometry.scale(x, y, z);
  geometry.computeBoundingBox();
  return geometry;
}

export function createPartGroup(parts: ViewportPart[]) {
  const group = new THREE.Group();
  const assemblies = new Map<string, THREE.Group>();
  group.userData.layout = "Dimension-aware exploded inspection; not a mechanical fit";
  group.userData.units = "centimeters";

  resolvePartLayout(parts).forEach((part) => {
    const geometry = createPartGeometry(part);
    const color = /^#[0-9a-f]{3,8}$/i.test(part.color) ? part.color : "#e89561";
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.08 }),
    );
    mesh.position.set(...part.position!);
    mesh.rotation.y = part.groupId ? 0 : part.rotation ?? 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.partId = part.id;
    mesh.userData.partName = part.name;
    mesh.name = part.name;
    if (part.shape === "cylinder") mesh.userData.inferredCylinderAxis = cylinderAxis(part.dimensions);
    if (part.groupId) {
      let assembly = assemblies.get(part.groupId);
      if (!assembly) {
        assembly = new THREE.Group();
        assembly.position.set(...(part.groupPosition ?? [0, 0, 0]));
        assembly.rotation.y = part.rotation ?? 0;
        assemblies.set(part.groupId, assembly);
        group.add(assembly);
      }
      assembly.add(mesh);
    } else {
      group.add(mesh);
    }
  });

  return group;
}

export async function exportPartsGlb(parts: ViewportPart[]) {
  if (!parts.length) throw new Error("There are no parts to export.");
  const group = createPartGroup(parts);
  // glTF's standard distance unit is meters; the planner's inputs are cm.
  group.scale.setScalar(.01);
  group.name = "Charu exploded inspection";
  group.userData.units = "meters";
  group.userData.sourceUnits = "centimeters";
  try {
    const exported = await new GLTFExporter().parseAsync(group, { binary: true });
    if (!(exported instanceof ArrayBuffer)) throw new Error("The GLB exporter did not return a binary model.");
    return exported;
  } finally {
    group.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
}

export async function downloadPartsGlb(parts: ViewportPart[], fileName: string) {
  const exported = await exportPartsGlb(parts);
  const url = URL.createObjectURL(new Blob([exported], { type: "model/gltf-binary" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "charu-object"}.glb`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
