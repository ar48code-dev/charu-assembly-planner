import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { getPrinterBuildPlan } from "./printer-compiler";
import { createStoredZip } from "./zip-stored";

export interface DeskKitParameters {
  deskThicknessMm: number;
  railLengthMm: number;
  trayDepthMm: number;
  cableCount: number;
  cableDiameterMm: number;
}

export interface DeskKitFitPassport {
  thicknessAtClampOneMm: number;
  thicknessAtClampTwoMm: number;
  measurementUncertaintyMm: number;
  clearancePerSideMm: number;
}

export interface PrinterBuildVolume {
  xMm: number;
  yMm: number;
  zMm: number;
}

export interface PrinterBuildCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface PrinterBuildPlan {
  ready: boolean;
  railAxis: "X" | "Y";
  segmentCount: number;
  segmentLengthMm: number;
  usableRailSpanMm: number;
  checks: PrinterBuildCheck[];
}

export interface DeskKitCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface DeskKitMetrics {
  channelPitchMm: number;
  channelClearanceMm: number;
  clampOpeningMm: number;
  clampOpeningsMm: [number, number];
  measuredThicknessRangeMm: [number, number];
  overallWidthMm: number;
  checks: DeskKitCheck[];
  ready: boolean;
}

export const DEFAULT_DESK_KIT_PARAMETERS: DeskKitParameters = {
  deskThicknessMm: 25,
  railLengthMm: 360,
  trayDepthMm: 120,
  cableCount: 3,
  cableDiameterMm: 7,
};

export const DEFAULT_PRINTER_BUILD_VOLUME: PrinterBuildVolume = {
  xMm: 220,
  yMm: 220,
  zMm: 250,
};

export function defaultDeskKitFitPassport(parameters: DeskKitParameters): DeskKitFitPassport {
  return {
    thicknessAtClampOneMm: parameters.deskThicknessMm,
    thicknessAtClampTwoMm: parameters.deskThicknessMm,
    measurementUncertaintyMm: 0.2,
    clearancePerSideMm: 0.8,
  };
}

const METAL = "#718b7f";
const METAL_DARK = "#34554b";
const ACCENT = "#e8875a";
const TABLE = "#b1b8a7";
const CABLE = "#e4b16a";

const isFiniteIn = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;

