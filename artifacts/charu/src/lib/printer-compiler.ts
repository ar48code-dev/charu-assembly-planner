import type {
  DeskKitFitPassport,
  DeskKitParameters,
  PrinterBuildCheck,
  PrinterBuildPlan,
  PrinterBuildVolume,
} from "./desk-kit-model";

const RAIL_JOINT_DEPTH_MM = 6;
const BED_EDGE_MARGIN_MM = 8;

export function getPrinterBuildPlan(
  parameters: DeskKitParameters,
  fitPassport: DeskKitFitPassport,
  volume: PrinterBuildVolume,
): PrinterBuildPlan {
  const bedValuesValid = [volume.xMm, volume.yMm, volume.zMm]
    .every(value => Number.isFinite(value) && value >= 80 && value <= 500);
  const railAxis = volume.xMm >= volume.yMm ? "X" : "Y";
  const longBedSpan = Math.max(volume.xMm, volume.yMm);
  const shortBedSpan = Math.min(volume.xMm, volume.yMm);
  const usableRailSpanMm = Math.max(0, longBedSpan - BED_EDGE_MARGIN_MM * 2);
  const usableWidthMm = Math.max(0, shortBedSpan - BED_EDGE_MARGIN_MM * 2);
  const availableSegmentSpan = usableRailSpanMm - RAIL_JOINT_DEPTH_MM;
  const segmentCount = parameters.railLengthMm <= usableRailSpanMm || availableSegmentSpan <= 0
    ? 1
    : Math.max(1, Math.ceil(parameters.railLengthMm / availableSegmentSpan));
  const segmentLengthMm = parameters.railLengthMm / segmentCount;
  const maxThickness = Math.max(fitPassport.thicknessAtClampOneMm, fitPassport.thicknessAtClampTwoMm);
  const clampPrintHeightMm = Math.max(32, maxThickness + fitPassport.clearancePerSideMm + 18);
  const checks: PrinterBuildCheck[] = [
    {
      id: "printer-bed-size",
      label: "Printer bed dimensions",
      passed: bedValuesValid,
      detail: bedValuesValid
        ? `${volume.xMm} × ${volume.yMm} × ${volume.zMm} mm entered`
        : "Enter X, Y, and Z dimensions between 80 and 500 mm.",
    },
    {
      id: "printer-cross-span",
      label: "Tray width on the bed",
      passed: bedValuesValid && usableWidthMm >= parameters.trayDepthMm,
      detail: `${usableWidthMm.toFixed(0)} mm usable cross-span · ${parameters.trayDepthMm} mm required`,
    },
    {
      id: "printer-rail-segments",
      label: "Rail segment length",
      passed: bedValuesValid && segmentCount <= 24 && segmentLengthMm + (segmentCount > 1 ? RAIL_JOINT_DEPTH_MM : 0) <= usableRailSpanMm,
      detail: segmentCount === 1
        ? `One ${parameters.railLengthMm} mm rail fits the ${railAxis}-axis layout.`
        : `${segmentCount} interlocking sections · about ${segmentLengthMm.toFixed(1)} mm each plus joint tabs`,
    },
    {
      id: "printer-part-height",
      label: "Clamp and end-wall height",
      passed: bedValuesValid && volume.zMm >= clampPrintHeightMm,
      detail: `${clampPrintHeightMm.toFixed(1)} mm required · ${volume.zMm} mm available on Z`,
    },
  ];
  return {
    ready: checks.every(check => check.passed),
    railAxis,
    segmentCount,
    segmentLengthMm,
    usableRailSpanMm,
    checks,
  };
}
