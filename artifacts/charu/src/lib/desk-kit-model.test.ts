import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as THREE from "three";
import {
  DEFAULT_DESK_KIT_PARAMETERS,
  DEFAULT_PRINTER_BUILD_VOLUME,
  createDeskKitGroup,
  defaultDeskKitFitPassport,
  getDeskKitMetrics,
  type DeskKitFitPassport,
  type DeskKitParameters,
} from "./desk-kit-model";
import { getPrinterBuildPlan } from "./printer-compiler";
import { createStoredZip } from "./zip-stored";

const dimensions = (root: THREE.Group) => {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
};

test("the recommended default desk kit passes its declared fit checks", () => {
  const metrics = getDeskKitMetrics(DEFAULT_DESK_KIT_PARAMETERS);
  assert.equal(metrics.ready, true);
  assert.equal(metrics.checks.length, 7);
  assert.equal(metrics.channelPitchMm, 36);
  assert.equal(metrics.channelClearanceMm, 29);
  assert.equal(metrics.clampOpeningMm, 26.6);
  assert.deepEqual(metrics.clampOpeningsMm, [26.6, 26.6]);
  assert.deepEqual(metrics.measuredThicknessRangeMm, [24.8, 25.2]);
  assert.ok(metrics.checks.every(check => check.passed));
});

test("invalid desk dimensions, cable counts, and overcrowded channels block generation", () => {
  const invalidCases: DeskKitParameters[] = [
    {...DEFAULT_DESK_KIT_PARAMETERS, deskThicknessMm: 11.9},
    {...DEFAULT_DESK_KIT_PARAMETERS, railLengthMm: 601},
    {...DEFAULT_DESK_KIT_PARAMETERS, trayDepthMm: 79},
    {...DEFAULT_DESK_KIT_PARAMETERS, cableCount: 1.5},
    {...DEFAULT_DESK_KIT_PARAMETERS, cableDiameterMm: 13},
    {...DEFAULT_DESK_KIT_PARAMETERS, trayDepthMm: 80, cableCount: 8, cableDiameterMm: 12},
  ];
  for (const parameters of invalidCases) {
    assert.equal(getDeskKitMetrics(parameters).ready, false, JSON.stringify(parameters));
    assert.throws(() => createDeskKitGroup(parameters));
  }
});

test("the clamp opening follows desk thickness and the rail follows the selected length", () => {
  const thin = createDeskKitGroup({...DEFAULT_DESK_KIT_PARAMETERS, deskThicknessMm: 15, railLengthMm: 240}, {showDeskReference:false,showCablePreview:false});
  const thick = createDeskKitGroup({...DEFAULT_DESK_KIT_PARAMETERS, deskThicknessMm: 42, railLengthMm: 520}, {showDeskReference:false,showCablePreview:false});
  const thinSize = dimensions(thin), thickSize = dimensions(thick);
  const thinClampSize = new THREE.Box3().setFromObject(thin.getObjectByName("Desk clamp 1")!).getSize(new THREE.Vector3());
  const thickClampSize = new THREE.Box3().setFromObject(thick.getObjectByName("Desk clamp 1")!).getSize(new THREE.Vector3());
  assert.equal(thinSize.z, 240);
  assert.equal(thickSize.z, 520);
  assert.ok(Math.abs(thinClampSize.y - 33.8) < 1e-4);
  assert.ok(Math.abs(thickClampSize.y - 60.8) < 1e-4);
  assert.ok(Math.abs(thinSize.y - 50.3) < 1e-4);
  assert.ok(Math.abs(thickSize.y - 77.3) < 1e-4);
  assert.deepEqual(thick.userData.parameterValues, {...DEFAULT_DESK_KIT_PARAMETERS,deskThicknessMm:42,railLengthMm:520});
});

