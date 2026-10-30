import { useMemo } from "react";
import type { AssemblyPart } from "@workspace/api-client-react";
import { StudioViewport } from "@/components/studio-viewport";
import {
  createDeskKitGroup,
  defaultDeskKitFitPassport,
  type DeskKitFitPassport,
  type DeskKitParameters,
} from "@/lib/desk-kit-model";

const NO_PARTS: AssemblyPart[] = [];

function DeskKitSvgFallback({
  parameters,
  fitPassport,
  segmentCount,
}: {
  parameters: DeskKitParameters;
  fitPassport: DeskKitFitPassport;
  segmentCount: number;
}) {
  const { railLengthMm, trayDepthMm, cableCount, cableDiameterMm } = parameters;
  const averageThickness = (fitPassport.thicknessAtClampOneMm + fitPassport.thicknessAtClampTwoMm) / 2;
  const railScale = Math.min(420 / railLengthMm, 1.12);
  const railWidth = railLengthMm * railScale;
  const left = (480 - railWidth) / 2;
  const tableHeight = Math.max(15, averageThickness * .72);
  const tableY = 87;
  const trayY = tableY + tableHeight + 27;
  const trayDepth = Math.min(114, Math.max(68, trayDepthMm * .72));
  const cablePitch = trayDepth / Math.max(cableCount, 1);
  const cableRadius = Math.min(6, cableDiameterMm * .35);
  const clampTop = tableY - 8;
  const clampBottom = tableY + tableHeight + 9;
  return <div className="relative min-h-[290px] overflow-hidden bg-[#101c20]" data-testid="viewport-desk-kit-fallback">
    <svg viewBox="0 0 480 300" role="img" aria-label={`Desk-edge cable organizer concept, ${averageThickness.toFixed(1)} millimeter average desk thickness, ${railLengthMm} millimeter rail, ${cableCount} cable channels`} className="absolute inset-0 h-full w-full">
      <defs>
        <pattern id="desk-kit-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#55716e" strokeOpacity=".24" strokeWidth=".7" /></pattern>
        <linearGradient id="desk-kit-metal" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#8ba699" /><stop offset="1" stopColor="#36574c" /></linearGradient>
      </defs>
      <rect width="480" height="300" fill="url(#desk-kit-grid)" />
      <text x="28" y="30" fill="#9db5aa" fontFamily="DM Mono, monospace" fontSize="9" letterSpacing="1.2">SIDE ELEVATION · DIMENSIONED PREVIEW</text>
      <rect x="60" y={tableY} width="300" height={tableHeight} rx="2" fill="#b1b8a7" fillOpacity=".2" stroke="#b1b8a7" strokeOpacity=".65" />
      <text x="65" y={tableY - 8} fill="#aebdb1" fontFamily="DM Mono, monospace" fontSize="8">DESK EDGE · {averageThickness.toFixed(1)} MM AVERAGE</text>
      {[left + 48, left + railWidth - 48].map((x, index) => <g key={index} stroke="#93aa9e" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d={`M${x} ${clampTop} v${tableY - clampTop - 2} h-22 v${tableHeight + 11} h22 v${trayY - (clampBottom + 3)}`} />
        <circle cx={x} cy={clampBottom + 5} r="3" fill="#e8875a" stroke="none" />
      </g>)}
      <path d={`M${left} ${trayY} H${left + railWidth} V${trayY + 19} H${left} Z`} fill="url(#desk-kit-metal)" stroke="#a8b9ad" strokeOpacity=".62" />
      <path d={`M${left + 5} ${trayY + 19} V${trayY + 27} M${left + railWidth - 5} ${trayY + 19} V${trayY + 27}`} stroke="#718b7f" strokeWidth="5" />
      {Array.from({ length: cableCount }, (_, index) => {
        const cy = trayY + 10 + (index - (cableCount - 1) / 2) * Math.min(3, cablePitch * .06);
        return <g key={index}><path d={`M${left + 10} ${cy} H${left + railWidth - 10}`} stroke="#e4b16a" strokeWidth={cableRadius} strokeLinecap="round" /><text x={left + 17} y={cy - 6} fill="#fff0d0" fontFamily="DM Mono, monospace" fontSize="7">{index + 1}</text></g>;
      })}
      <path d={`M${left} ${trayY + 43} v6 M${left + railWidth} ${trayY + 43} v6 M${left} ${trayY + 47} H${left + railWidth}`} stroke="#91aba0" strokeWidth=".8" />
      <text x="240" y={trayY + 61} textAnchor="middle" fill="#d4dfd4" fontFamily="DM Mono, monospace" fontSize="9">RAIL {railLengthMm} MM · {cableCount} CHANNELS · Ø {cableDiameterMm} MM</text>
      <text x="28" y="280" fill="#9aada3" fontFamily="DM Mono, monospace" fontSize="8">FIT ENVELOPE ONLY · {segmentCount} RAIL SECTION{segmentCount === 1 ? "" : "S"} · NOT A RETENTION TEST</text>
    </svg>
    <div className="pointer-events-none absolute left-3 top-3 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[8px] uppercase tracking-[.14em] text-white/70">Charu · 2D fit preview</div>
  </div>;
}

export function DeskKitPreview({
  parameters,
  fitPassport = defaultDeskKitFitPassport(parameters),
  segmentCount = 1,
  className = "",
}: {
  parameters: DeskKitParameters;
  fitPassport?: DeskKitFitPassport;
  segmentCount?: number;
  className?: string;
}) {
  const modelRevision = `${parameters.deskThicknessMm}:${parameters.railLengthMm}:${parameters.trayDepthMm}:${parameters.cableCount}:${parameters.cableDiameterMm}:${fitPassport.thicknessAtClampOneMm}:${fitPassport.thicknessAtClampTwoMm}:${fitPassport.measurementUncertaintyMm}:${fitPassport.clearancePerSideMm}:${segmentCount}`;
  const customModel = useMemo(() => ({
    revision: `desk-kit-${modelRevision}`,
    build: () => createDeskKitGroup(parameters, { fitPassport, segmentCount }),
    fallback: <DeskKitSvgFallback parameters={parameters} fitPassport={fitPassport} segmentCount={segmentCount} />,
    statusLabel: `Desk kit · ${fitPassport.thicknessAtClampOneMm}/${fitPassport.thicknessAtClampTwoMm} mm clamp measurements · ${parameters.railLengthMm} mm rail · ${parameters.cableCount} cable channels`,
  }), [modelRevision, parameters, fitPassport, segmentCount]);
  return <StudioViewport parts={NO_PARTS} customModel={customModel} className={className} />;
}
