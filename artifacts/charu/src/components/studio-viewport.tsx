import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AssemblyConnection, AssemblyPart } from "@workspace/api-client-react";
import { createPartGroup, type ViewportPart } from "@/lib/three-model";
import { primitiveFaces, resolvePartLayout, worldPoint } from "@/lib/geometry-layout";

interface ViewportConnection {
  from: [number, number, number];
  to: [number, number, number];
  kind: string;
}
export interface CustomViewportModel {
  revision: string;
  build: () => THREE.Group;
  fallback: ReactNode;
  statusLabel?: string;
}

interface StudioViewportProps {
  parts: AssemblyPart[];
  connections?: ViewportConnection[];
  partConnections?: AssemblyConnection[];
  importedFile?: File | null;
  customModel?: CustomViewportModel;
  className?: string;
}
interface Point3 { x: number; y: number; z: number }
interface DrawingPart {
  part: ViewportPart;
  center: Point3;
  points: Point3[];
  faces: Point3[][];
}
const EMPTY_PART_CONNECTIONS: AssemblyConnection[] = [];
const EMPTY_CONNECTIONS: ViewportConnection[] = [];

function projectPoint(p: Point3): [number, number] {
  return [(p.x - p.z) * 0.72, -(p.x + p.z) * 0.36 - p.y];
}
function colorIsHex(color: string) { return /^#[0-9a-f]{3,8}$/i.test(color); }
function shade(hex: string, amount: number) {
  const normalized = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const n = Number.parseInt(normalized.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => Math.max(0, Math.min(255, Math.round(c * amount))));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}
function SvgGeometryFallback({ parts, connections = [], importedFile, glbWasNotParsed, manual2d }: { parts: AssemblyPart[]; connections: ViewportConnection[]; importedFile: File | null; glbWasNotParsed: boolean; manual2d: boolean }) {
  const drawing = (parts as ViewportPart[]).map((part): DrawingPart => {
    const faces = primitiveFaces(part).map(face => face.map(point => worldPoint(part, point)));
    return { part, center: worldPoint(part, {x: 0, y: 0, z: 0}), faces, points: faces.flat() };
  });
  const worldPoints = [...drawing.flatMap(item => item.points), ...connections.flatMap(link => [
    { x: link.from[0], y: link.from[1], z: link.from[2] },
    { x: link.to[0], y: link.to[1], z: link.to[2] },
  ])];
  const raw = worldPoints.map(projectPoint);
  const minX = raw.length ? Math.min(...raw.map(p => p[0])) : -4;
  const maxX = raw.length ? Math.max(...raw.map(p => p[0])) : 4;
  const minY = raw.length ? Math.min(...raw.map(p => p[1])) : -3;
  const maxY = raw.length ? Math.max(...raw.map(p => p[1])) : 3;
  const scale = Math.min(46, 430 / Math.max(maxX - minX, 2), 245 / Math.max(maxY - minY, 2));
  const project = (p: Point3): [number, number] => {
    const [x, y] = projectPoint(p);
    return [240 + (x - (minX + maxX) / 2) * scale, 151 + (y - (minY + maxY) / 2) * scale];
  };
  const connectionPoint = (p: [number, number, number]) => project({ x: p[0], y: p[1], z: p[2] });
  const depth = (face: Point3[]) => face.reduce((sum, p) => sum + p.x + p.z + p.y * .72, 0) / face.length;
  const surfaces = drawing.flatMap(item => item.faces.map((face, index) => ({item, face, index}))).sort((a,b) => depth(a.face) - depth(b.face));

  return <div className="relative min-h-[290px] overflow-hidden bg-[#101c20]" data-testid="viewport-svg-fallback">
    <svg viewBox="0 0 480 300" role="img" aria-label={importedFile ? "Generated geometry fallback. The selected local GLB cannot be previewed without WebGL." : "Generated assembly geometry preview"} className="absolute inset-0 h-full w-full">
      <defs><pattern id="charu-fallback-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#55716e" strokeOpacity=".24" strokeWidth=".7" /></pattern></defs>
      <rect width="480" height="300" fill="url(#charu-fallback-grid)" />
      <path d="M28 255H452" stroke="#7f9b91" strokeOpacity=".25" strokeDasharray="2 5" />
      {connections.map((connection, i) => {
        const from = connectionPoint(connection.from); const to = connectionPoint(connection.to);
        const color = connection.kind === "hinge" ? "#d8e29a" : connection.kind === "slide" ? "#8bc6c1" : "#e8875a";
        return <g key={`fallback-link-${i}`} data-testid={`fallback-scene-link-${i}`}>
          <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={color} strokeWidth="2" strokeDasharray={connection.kind === "rigid" ? undefined : "6 4"} />
          <circle cx={from[0]} cy={from[1]} r="3" fill={color} /><circle cx={to[0]} cy={to[1]} r="3" fill={color} />
          <text x={(from[0] + to[0]) / 2} y={(from[1] + to[1]) / 2 - 7} textAnchor="middle" fill={color} fontFamily="DM Mono, monospace" fontSize="8">{connection.kind}</text>
        </g>;
      })}
      {surfaces.map(({item, face, index}) => <polygon key={`${item.part.id}-face-${index}`} points={face.map(p => project(p).join(",")).join(" ")} fill={shade(colorIsHex(item.part.color) ? item.part.color : "#79958a", .66 + .3 * ((index % 5) / 4))} stroke="#d6e1d5" strokeOpacity=".35" strokeWidth=".35" />)}
      {drawing.map(item => {
        const x = project(item.center)[0];
        const y = Math.max(...item.points.map(p => project(p)[1])) + 12;
        return <g key={item.part.id} data-testid={`fallback-part-${item.part.id}`}><text x={x} y={y} textAnchor="middle" fill="#dce6dc" fontFamily="DM Mono, monospace" fontSize="8">{item.part.name.slice(0,22)}</text></g>;
      })}
      {!drawing.length && <text x="240" y="158" textAnchor="middle" fill="#a9b9b2" fontFamily="DM Sans, sans-serif" fontSize="13">No generated geometry to draw.</text>}
    </svg>
    <div className="pointer-events-none absolute left-3 top-3 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[8px] uppercase tracking-[.14em] text-white/70">Charu · {manual2d ? "2D inspection" : "SVG fallback"}</div>
    {importedFile && <div className="absolute inset-x-3 bottom-3 border border-amber-200/30 bg-[#25221e]/95 px-3 py-2.5 text-[10px] leading-4 text-amber-50" role="status" data-testid="status-glb-webgl-unsupported">{manual2d ? <>GLB meshes are not drawn in 2D inspection. Return to 3D to inspect “{importedFile.name}”.</> : <><b>GLB preview unavailable.</b> {glbWasNotParsed ? <>This browser cannot provide WebGL, so “{importedFile.name}” was not parsed or previewed.</> : <>The WebGL context was lost while previewing “{importedFile.name}”; preview stopped.</>}</>} The file remains local and was not uploaded.</div>}
    {!importedFile && <div className="absolute bottom-2 right-3 font-mono text-[8px] uppercase tracking-widest text-white/45">Static geometry fallback</div>}
  </div>;
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse(node => {
    if (!(node instanceof THREE.Mesh) && !(node instanceof THREE.Line)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => material.dispose());
  });
}

function createWebglRenderer() {
  const profiles: WebGLContextAttributes[] = [
    { antialias: true, alpha: false, powerPreference: "high-performance" },
    { antialias: false, alpha: false, powerPreference: "default" },
  ];
  for (const options of profiles) {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2", options);
      if (context) return new THREE.WebGLRenderer({ canvas, context, ...options });
    } catch {
      // Try the lower-demand profile before declaring WebGL unavailable.
    }
  }
  return null;
}