export function getDeskKitMetrics(
  parameters: DeskKitParameters,
  fitPassport: DeskKitFitPassport = defaultDeskKitFitPassport(parameters),
): DeskKitMetrics {
  const { deskThicknessMm, railLengthMm, trayDepthMm, cableCount, cableDiameterMm } = parameters;
  const channelPitchMm = cableCount > 0 ? (trayDepthMm - 12) / cableCount : 0;
  const channelClearanceMm = channelPitchMm - cableDiameterMm;
  const measuredThicknessRangeMm: [number, number] = [
    Math.min(fitPassport.thicknessAtClampOneMm, fitPassport.thicknessAtClampTwoMm) - fitPassport.measurementUncertaintyMm,
    Math.max(fitPassport.thicknessAtClampOneMm, fitPassport.thicknessAtClampTwoMm) + fitPassport.measurementUncertaintyMm,
  ];
  const clampOpeningsMm: [number, number] = [
    fitPassport.thicknessAtClampOneMm + 2 * fitPassport.clearancePerSideMm,
    fitPassport.thicknessAtClampTwoMm + 2 * fitPassport.clearancePerSideMm,
  ];
  const checks: DeskKitCheck[] = [
    {
      id: "desk-thickness-clamp-one",
      label: "Desk thickness · clamp one",
      passed: isFiniteIn(fitPassport.thicknessAtClampOneMm, 12, 45),
      detail: `${Number.isFinite(fitPassport.thicknessAtClampOneMm) ? fitPassport.thicknessAtClampOneMm : "—"} mm measured · supported 12–45 mm`,
    },
    {
      id: "desk-thickness-clamp-two",
      label: "Desk thickness · clamp two",
      passed: isFiniteIn(fitPassport.thicknessAtClampTwoMm, 12, 45),
      detail: `${Number.isFinite(fitPassport.thicknessAtClampTwoMm) ? fitPassport.thicknessAtClampTwoMm : "—"} mm measured · supported 12–45 mm`,
    },
    {
      id: "fit-passport-tolerance",
      label: "Measurement tolerance",
      passed: isFiniteIn(fitPassport.measurementUncertaintyMm, 0, 3)
        && isFiniteIn(fitPassport.clearancePerSideMm, .2, 3)
        && fitPassport.measurementUncertaintyMm <= fitPassport.clearancePerSideMm,
      detail: `${Number.isFinite(fitPassport.measurementUncertaintyMm) ? fitPassport.measurementUncertaintyMm : "—"} mm uncertainty · ${Number.isFinite(fitPassport.clearancePerSideMm) ? fitPassport.clearancePerSideMm : "—"} mm clearance per side`,
    },
    {
      id: "rail-length",
      label: "Cable rail length",
      passed: isFiniteIn(railLengthMm, 200, 600),
      detail: `${Number.isFinite(railLengthMm) ? railLengthMm : "—"} mm · supported 200–600 mm`,
    },
    {
      id: "tray-depth",
      label: "Tray depth",
      passed: isFiniteIn(trayDepthMm, 80, 180),
      detail: `${Number.isFinite(trayDepthMm) ? trayDepthMm : "—"} mm · supported 80–180 mm`,
    },
    {
      id: "cable-spec",
      label: "Cable count and diameter",
      passed: Number.isInteger(cableCount) && cableCount >= 1 && cableCount <= 8 && isFiniteIn(cableDiameterMm, 3, 12),
      detail: `${Number.isInteger(cableCount) ? cableCount : "—"} cables · ${Number.isFinite(cableDiameterMm) ? cableDiameterMm : "—"} mm diameter`,
    },
    {
      id: "channel-clearance",
      label: "Channel clearance",
      passed: Number.isFinite(channelClearanceMm) && channelClearanceMm >= 3,
      detail: `${Number.isFinite(channelClearanceMm) ? channelClearanceMm.toFixed(1) : "—"} mm remaining · at least 3 mm required`,
    },
  ];
  return {
    channelPitchMm,
    channelClearanceMm,
    clampOpeningMm: deskThicknessMm + 2 * fitPassport.clearancePerSideMm,
    clampOpeningsMm,
    measuredThicknessRangeMm,
    overallWidthMm: trayDepthMm,
    checks,
    ready: checks.every(check => check.passed),
  };
}

function mesh(geometry: THREE.BufferGeometry, color: string, materialOptions: THREE.MeshStandardMaterialParameters = {}) {
  const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .12, ...materialOptions }));
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function makeBox(width: number, height: number, length: number, color: string, position: [number, number, number]) {
  const item = mesh(new THREE.BoxGeometry(width, height, length), color);
  item.position.set(...position);
  return item;
}

function createClampProfile(deskThicknessMm: number, clearancePerSideMm: number, depthMm = 30) {
  const shape = new THREE.Shape();
  shape.moveTo(-32, deskThicknessMm + clearancePerSideMm + 6);
  shape.lineTo(12, deskThicknessMm + clearancePerSideMm + 6);
  shape.lineTo(12, -12);
  shape.lineTo(-32, -12);
  shape.lineTo(-32, -clearancePerSideMm);
  shape.lineTo(4, -clearancePerSideMm);
  shape.lineTo(4, deskThicknessMm + clearancePerSideMm);
  shape.lineTo(-32, deskThicknessMm + clearancePerSideMm);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: depthMm, bevelEnabled: false, curveSegments: 2, steps: 1 });
  geometry.translate(0, 0, -depthMm / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createSegmentFloor(
  widthMm: number,
  thicknessMm: number,
  lengthMm: number,
  segmentIndex: number,
  segmentCount: number,
  jointDepthMm = 6,
) {
  const bands = Math.max(4, Math.floor(widthMm / 20));
  const points: [number, number][] = [];
  for (let band = 0; band <= bands; band++) {
    const x = (widthMm * band) / bands;
    const tab = band < bands && band % 2 === 0;
    const inset = segmentIndex > 0 && tab ? jointDepthMm : 0;
    points.push([x, -lengthMm / 2 + inset]);
  }
  for (let band = bands; band >= 0; band--) {
    const x = (widthMm * band) / bands;
    const tab = band < bands && band % 2 === 0;
    const extension = segmentIndex < segmentCount - 1 && tab ? jointDepthMm : 0;
    points.push([x, lengthMm / 2 + extension]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) shape.lineTo(point[0], point[1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thicknessMm, bevelEnabled: false, curveSegments: 1, steps: 1 });
  geometry.translate(0, 0, -thicknessMm / 2);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, 0);
  return geometry;
}

function disposeGroup(root: THREE.Object3D) {
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => material.dispose());
  });
}