test("each additional cable creates another preview cable and a separator", () => {
  const three = createDeskKitGroup(DEFAULT_DESK_KIT_PARAMETERS);
  const five = createDeskKitGroup({...DEFAULT_DESK_KIT_PARAMETERS, cableCount:5});
  const count = (group: THREE.Group) => {
    let meshes = 0;
    let cables = 0;
    group.traverse(node => {
      if (node instanceof THREE.Mesh) {
        meshes++;
        if (node.userData.previewOnly) cables++;
      }
    });
    return {meshes,cables};
  };
  assert.equal(count(three).cables, 4); // desk reference plus three cable samples
  assert.equal(count(five).cables, 6);
  assert.equal(count(five).meshes - count(three).meshes, 4); // two cables and two dividers
});

test("the exported geometry excludes desk and cable reference meshes", () => {
  const group = createDeskKitGroup(DEFAULT_DESK_KIT_PARAMETERS, {showDeskReference:false,showCablePreview:false});
  const names: string[] = [];
  group.traverse(node => { if (node instanceof THREE.Mesh) names.push(node.name); });
  assert.ok(!names.some(name => name.startsWith("Cable clearance preview")));
  assert.ok(!names.some(name => name === "Desk reference only"));
  assert.ok(names.includes("Desk clamp 1"));
  assert.ok(names.includes("Desk clamp 2"));
});

test("Fit Passport checks each clamp point and blocks uncertainty wider than clearance", () => {
  const fit: DeskKitFitPassport = {
    ...defaultDeskKitFitPassport(DEFAULT_DESK_KIT_PARAMETERS),
    thicknessAtClampOneMm: 24,
    thicknessAtClampTwoMm: 30,
    measurementUncertaintyMm: 0.5,
  };
  const metrics = getDeskKitMetrics(DEFAULT_DESK_KIT_PARAMETERS, fit);
  assert.equal(metrics.ready, true);
  assert.deepEqual(metrics.clampOpeningsMm, [25.6, 31.6]);
  assert.deepEqual(metrics.measuredThicknessRangeMm, [23.5, 30.5]);
  assert.equal(getDeskKitMetrics(DEFAULT_DESK_KIT_PARAMETERS, { ...fit, measurementUncertaintyMm: 1 }).ready, false);
});

test("printer compiler splits the default rail into bed-sized prototype sections", () => {
  const fit = defaultDeskKitFitPassport(DEFAULT_DESK_KIT_PARAMETERS);
  const plan = getPrinterBuildPlan(DEFAULT_DESK_KIT_PARAMETERS, fit, DEFAULT_PRINTER_BUILD_VOLUME);
  assert.equal(plan.ready, true);
  assert.equal(plan.railAxis, "X");
  assert.equal(plan.segmentCount, 2);
  assert.equal(plan.segmentLengthMm, 180);
  assert.ok(plan.checks.every(check => check.passed));
  const group = createDeskKitGroup(DEFAULT_DESK_KIT_PARAMETERS, {
    showDeskReference: false,
    showCablePreview: false,
    fitPassport: fit,
    segmentCount: plan.segmentCount,
  });
  assert.ok(group.getObjectByName("Interlocking rail segment 1"));
  assert.ok(group.getObjectByName("Interlocking rail segment 2"));
});

test("printer compiler blocks a bed too narrow for the tray", () => {
  const fit = defaultDeskKitFitPassport(DEFAULT_DESK_KIT_PARAMETERS);
  const plan = getPrinterBuildPlan(DEFAULT_DESK_KIT_PARAMETERS, fit, { xMm: 100, yMm: 100, zMm: 250 });
  assert.equal(plan.ready, false);
  assert.equal(plan.checks.find(check => check.id === "printer-cross-span")?.passed, false);
});

test("store-only ZIP has local file, central directory, and end signatures", () => {
  const zip = createStoredZip([
    { name: "parts/part-1.stl", content: "solid sample\nendsolid sample\n" },
    { name: "fit-passport.json", content: "{}" },
  ]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const archiveText = new TextDecoder().decode(zip);
  assert.ok(archiveText.includes("parts/part-1.stl") && archiveText.includes("fit-passport.json"), "entry filenames are present");
  const endOffset = zip.length - 22;
  assert.equal(view.getUint32(endOffset, true), 0x06054b50);
});