function fitGeometry(content: THREE.Group, camera: THREE.PerspectiveCamera, controls: OrbitControls, grid: THREE.GridHelper | null) {
  content.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(content);
  if (bounds.isEmpty()) return;
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distance = sphere.radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.12;
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(new THREE.Vector3(.78, .58, 1).normalize().multiplyScalar(distance));
  camera.near = Math.max(.001, sphere.radius / 1000);
  camera.far = Math.max(100, distance + sphere.radius * 40);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(.05, sphere.radius * .1);
  controls.maxDistance = distance * 12;
  if (grid) {
    const size = bounds.getSize(new THREE.Vector3());
    grid.scale.setScalar(Math.max(10, size.x, size.z) * 1.6 / 20);
    grid.position.set(sphere.center.x, bounds.min.y - Math.max(.02, sphere.radius * .002), sphere.center.z);
  }
  controls.update();
}

export function StudioViewport({ parts: inputParts, connections: sceneConnections = EMPTY_CONNECTIONS, partConnections = EMPTY_PART_CONNECTIONS, importedFile = null, customModel, className = "" }: StudioViewportProps) {
  const parts = useMemo(() => resolvePartLayout(inputParts as ViewportPart[]), [inputParts]);
  const connections = useMemo(() => [
    ...sceneConnections,
    ...partConnections.flatMap(link => {
      const from = parts.find(p => p.id === link.fromPart), to = parts.find(p => p.id === link.toPart);
      if (!from || !to) return [];
      const a = worldPoint(from, {x: 0, y: 0, z: 0}), b = worldPoint(to, {x: 0, y: 0, z: 0});
      return [{from: [a.x,a.y,a.z] as [number,number,number], to: [b.x,b.y,b.z] as [number,number,number], kind: link.kind}];
    }),
  ], [sceneConnections, partConnections, parts]);
  const hostRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [rendererAttempt, setRendererAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [webglError, setWebglError] = useState("");
  const [webglFailureKind, setWebglFailureKind] = useState<"unavailable" | "lost" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (viewMode === "2d") return;
    const host = hostRef.current;
    if (!host) return;
    let frame = 0;
    setWebglError("");
    setWebglFailureKind(null);
    const renderer = createWebglRenderer();
    if (!renderer) {
      setWebglError("WebGL2 is unavailable in this browser. 3D was attempted first.");
      setWebglFailureKind("unavailable");
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101c20");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    camera.position.set(5.8, 4.4, 7.5);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.5;
    controls.maxDistance = 80;
    controls.target.set(0, 0.6, 0);
    scene.add(new THREE.HemisphereLight("#cce3df", "#1a2225", 2.1));
    const key = new THREE.DirectionalLight("#fff3df", 3.2);
    key.position.set(5, 8, 4);
    key.castShadow = true;
    scene.add(key);
    const fill = new THREE.DirectionalLight("#8cc6c2", 1.1);
    fill.position.set(-5, 4, -3);
    scene.add(fill);
    const grid = new THREE.GridHelper(20, 40, "#55716e", "#26393a");
    grid.position.y = -0.015;
    scene.add(grid);
    const content = new THREE.Group();
    scene.add(content);
    contentRef.current = content;
    cameraRef.current = camera;
    controlsRef.current = controls;
    gridRef.current = grid;
    setWebglError("");
    setWebglFailureKind(null);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      window.cancelAnimationFrame(frame);
      setWebglError("The WebGL context was lost. Showing the static geometry fallback.");
      setWebglFailureKind("lost");
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const render = () => {
      try {
        controls.update();
        renderer.render(scene, camera);
      } catch {
        window.cancelAnimationFrame(frame);
        setWebglError("WebGL rendering failed. Showing the static geometry fallback.");
        setWebglFailureKind("lost");
        return;
      }
      frame = window.requestAnimationFrame(render);
    };
    render();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      disposeGroup(content);
      grid.geometry.dispose();
      (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(m => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      contentRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      gridRef.current = null;
    };
  }, [rendererAttempt, viewMode]);

  useEffect(() => {
    if (viewMode === "2d") return;
    const content = contentRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!content || !camera || !controls || webglError) return;
    let cancelled = false;
    setLoadError("");
    setLoading(Boolean(importedFile));
    const populate = async () => {
      content.clear();
      if (customModel) content.add(customModel.build());
      else content.add(createPartGroup(parts as ViewportPart[]));
      connections.forEach(connection => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...connection.from),
          new THREE.Vector3(...connection.to),
        ]);
        const color = connection.kind === "hinge" ? "#d8e29a" : connection.kind === "slide" ? "#8bc6c1" : "#e8875a";
        const material = connection.kind === "rigid"
          ? new THREE.LineBasicMaterial({ color, transparent: true, opacity: .95 })
          : new THREE.LineDashedMaterial({ color, dashSize: .18, gapSize: .1, transparent: true, opacity: .95 });
        const line = new THREE.Line(geometry, material);
        if (connection.kind !== "rigid") line.computeLineDistances();
        content.add(line);
      });
      if (importedFile) {
        if (!/\.glb$/i.test(importedFile.name)) throw new Error("Choose a binary .glb file.");
        if (importedFile.size > 20 * 1024 * 1024) throw new Error("The .glb file must be 20 MB or smaller.");
        const loaded = await new GLTFLoader().parseAsync(await importedFile.arrayBuffer(), "");
        if (cancelled) { disposeGroup(loaded.scene); return; }
        const bounds = new THREE.Box3().setFromObject(loaded.scene);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largest = Math.max(size.x, size.y, size.z, .001);
        loaded.scene.scale.setScalar(3.2 / largest);
        loaded.scene.position.sub(center.multiplyScalar(3.2 / largest));
        loaded.scene.position.x += parts.length ? Math.max(parts.length * 1.35, 3.5) : 0;
        loaded.scene.traverse(node => {
          if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
        });
        content.add(loaded.scene);
      }
      if (cancelled) return;
      fitGeometry(content, camera, controls, gridRef.current);
    };
    void populate().catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load this model.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      for (const child of [...content.children]) {
        content.remove(child);
        disposeGroup(child);
      }
    };
  }, [parts, connections, importedFile, webglError, rendererAttempt, viewMode, customModel?.revision, customModel?.build]);

  const show2d = Boolean(webglError) || viewMode === "2d";
  return <div className={`relative min-h-[290px] overflow-hidden rounded-lg bg-[#101c20] ${className}`} data-testid={show2d ? "viewport-studio-fallback" : "viewport-studio"}>
    <div ref={hostRef} className={`absolute inset-0 ${show2d ? "invisible" : ""}`} aria-hidden={show2d} />
    {show2d ? <>
      {customModel ? customModel.fallback : <SvgGeometryFallback parts={parts} connections={connections} importedFile={importedFile} glbWasNotParsed={webglFailureKind !== "lost"} manual2d={viewMode === "2d" && !webglError} />}
      {webglError && <div className="absolute right-3 top-12 max-w-[65%] rounded border border-white/15 bg-black/55 px-2 py-1 font-mono text-[8px] text-white/75" role="status" data-testid="status-webgl-unavailable">{webglError}</div>}
      <button type="button" className="absolute right-3 top-3 rounded border border-white/20 bg-black/65 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-white/85 hover:bg-black/80" onClick={() => webglError ? setRendererAttempt(attempt => attempt + 1) : setViewMode("3d")} data-testid={webglError ? "button-retry-3d" : "button-return-3d"}>{webglError ? "Retry 3D" : "Return to 3D"}</button>
    </> : <>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-black/35 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/70">Charu · live 3D · WebGL2</div>
      <button type="button" className="absolute right-3 top-3 rounded border border-white/20 bg-black/55 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-white/85 hover:bg-black/75" onClick={() => setViewMode("2d")} aria-label="Switch to 2D inspection" title="Switch to 2D inspection" data-testid="button-switch-2d">2D inspect</button>
      <button type="button" className="absolute right-3 bottom-3 rounded border border-white/20 bg-black/55 px-2.5 py-1.5 font-mono text-[9px] text-white/85" onClick={() => { if (contentRef.current && cameraRef.current && controlsRef.current) fitGeometry(contentRef.current, cameraRef.current, controlsRef.current, gridRef.current); }} data-testid="button-fit-geometry">Fit view</button>
      {loading && <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-[10px] text-white/80" role="status" data-testid="status-mesh-loading">Reading local GLB…</div>}
      {loadError && <div className="absolute inset-x-3 bottom-3 rounded-md border border-amber-300/30 bg-[#2b211c]/95 px-3 py-2 text-xs text-amber-100" role="alert" data-testid="error-mesh-preview">{loadError}</div>}
      {!parts.length && !importedFile && !customModel && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/45">Generate or import a model to begin</div>}
    </>}
    {!!parts.length && <div className="pointer-events-none absolute bottom-2 left-3 max-w-[75%] bg-black/60 px-2 py-1 text-[9px] text-white/70" data-testid="status-geometry-layout">XYZ extents in cm · {parts.some(p => p.groupId) || inputParts.some(p => (p as ViewportPart).position) ? "positioned geometry" : "auto-spaced exploded inspection"} · not a mechanical fit</div>}
    {customModel?.statusLabel && <div className="pointer-events-none absolute bottom-2 left-3 max-w-[75%] bg-black/60 px-2 py-1 text-[9px] text-white/75" data-testid="status-custom-geometry">{customModel.statusLabel}</div>}
  </div>;
}