export function createDeskKitGroup(
  parameters: DeskKitParameters,
  options: {
    showDeskReference?: boolean;
    showCablePreview?: boolean;
    fitPassport?: DeskKitFitPassport;
    segmentCount?: number;
  } = {},
): THREE.Group {
  const fitPassport = options.fitPassport ?? defaultDeskKitFitPassport(parameters);
  const metrics = getDeskKitMetrics(parameters, fitPassport);
  if (!metrics.ready) throw new Error("Adjust the desk kit values until every fit check passes.");
  const { deskThicknessMm, railLengthMm, trayDepthMm, cableCount, cableDiameterMm } = parameters;
  const { showDeskReference = true, showCablePreview = true } = options;
  const segmentCount = options.segmentCount ?? 1;
  if (!Number.isInteger(segmentCount) || segmentCount < 1 || segmentCount > 24) {
    throw new Error("The print plan must contain 1–24 rail segments.");
  }
  const segmentLength = railLengthMm / segmentCount;
  if (segmentLength < 30) throw new Error("Printer sections must be at least 30 mm long.");
  const group = new THREE.Group();
  group.name = "Charu custom-fit desk cable kit";
  group.userData.layout = "Parametric desk-edge cable organizer kit";
  group.userData.sourceUnits = "millimeters";
  group.userData.parameterValues = { ...parameters };
  group.userData.fitPassport = { ...fitPassport };
  group.userData.checks = metrics.checks;
  group.userData.includesDeskReference = showDeskReference;
  group.userData.railSegmentCount = segmentCount;

  if (showDeskReference) {
    const desk = mesh(new THREE.BoxGeometry(150, deskThicknessMm, railLengthMm + 100), TABLE, {
      transparent: true, opacity: .18, depthWrite: false, roughness: .9, metalness: 0,
    });
    desk.position.set(-75, deskThicknessMm / 2, 0);
    desk.name = "Desk reference only";
    desk.userData.previewOnly = true;
    group.add(desk);
  }

  const clampPositions = [-railLengthMm / 2 + 35, railLengthMm / 2 - 35];
  for (let i = 0; i < clampPositions.length; i++) {
    const localThickness = i === 0 ? fitPassport.thicknessAtClampOneMm : fitPassport.thicknessAtClampTwoMm;
    const clamp = mesh(createClampProfile(localThickness, fitPassport.clearancePerSideMm), METAL_DARK);
    clamp.position.z = clampPositions[i];
    clamp.name = `Desk clamp ${i + 1}`;
    clamp.userData.partType = "adjustable-desk-clamp";
    group.add(clamp);
    // Two connector blocks bridge the clamp body to the tray floor.
    const connectorA = makeBox(8, 16, 10, METAL_DARK, [8, -19.5, clampPositions[i] - 8]);
    connectorA.name = `Clamp ${i + 1} connector A`;
    const connectorB = makeBox(8, 16, 10, METAL_DARK, [8, -19.5, clampPositions[i] + 8]);
    connectorB.name = `Clamp ${i + 1} connector B`;
    group.add(connectorA, connectorB);
  }

  const floorThickness = 3;
  const floorY = -27;
  for (let index = 0; index < segmentCount; index++) {
    const centerZ = -railLengthMm / 2 + segmentLength * (index + .5);
    const floor = mesh(
      createSegmentFloor(trayDepthMm, floorThickness, segmentLength, index, segmentCount),
      METAL,
    );
    floor.position.set(0, floorY, centerZ);
    floor.name = `Interlocking rail segment ${index + 1}`;
    floor.userData.partType = "interlocking-rail-segment";
    group.add(floor);
  }
  const wallHeight = 32;
  const wallY = floorY + floorThickness / 2 + wallHeight / 2;
  const startWall = makeBox(trayDepthMm, wallHeight, 3, METAL_DARK, [trayDepthMm / 2, wallY, -railLengthMm / 2 + 1.5]);
  startWall.name = "Rail end wall 1";
  const endWall = makeBox(trayDepthMm, wallHeight, 3, METAL_DARK, [trayDepthMm / 2, wallY, railLengthMm / 2 - 1.5]);
  endWall.name = "Rail end wall 2";
  group.add(startWall, endWall);

  const margin = 6;
  const usableDepth = trayDepthMm - margin * 2;
  const pitch = usableDepth / cableCount;
  for (let index = 1; index < cableCount; index++) {
    const x = margin + pitch * index;
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
      const centerZ = -railLengthMm / 2 + segmentLength * (segmentIndex + .5);
      const dividerLength = Math.max(8, segmentLength - (segmentCount > 1 ? 2 : 10));
      const divider = makeBox(2, 18, dividerLength, METAL_DARK, [x, floorY + floorThickness / 2 + 9, centerZ]);
      divider.name = `Cable channel divider ${index} · segment ${segmentIndex + 1}`;
      divider.userData.partType = "channel-divider";
      group.add(divider);
    }
  }

  if (showCablePreview) {
    for (let index = 0; index < cableCount; index++) {
      const x = margin + pitch * (index + .5);
      const cable = mesh(
        new THREE.CylinderGeometry(cableDiameterMm / 2, cableDiameterMm / 2, railLengthMm - 20, 12),
        CABLE,
        { roughness: .4, metalness: .05 },
      );
      cable.rotation.x = Math.PI / 2;
      cable.position.set(x, floorY + floorThickness / 2 + cableDiameterMm / 2 + .7, 0);
      cable.name = `Cable clearance preview ${index + 1}`;
      cable.userData.previewOnly = true;
      group.add(cable);
    }
  }

  group.userData.exportNotes = "Export excludes the translucent desk reference and optional cable previews. Segmented rails use an untested prototype joint.";
  return group;
}

export function exportDeskKitJson(
  parameters: DeskKitParameters,
  fitPassport = defaultDeskKitFitPassport(parameters),
  printerPlan?: PrinterBuildPlan,
  name = "Charu desk cable kit",
) {
  const metrics = getDeskKitMetrics(parameters, fitPassport);
  if (!metrics.ready) throw new Error("Resolve the failed fit checks before exporting this kit.");
  return {
    name,
    format: "charu-parametric-kit",
    formatVersion: 1,
    sourceUnits: "millimeters",
    exportUnits: "meters",
    params: { ...parameters },
    fitPassport: { ...fitPassport },
    derived: {
      clampOpeningMm: metrics.clampOpeningMm,
      clampOpeningsMm: metrics.clampOpeningsMm,
      measuredThicknessRangeMm: metrics.measuredThicknessRangeMm,
      cableChannelPitchMm: Number(metrics.channelPitchMm.toFixed(2)),
      minimumCableClearanceMm: Number(metrics.channelClearanceMm.toFixed(2)),
      overallDepthMm: metrics.overallWidthMm,
    },
    checks: metrics.checks,
    printerBuildPlan: printerPlan ?? null,
    limitations: [
      "Fit Passport checks account for the entered thickness and uncertainty only; they do not confirm secure retention or physical compatibility.",
      "Dimensional fit checks are not strength, material, safety, or manufacturing certification.",
      "Printer-bed fit and segmented joints are geometrical estimates; printer calibration, material shrinkage, joint strength, and printability are not certified.",
      "Cable samples and the translucent desk are visual references and are excluded from the GLB export.",
    ],
  };
}

export async function exportDeskKitGlb(
  parameters: DeskKitParameters,
  fitPassport = defaultDeskKitFitPassport(parameters),
  segmentCount = 1,
) {
  const group = createDeskKitGroup(parameters, { showDeskReference: false, showCablePreview: false, fitPassport, segmentCount });
  group.scale.setScalar(.001);
  group.userData.units = "meters";
  try {
    const exported = await new GLTFExporter().parseAsync(group, { binary: true });
    if (!(exported instanceof ArrayBuffer)) throw new Error("The GLB exporter did not return a binary model.");
    return exported;
  } finally {
    disposeGroup(group);
  }
}

export async function downloadDeskKitGlb(parameters: DeskKitParameters, fitPassport = defaultDeskKitFitPassport(parameters), segmentCount = 1) {
  const exported = await exportDeskKitGlb(parameters, fitPassport, segmentCount);
  const url = URL.createObjectURL(new Blob([exported], { type: "model/gltf-binary" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "charu-custom-fit-desk-cable-kit.glb";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDeskKitJson(
  parameters: DeskKitParameters,
  fitPassport = defaultDeskKitFitPassport(parameters),
  printerPlan?: PrinterBuildPlan,
) {
  const contents = JSON.stringify(exportDeskKitJson(parameters, fitPassport, printerPlan), null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "charu-custom-fit-desk-cable-kit.json";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDeskKitStlFiles(parameters: DeskKitParameters, fitPassport: DeskKitFitPassport, segmentCount: number) {
  const group = createDeskKitGroup(parameters, { showDeskReference: false, showCablePreview: false, fitPassport, segmentCount });
  const files: { name: string; content: string }[] = [];
  try {
    let index = 1;
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.updateWorldMatrix(true, false);
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds || bounds.isEmpty()) throw new Error(`Could not calculate bounds for ${child.name || `part ${index}`}.`);
      const center = bounds.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -center.z);
      const printable = new THREE.Group();
      printable.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: METAL })));
      const stl = new STLExporter().parse(printable, { binary: false });
      if (typeof stl !== "string" || !stl.startsWith("solid ")) throw new Error(`Could not create a printable STL for ${child.name || `part ${index}`}.`);
      const safeName = (child.name || `part-${index}`).toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      files.push({ name: `parts/${String(index).padStart(2, "0")}-${safeName}.stl`, content: stl });
      geometry.dispose();
      printable.traverse(node => {
        if (node instanceof THREE.Mesh) {
          const material = Array.isArray(node.material) ? node.material : [node.material];
          material.forEach(item => item.dispose());
        }
      });
      index++;
    }
    if (!files.length) throw new Error("The print compiler generated no STL parts.");
    return files;
  } finally {
    disposeGroup(group);
  }
}

export async function downloadDeskKitPrintPack(
  parameters: DeskKitParameters,
  fitPassport: DeskKitFitPassport,
  volume: PrinterBuildVolume,
) {
  const plan = getPrinterBuildPlan(parameters, fitPassport, volume);
  if (!plan.ready) {
    const failed = plan.checks.filter(check => !check.passed).map(check => check.label).join(", ");
    throw new Error(`Printer plan is blocked: ${failed}.`);
  }
  const parts = await exportDeskKitStlFiles(parameters, fitPassport, plan.segmentCount);
  const manifest = exportDeskKitJson(parameters, fitPassport, plan);
  const assemblyGuide = [
    "CHARU PRINTER-AWARE KIT PACK",
    "",
    `Build volume entered: ${volume.xMm} × ${volume.yMm} × ${volume.zMm} mm.`,
    `Rail layout: ${plan.railAxis}-axis; ${plan.segmentCount} floor section(s) at about ${plan.segmentLengthMm.toFixed(1)} mm each.`,
    `Parts included: ${parts.length} individual STL files in /parts.`,
    "",
    "PRINT AND ASSEMBLY NOTES",
    "1. Import each STL in your slicer. Units are millimeters; each part is centered at the origin.",
    "2. Orient broad flat faces toward the build plate and confirm every part fits the actual machine volume.",
    "3. The segmented rail uses a prototype finger-joint profile. Print a small test section and check fit before making the full kit.",
    "4. Joinery strength, print settings, material behavior, clamp retention, and load capacity are not verified.",
    "5. Check the included fit-passport.json before assembly. It records measurements and tolerances supplied by the user.",
    "",
    "This pack is a geometric prototype, not a certified or safety-tested product.",
  ].join("\n");
  const archive = createStoredZip([
    ...parts,
    { name: "fit-passport.json", content: JSON.stringify(manifest, null, 2) },
    { name: "ASSEMBLY.txt", content: assemblyGuide },
  ]);
  const archiveBuffer = new ArrayBuffer(archive.byteLength);
  new Uint8Array(archiveBuffer).set(archive);
  const url = URL.createObjectURL(new Blob([archiveBuffer], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "charu-printer-aware-kit.zip";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { plan, partCount: parts.length };
}
