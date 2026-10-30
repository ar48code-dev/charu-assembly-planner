import { lazy, Suspense, type ComponentProps, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, Box, Check, CheckCheck, CircleAlert,
  CircleCheck, Clipboard, Download, FileText, GitBranch, History, Layers3, LoaderCircle,
  LockKeyhole, Plus, Ruler, ShieldAlert, SlidersHorizontal, Sparkles, Trash2, Wrench,
} from 'lucide-react';
import {
  useGetAssemblyPlannerStatus, useGetAssemblyPlannerSummary, useCreateAssemblyPlan,
  useListAssemblyPlans, useGetAssemblyPlan, useAcceptAssemblyPlan,
  getGetAssemblyPlannerStatusQueryKey, getGetAssemblyPlannerSummaryQueryKey,
  getListAssemblyPlansQueryKey, getGetAssemblyPlanQueryKey,
} from '@workspace/api-client-react';
import type { AssemblyPart, AssemblyPlan, AssemblyPlanInput, LockedConnection } from '@workspace/api-client-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StudioStoreProvider, useStudioWorkspace, type StudioObject, type StudioScene, type SceneMember } from '@/lib/studio-store';
import { resolvePartLayout } from '@/lib/geometry-layout';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const seedPrompt = 'A compact tabletop camera slider with a hand-cranked carriage, stable feet, and a rail that can be assembled without tools.';
const StudioViewport = lazy(() => import('@/components/studio-viewport').then(module => ({ default: module.StudioViewport })));
const DeskKitPage = lazy(() => import('@/pages/desk-kit-page'));
const SceneAgentPage = lazy(() => import('@/pages/scene-agent-page'));

function Viewport(props: ComponentProps<typeof StudioViewport>) {
  return <Suspense fallback={<div className="grid min-h-[280px] animate-pulse place-items-center bg-[#162629] text-[10px] text-white/60" role="status" data-testid="status-viewport-loading">Loading geometry viewport…</div>}><StudioViewport {...props} /></Suspense>;
}

async function exportGlb(parts: AssemblyPart[], name: string): Promise<string | null> {
  try {
    const { downloadPartsGlb } = await import('@/lib/three-model');
    await downloadPartsGlb(parts, name);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'GLB export failed. Try again with a non-empty model.';
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function PageTitle({ index, title, deck }: { index: string; title: string; deck: string }) {
  return <div className="mb-7 mt-8"><div className="eyebrow">{index}</div><h1 className="display mt-2 text-[clamp(34px,5vw,58px)] leading-[.98] text-[#203d39]">{title}</h1><p className="mt-3 max-w-[700px] text-[13px] leading-6 text-[#63716a]">{deck}</p></div>;
}
function Skeleton({ rows = 3 }: { rows?: number }) { return <div className="panel animate-pulse space-y-4 p-6" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className={`h-4 bg-[#e4e4d8] ${i === 0 ? 'w-1/3' : 'w-full'}`} />)}</div>; }
function QueryError({ label, retry }: { label: string; retry: () => unknown }) { return <div className="panel flex items-start gap-3 p-5 text-sm text-[#805741]" role="alert"><CircleAlert size={18} className="mt-0.5 shrink-0" /><span className="flex-1">{label} Nothing has been substituted.</span><button className="quiet-btn text-xs" onClick={() => void retry()} data-testid="button-retry-query">Retry</button></div>; }
function StatusPill({ status }: { status: string }) { return <span className="tag shrink-0 !py-1"><i className={`dot ${status === 'invalid' ? '!bg-[#dc8c68]' : ''}`} />{status}</span>; }
function Meta({ label, value }: { label: string; value: string }) { return <div className="min-w-0 border border-[#e0dfd3] bg-[#f6f4eb] p-2.5"><div className="eyebrow !text-[8px]">{label}</div><div className="mono mt-1 truncate text-[10px] text-[#415c52]" title={value}>{value}</div></div>; }

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { storageError, dismissStorageError } = useStudioWorkspace();
  const { data: planner, isLoading, isError, refetch } = useGetAssemblyPlannerStatus({ query: { queryKey: getGetAssemblyPlannerStatusQueryKey(), retry: 1 } });
  const nav = [
    ['/desk-kit', 'Desk kit', Ruler], ['/scene-agent', 'Scene agent', Sparkles], ['/', 'Brief studio', Sparkles], ['/objects', 'Objects', Box], ['/scenes', 'Scenes', Layers3],
    ['/versions', 'Versions', GitBranch], ['/import', 'Local import', Download], ['/plans', 'Plan archive', History],
  ] as const;
  const plannerLabel = isLoading ? 'Checking provider' : isError ? 'Status unavailable' : planner?.configured ? `${planner.provider} / ${planner.model}` : 'Provider not configured';
  return <div className="charu-shell">
    <aside className="charu-rail">
      <Link href="/" className="flex shrink-0 items-center gap-3 text-current no-underline" data-testid="link-charu-home">
        <div className="relative grid h-10 w-10 place-items-center border border-[#759187] text-[#eff0df]"><span className="display text-[24px] leading-none">c</span><i className="absolute -right-1 -top-1 h-2 w-2 bg-[#e8875a]" /></div>
         <div className="brand-copy"><div className="display text-[21px] leading-none tracking-[-.04em]">charu</div><div className="mono mt-1 text-[8px] uppercase tracking-[.2em] text-[#a8bcb0]">Parametric kit studio</div></div>
      </Link>
      <div className="eyebrow mt-10 !text-[#9bb1a5]">Workbench</div>
      <nav className="rail-nav mt-3 flex flex-col gap-1" aria-label="Main navigation">
        {nav.map(([href, label, Icon]) => <Link key={href} href={href} aria-label={label} title={label} className={`rail-link ${location === href || (href === '/plans' && location.startsWith('/plans/')) ? 'active' : ''}`} data-testid={`link-nav-${href === '/' ? 'workspace' : href.slice(1)}`}><Icon size={15} strokeWidth={1.8} /><span>{label}</span></Link>)}
      </nav>
      <div className="rail-foot mt-auto border-t border-[#42615a] pt-5">
        <div className="eyebrow !text-[#9bb1a5]">Proposal engine</div><div className="mt-2 text-[11px] text-[#e2e8dc]" data-testid="status-planner">{plannerLabel}</div>
        {isError && <button onClick={() => void refetch()} className="mt-2 text-[10px] text-[#e9a27c] underline" data-testid="button-retry-planner">Retry status</button>}
        <div className="mt-4 border-t border-[#42615a] pt-4 text-[10px] leading-5 text-[#a8bcb0]">Studio objects and scenes stay in this browser. No cloud sync.</div>
      </div>
      <div className="rail-lock mt-5 flex items-center gap-2 text-[9px] tracking-[.1em] text-[#86a196]"><LockKeyhole size={12} /> MEASUREMENTS STAY EXPLICIT</div>
    </aside>
    <main className="charu-main">
      <header className="charu-topbar"><div className="eyebrow">From physical dimensions to editable geometry</div><div className="mono hidden text-[9px] text-[#728078] sm:block">NEBIUS BRIEF · LOCAL PARAMETRIC KITS</div></header>
      {storageError && <div className="mt-4 flex items-start gap-3 border border-[#dfb98d] bg-[#fff3df] px-4 py-3 text-[11px] leading-5 text-[#765438]" role="alert" data-testid="warning-local-storage"><CircleAlert size={15} className="mt-0.5 shrink-0" /><span className="flex-1">{storageError}</span><button className="quiet-btn !border-[#d6b793] !px-2 !py-1 text-[9px]" onClick={dismissStorageError} aria-label="Dismiss browser storage warning" data-testid="button-dismiss-storage-warning">Dismiss</button></div>}
      {!isLoading && !isError && planner && !planner.configured && <div className="mt-5 flex gap-3 border border-[#d9b794] bg-[#fff3df] px-4 py-3 text-[12px] text-[#694f39]" role="status" data-testid="status-provider-unconfigured"><ShieldAlert size={17} className="mt-0.5 shrink-0" /><span><b>Planner not configured.</b> New proposals are unavailable. Existing server plans remain inspectable.</span></div>}
      {children}
    </main>
  </div>;
}

function SummaryStrip() {
  const { data, isLoading, isError, refetch } = useGetAssemblyPlannerSummary({ query: { queryKey: getGetAssemblyPlannerSummaryQueryKey(), staleTime: 15000 } });
  if (isLoading) return <div className="mt-7 grid grid-cols-3 gap-px border border-[#d8d7ca] bg-[#d8d7ca]" data-testid="loading-summary">{[1, 2, 3].map(n => <div key={n} className="h-[72px] animate-pulse bg-[#f7f4e9]" />)}</div>;
  if (isError) return <div className="mt-7 flex items-center justify-between border border-[#d8d7ca] px-4 py-3 text-xs text-[#69756e]" role="alert">Planner summary could not be loaded.<button onClick={() => void refetch()} className="underline" data-testid="button-retry-summary">Retry</button></div>;
  return <div className="mt-7 grid grid-cols-3 gap-px border border-[#d8d7ca] bg-[#d8d7ca]" data-testid="summary-planner">
    {([['Proposals', data?.totalPlans ?? 0], ['Validated', data?.validPlans ?? 0], ['Accepted', data?.acceptedPlans ?? 0]] as const).map(([label, value]) => <div key={label} className="bg-[#f8f6ed] px-4 py-3"><div className="eyebrow !text-[9px]">{label}</div><div className="display mt-1 text-[25px]" data-testid={`metric-${label.toLowerCase()}`}>{value}</div></div>)}
  </div>;
}
function parseList(text: string) { return Array.from(new Set(text.split(/[\n,]/).map(v => v.trim()).filter(Boolean))); }

function WorkspacePage() {
  const [prompt, setPrompt] = useState(seedPrompt);
  const [useCase, setUseCase] = useState<AssemblyPlanInput['useCase']>('display');
  const [partsText, setPartsText] = useState('base, rail, carriage');
  const [connections, setConnections] = useState<LockedConnection[]>([{ fromPart: 'base', toPart: 'rail' }]);
  const [maxParts, setMaxParts] = useState(5); const [geometryBudget, setGeometryBudget] = useState(12000);
  const [result, setResult] = useState<AssemblyPlan | null>(null); const [formError, setFormError] = useState('');
  const createPlan = useCreateAssemblyPlan(); const qc = useQueryClient();
  const { data: planner } = useGetAssemblyPlannerStatus({ query: { queryKey: getGetAssemblyPlannerStatusQueryKey() } });
  const requiredParts = useMemo(() => parseList(partsText), [partsText]);
  const submit = () => {
    setFormError('');
    if (prompt.trim().length < 15) return setFormError('Describe the assembly in at least 15 characters.');
    if (!requiredParts.length || requiredParts.length > 5) return setFormError('Add between 1 and 5 distinct required part names.');
    if (requiredParts.some(p => p.length > 80)) return setFormError('Each required part name must be 80 characters or fewer.');
    if (connections.length > 7 || connections.some(c => !c.fromPart.trim() || !c.toPart.trim() || !requiredParts.includes(c.fromPart) || !requiredParts.includes(c.toPart))) return setFormError('Complete each link using names in the required-parts list. Up to seven links are allowed.');
    if (maxParts < 2 || maxParts > 8 || geometryBudget < 100 || geometryBudget > 80000) return setFormError('Part ceiling or geometry budget is outside the allowed range.');
    createPlan.mutate({ data: { prompt: prompt.trim(), useCase, requiredParts, requiredConnections: connections, maxParts, geometryBudget } }, {
      onSuccess: plan => { setResult(plan); void qc.invalidateQueries({ queryKey: getListAssemblyPlansQueryKey() }); void qc.invalidateQueries({ queryKey: getGetAssemblyPlannerSummaryQueryKey() }); },
      onError: () => setFormError('The server could not create a proposal. Your brief is still here; retry when ready.'),
    });
  };
  const options = requiredParts.length ? requiredParts : [''];
  return <div className="enter">
    <div className="mt-8 flex flex-wrap items-end justify-between gap-5"><div><div className="eyebrow">01 / Brief → proposal</div><h1 className="display mt-2 text-[clamp(38px,5vw,62px)] leading-[.94] text-[#203d39]">Make the idea<br className="hidden sm:block" /> hold together.</h1></div><p className="max-w-[270px] border-l-2 border-[#e8875a] pl-4 text-[12px] leading-5 text-[#64726a]">Lock the non-negotiables. Inspect the proposed geometry. Accept only what you understand.</p></div>
    <SummaryStrip />
    <div className="mt-7 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,.92fr)_minmax(400px,1.08fr)]">
      <section className="panel p-5 sm:p-6" aria-labelledby="brief-title">
        <div className="flex items-center justify-between border-b border-[#d8d7ca] pb-4"><div><div className="eyebrow">Design brief</div><h2 id="brief-title" className="display mt-1 text-[24px]">Set the boundaries</h2></div><span className="mono text-[9px] text-[#829088]">NEBIUS · SERVER VALIDATED</span></div>
        <label className="mt-5 block"><span className="mb-2 flex items-center justify-between text-[12px] font-semibold text-[#344e48]"><span>What are you making?</span><span className="mono text-[10px] font-normal text-[#859188]">{prompt.length} / 2000</span></span><textarea className="input-field min-h-[105px] resize-y leading-6" maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} aria-describedby="prompt-help" data-testid="input-assembly-prompt" /><span id="prompt-help" className="mt-1 block text-[10px] text-[#77847b]">At least 15 characters. Describe purpose and assembly constraints.</span></label>
        <div className="mt-4"><div className="mb-2 text-[12px] font-semibold text-[#344e48]">Intended use</div><div className="grid grid-cols-3 gap-2">{([['display', 'Display'], ['simulation', 'Simulation'], ['game', 'Game']] as const).map(([v, label]) => <button key={v} type="button" aria-pressed={useCase === v} onClick={() => setUseCase(v)} className={`border px-2 py-2.5 text-[11px] ${useCase === v ? 'border-[#e8875a] bg-[#fbe9dc]' : 'border-[#d8d7ca] bg-[#f6f4eb]'}`} data-testid={`button-usecase-${v}`}>{label}</button>)}</div></div>
        <label className="mt-5 block border-t border-[#d8d7ca] pt-4"><span className="flex items-center gap-2 text-[12px] font-semibold text-[#344e48]"><LockKeyhole size={14} /> Required parts</span><span className="mt-1 block text-[10px] text-[#77847b]">Comma or line separated; up to five locked names.</span><input className="input-field mono mt-2 text-[12px]" value={partsText} onChange={e => setPartsText(e.target.value)} data-testid="input-required-parts" /></label>
        <div className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2 text-[12px] font-semibold text-[#344e48]"><GitBranch size={14} /> Locked connections</div><p className="mt-1 text-[10px] text-[#77847b]">Required part-to-part links.</p></div><button type="button" className="quiet-btn flex items-center gap-1 text-[10px]" disabled={connections.length >= 7} onClick={() => setConnections(old => [...old, { fromPart: options[0], toPart: options[1] ?? options[0] }])} data-testid="button-add-connection"><Plus size={12} /> Add link</button></div>
          <div className="mt-2 space-y-2">{connections.map((c, i) => <div key={i} className="grid grid-cols-[1fr_16px_1fr_32px] items-center gap-1.5"><select className="input-field !py-2 mono text-[10px]" value={c.fromPart} aria-label={`Connection ${i + 1} from`} onChange={e => setConnections(old => old.map((v, j) => i === j ? { ...v, fromPart: e.target.value } : v))} data-testid={`select-connection-from-${i}`}>{options.map((p, j) => <option key={`${p}-${j}`} value={p}>{p || 'Add required part'}</option>)}</select><ArrowRight size={13} className="text-[#e8875a]" /><select className="input-field !py-2 mono text-[10px]" value={c.toPart} aria-label={`Connection ${i + 1} to`} onChange={e => setConnections(old => old.map((v, j) => i === j ? { ...v, toPart: e.target.value } : v))} data-testid={`select-connection-to-${i}`}>{options.map((p, j) => <option key={`${p}-${j}`} value={p}>{p || 'Add required part'}</option>)}</select><button type="button" aria-label={`Remove connection ${i + 1}`} className="quiet-btn !px-2 !py-1" onClick={() => setConnections(old => old.filter((_, j) => i !== j))} data-testid={`button-remove-connection-${i}`}>×</button></div>)}{!connections.length && <div className="border border-dashed border-[#c7d0c8] p-3 text-[10px] text-[#77847b]">No required links.</div>}</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#d8d7ca] pt-4"><label><span className="mb-1 flex items-center gap-2 text-[10px] font-semibold"><Layers3 size={12} /> Part ceiling</span><input type="number" className="input-field mono" min={2} max={8} value={maxParts} onChange={e => setMaxParts(Number(e.target.value))} data-testid="input-max-parts" /><small className="text-[9px] text-[#839087]">2–8 total</small></label><label><span className="mb-1 flex items-center gap-2 text-[10px] font-semibold"><Ruler size={12} /> Geometry budget</span><input type="number" className="input-field mono" min={100} max={80000} value={geometryBudget} onChange={e => setGeometryBudget(Number(e.target.value))} data-testid="input-geometry-budget" /><small className="text-[9px] text-[#839087]">100–80,000 units</small></label></div>
        {formError && <div className="error-text mt-4 border border-[#d79a7e] bg-[#fff0e5] px-3 py-2.5" role="alert" data-testid="error-create-plan"><CircleAlert size={14} className="mr-2 inline" />{formError}</div>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="max-w-[240px] text-[9px] leading-4 text-[#78857c]">Structural validation only. Not mechanical certification or manufacturing safety.</span><button className="primary-btn flex items-center gap-2 text-[12px]" onClick={submit} disabled={createPlan.isPending || planner?.configured === false} data-testid="button-create-proposal">{createPlan.isPending ? <><LoaderCircle size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Create proposal <ArrowDownRight size={14} /></>}</button></div>
      </section>
      <section className="min-w-0">
        {result ? <PlanReview plan={result} onAccepted={setResult} allowSaveObject /> : <div className="panel grid-paper grid min-h-[360px] place-items-center p-6 text-center" data-testid="empty-proposal"><div><div className="mx-auto grid h-16 w-16 place-items-center border border-[#91a99b] text-[#57766b]"><Box size={29} strokeWidth={1} /></div><div className="display mt-5 text-[25px] text-[#304b45]">The canvas is ready.</div><p className="mx-auto mt-2 max-w-[310px] text-[12px] leading-5 text-[#75837a]">A server-generated proposal will appear here with its parts, connections and structural checks.</p></div></div>}
        <RecentActivity />
      </section>
    </div>
  </div>;
}

function RecentActivity() {
  const { data, isLoading, isError, refetch } = useGetAssemblyPlannerSummary({ query: { queryKey: getGetAssemblyPlannerSummaryQueryKey(), staleTime: 15000 } });
  return <div className="mt-4 panel p-4"><div className="flex items-center justify-between"><div><div className="eyebrow">Server archive</div><h3 className="display mt-1 text-[19px]">Recent proposals</h3></div><Link href="/plans" className="flex items-center gap-1 text-[10px] text-[#536b62] no-underline">Open archive <ArrowRight size={12} /></Link></div>
    {isLoading && <div className="mt-3 h-10 animate-pulse bg-[#eeede3]" role="status" />}
    {isError && <div className="mt-3 flex justify-between text-[10px] text-[#7b6b5d]" role="alert">Recent plans unavailable.<button onClick={() => void refetch()} className="underline" data-testid="button-retry-recent">Retry</button></div>}
    {!isLoading && !isError && !data?.recentPlans.length && <div className="mt-3 border-t border-[#deddd1] py-3 text-[10px] text-[#77847b]" data-testid="empty-recent-plans">No saved proposals yet.</div>}
    {!isLoading && !isError && data?.recentPlans.slice(0, 3).map(p => <Link href={`/plans/${encodeURIComponent(p.id)}`} key={p.id} className="data-row mt-2 flex items-center justify-between gap-2 py-2 text-current no-underline" data-testid={`link-recent-plan-${p.id}`}><span className="truncate text-[11px] font-semibold">{p.candidate?.title ?? p.prompt}</span><StatusPill status={p.status} /></Link>)}
  </div>;
}

function PlanReview({ plan, onAccepted, allowSaveObject = false }: { plan: AssemblyPlan; onAccepted?: (plan: AssemblyPlan) => void; allowSaveObject?: boolean }) {
  const [confirm, setConfirm] = useState(false); const [error, setError] = useState(''); const [exportError, setExportError] = useState(''); const [geometryExportError, setGeometryExportError] = useState('');
  const [objectName, setObjectName] = useState(plan.candidate?.title ?? ''); const [savedId, setSavedId] = useState('');
  const accept = useAcceptAssemblyPlan(); const qc = useQueryClient(); const { saveObjectFromPlan } = useStudioWorkspace();
  const candidate = plan.candidate; const accepted = plan.status === 'accepted' || Boolean(plan.acceptedAt);
  const saveEvidence = async () => {
    setExportError('');
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(plan)));
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const manifest = { schema: 'charu-assembly-evidence/1', provider: 'Nebius Token Factory', integrity: { algorithm: 'SHA-256', scope: 'canonicalized plan object', canonicalPlanHash: hash }, plan };
      const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `charu-evidence-${plan.id}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError('Evidence export failed: secure SHA-256 is unavailable in this browser.'); }
  };
  const acceptPlan = () => {
    setError('');
    accept.mutate({ id: plan.id }, { onSuccess: saved => { onAccepted?.(saved); setConfirm(false); void qc.invalidateQueries({ queryKey: getGetAssemblyPlanQueryKey(plan.id) }); void qc.invalidateQueries({ queryKey: getListAssemblyPlansQueryKey() }); void qc.invalidateQueries({ queryKey: getGetAssemblyPlannerSummaryQueryKey() }); }, onError: () => setError('Server acceptance was not confirmed. This proposal remains unchanged.') });
  };
  const saveObject = () => {
    if (!objectName.trim()) { setError('Give this object a name before saving.'); return; }
    const object = saveObjectFromPlan(plan, objectName.trim());
    if (!object) { setError('This proposal has no candidate geometry to save.'); return; }
    setSavedId(object.id); setError('');
  };
  const valid = Boolean(plan.validation?.valid && candidate);
  return <article className="panel overflow-hidden" data-testid={`review-plan-${plan.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d8d7ca] p-4 sm:p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="eyebrow">Server proposal</div><StatusPill status={plan.status} /></div><h2 className="display mt-2 break-words text-[25px] leading-tight text-[#294740]" data-testid="text-candidate-title">{candidate?.title ?? 'Proposal without candidate geometry'}</h2><p className="mt-2 text-[11px] leading-5 text-[#6b7971]">{candidate?.summary ?? 'No candidate content was returned.'}</p></div><div><button className="quiet-btn flex items-center gap-2 text-[10px]" onClick={() => void saveEvidence()} data-testid="button-export-manifest"><Download size={13} /> SHA-256 evidence</button><div className="mono mt-1 text-[8px] text-[#879187]">Canonical saved response</div>{exportError && <div role="alert" className="error-text mt-1">{exportError}</div>}</div></div>
    <div className="p-4 sm:p-5">{candidate ? <><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Meta label="Use case" value={plan.useCase} /><Meta label="Model" value={plan.model || 'Not reported'} /><Meta label="Repairs" value={String(plan.repairAttempts)} /><Meta label="Parts" value={String(candidate.parts.length)} /></div>
      <div className="mt-4"><Viewport parts={candidate.parts} partConnections={candidate.connections} className="min-h-[300px]" /></div>
      <div className="mt-4 flex flex-wrap gap-2">{candidate.parts.map(p => <span className="tag !normal-case" key={p.id} data-testid={`tag-part-${p.id}`}><span className="h-2.5 w-2.5 border border-[#50665d]" style={{ backgroundColor: p.color }} />{p.name} · {p.shape}</span>)}</div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="border border-[#d8d7ca] p-3"><div className="eyebrow flex items-center gap-2"><Wrench size={12} /> Build sequence</div><ol className="mt-2 space-y-2">{candidate.steps.map((s, i) => <li key={`${s}-${i}`} className="flex gap-2 text-[10px] leading-4 text-[#52665d]"><span className="mono text-[#db8159]">{String(i + 1).padStart(2, '0')}</span>{s}</li>)}{!candidate.steps.length && <li className="text-[10px] text-[#78847b]">No steps returned.</li>}</ol></div><div className="border border-[#d8d7ca] p-3"><div className="eyebrow flex items-center gap-2"><FileText size={12} /> Connections & notes</div><div className="mt-2 space-y-1">{candidate.connections.map((c, i) => <div key={i} className="mono text-[9px] text-[#52665d]">{c.fromPart} → {c.toPart} · {c.kind}</div>)}{candidate.designNotes.map((n, i) => <div key={`note-${i}`} className="border-l border-[#ced4c4] pl-2 text-[10px] leading-4 text-[#63736a]">{n}</div>)}</div></div></div>
    </> : <div className="grid-paper grid min-h-[170px] place-items-center p-5 text-center text-[12px] text-[#75837a]" data-testid="empty-candidate">No geometry was returned. Nothing is drawn or inferred.</div>}
      <div className="mt-4 border-t border-[#deddd1] pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="eyebrow flex items-center gap-2">Structural validation <span className={`tag !py-1 ${valid ? '!bg-[#e9f0e7]' : '!bg-[#f8e9df]'}`}>{valid ? 'Passed' : 'Invalid'}</span></div><span className="mono text-[9px] text-[#7c8980]">{plan.validation?.checks?.filter(c => c.passed).length ?? 0}/{plan.validation?.checks?.length ?? 0} PASS</span></div>
        <div className="mt-2 space-y-2">{plan.validation?.checks?.map((check, i) => <div key={`${check.name}-${i}`} className="flex gap-2 border-b border-[#e6e4d9] pb-2 text-[10px]"><span className="mt-0.5">{check.passed ? <CircleCheck size={14} className="text-[#61856c]" /> : <CircleAlert size={14} className="text-[#b9684c]" />}</span><div><b>{check.name}</b><div className="mt-0.5 text-[#78847b]">{check.detail}</div></div></div>)}</div>
        {plan.validation?.warnings?.map((w, i) => <div key={i} className="mt-2 border border-[#dfc29c] bg-[#fff3df] p-2 text-[10px] text-[#806849]">{w}</div>)}
        <p className="mt-3 text-[10px] leading-4 text-[#8a6c56]" data-testid="text-validation-limitation">Structural validation checks data and constraints only. It is not mechanical certification, a safety assessment, or manufacturing approval.</p>
        {allowSaveObject && candidate && <div className="mt-4 border-t border-[#deddd1] pt-4"><div className="eyebrow">Keep in this browser</div><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input className="input-field text-[11px]" aria-label="Object name" value={objectName} onChange={e => setObjectName(e.target.value)} data-testid="input-save-object-name" /><button className="quiet-btn flex items-center justify-center gap-2 text-[10px]" onClick={saveObject} data-testid="button-save-proposal-object"><Plus size={13} /> Save as object</button></div>{savedId && <div className="mt-2 text-[10px] text-[#4c684f]" role="status" data-testid="status-object-saved">Saved locally. <Link href="/objects" className="underline">Open object library</Link></div>}</div>}
        {accepted && <div className="mt-3 flex items-center gap-2 bg-[#edf1df] px-3 py-2 text-[10px] text-[#4e684e]" data-testid="status-accepted"><CheckCheck size={14} /> Accepted by server{plan.acceptedAt ? ` · ${new Date(plan.acceptedAt).toLocaleString()}` : ''}</div>}
        {!accepted && <div className="mt-3">{!confirm ? <button className="primary-btn flex w-full items-center justify-center gap-2 text-[11px]" disabled={!valid} onClick={() => setConfirm(true)} data-testid="button-accept-plan">{valid ? <><Check size={14} /> Review server acceptance</> : <><ShieldAlert size={14} /> Invalid proposals cannot be accepted</>}</button> : <div className="border border-[#d8ad90] bg-[#fff1e5] p-3"><b className="text-[11px]">Accept this exact proposal?</b><p className="mt-1 text-[10px] leading-4 text-[#79634f]">Acceptance is recorded on the server and does not certify safety.</p>{error && <div className="error-text mt-2" role="alert">{error}</div>}<div className="mt-3 flex gap-2"><button className="quiet-btn flex-1 text-[10px]" onClick={() => setConfirm(false)} disabled={accept.isPending} data-testid="button-cancel-accept">Go back</button><button className="primary-btn flex-1 text-[10px]" onClick={acceptPlan} disabled={accept.isPending || !valid} data-testid="button-confirm-accept">{accept.isPending ? 'Recording…' : 'Confirm acceptance'}</button></div></div>}</div>}
        {candidate && <><button className="quiet-btn mt-3 flex w-full items-center justify-center gap-2 text-[10px]" onClick={async () => setGeometryExportError((await exportGlb(candidate.parts, candidate.title)) ?? '')} data-testid="button-export-proposal-glb"><Download size={13} /> Export generated geometry as GLB</button>{geometryExportError && <div className="error-text mt-2" role="alert" data-testid="error-proposal-glb-export">{geometryExportError}</div>}</>}
      </div>
    </div>
  </article>;
}

function PlansPage() {
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all');
  const { data: plans, isLoading, isError, refetch } = useListAssemblyPlans({ query: { queryKey: getListAssemblyPlansQueryKey(), staleTime: 10000, refetchOnMount: 'always' } });
  const filtered = useMemo(() => (plans ?? []).filter(p => (filter === 'all' || p.status === filter) && `${p.candidate?.title ?? ''} ${p.prompt} ${p.model} ${p.id}`.toLowerCase().includes(search.toLowerCase())), [plans, filter, search]);
  return <><PageTitle index="06 / Server archive" title="Plans with a paper trail." deck="Server-backed proposals, their structural checks and explicit acceptance state. Studio objects are stored separately in this browser." />
    <div className="mb-4 flex flex-wrap gap-3"><div className="relative min-w-[220px] flex-1"><SlidersHorizontal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#77847b]" /><input className="input-field !pl-9 text-[11px]" placeholder="Search proposals, brief, model…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-plans" /></div><select className="input-field !w-auto min-w-[120px] text-[11px]" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter plan status" data-testid="select-plan-status"><option value="all">All statuses</option><option value="valid">Valid</option><option value="invalid">Invalid</option><option value="accepted">Accepted</option></select></div>
    {isLoading && <Skeleton rows={5} />}{isError && <QueryError label="Saved plans could not be loaded." retry={refetch} />}
    {!isLoading && !isError && !plans?.length && <div className="panel grid min-h-[250px] place-items-center p-8 text-center" data-testid="empty-plan-archive"><div><History className="mx-auto text-[#58756a]" size={28} /><h2 className="display mt-3 text-[25px]">Archive is quiet.</h2><p className="mt-2 text-[11px] text-[#76837a]">Create a proposal to start a server-side record.</p><Link href="/" className="primary-btn mt-4 inline-flex items-center gap-2 text-[11px] no-underline"><Plus size={13} /> Start a brief</Link></div></div>}
    {!isLoading && !isError && plans?.length && !filtered.length ? <div className="panel p-8 text-center"><div className="display text-[23px]">No matches.</div><button className="quiet-btn mt-3 text-xs" onClick={() => { setSearch(''); setFilter('all'); }} data-testid="button-clear-plan-filters">Clear filters</button></div> : null}
    {!isLoading && !isError && filtered.map(p => <Link key={p.id} href={`/plans/${encodeURIComponent(p.id)}`} className="panel mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 text-current no-underline hover:bg-[#f9f7ee]" data-testid={`card-plan-${p.id}`}><span className="hidden h-11 w-11 place-items-center border bg-[#eff0e5] text-[#557166] sm:grid"><Box size={19} /></span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><b className="truncate text-[12px]">{p.candidate?.title ?? p.prompt}</b><StatusPill status={p.status} /></span><span className="mt-1 block truncate text-[10px] text-[#7a867e]">{p.candidate?.summary ?? 'No candidate summary.'}</span><span className="mono mt-2 block text-[8px] text-[#87948a]">{new Date(p.createdAt).toLocaleString()} · {p.candidate?.parts.length ?? 0} parts · {p.model}</span></span><ArrowRight size={16} className="text-[#a8b0a5]" /></Link>)}
    {!isLoading && !isError && plans && <div className="mono mt-3 text-[9px] text-[#869188]" data-testid="text-plan-count">{filtered.length} shown / {plans.length} saved</div>}
  </>;
}
function PlanDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: plan, isLoading, isError, refetch } = useGetAssemblyPlan(id, { query: { enabled: !!id, queryKey: getGetAssemblyPlanQueryKey(id), refetchOnMount: 'always' } });
  return <><div className="mt-7"><Link href="/plans" className="inline-flex items-center gap-2 text-[11px] text-[#617269] no-underline"><ArrowLeft size={14} /> Back to archive</Link></div><PageTitle index="Plan detail" title="Read the proposal closely." deck="This page reloads the persisted server response. Validation is structural only, not mechanical certification." />
    {isLoading && <Skeleton rows={6} />}{isError && <QueryError label="This saved plan could not be loaded." retry={refetch} />}
    {!isLoading && !isError && !plan && <div className="panel p-6 text-sm text-[#68766e]" data-testid="empty-plan-detail">No plan data was returned for this identifier.</div>}
    {plan && <><div className="mb-3 flex flex-wrap items-center justify-between gap-3 border border-[#d8d7ca] bg-[#eeece1] px-4 py-3"><div className="min-w-0"><div className="eyebrow">Plan identifier</div><div className="mono mt-1 truncate text-[10px] text-[#4d6459]" data-testid="text-plan-id">{plan.id}</div></div><button className="quiet-btn flex items-center gap-2 text-[10px]" onClick={() => void navigator.clipboard?.writeText(plan.id)} data-testid="button-copy-plan-id"><Clipboard size={12} /> Copy ID</button></div><PlanReview plan={plan} /></>}
  </>;
}

function ObjectsPage() {
  const { objects, updateObject, deleteObject } = useStudioWorkspace(); const [selectedId, setSelectedId] = useState('');
  const [editId, setEditId] = useState(''); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [note, setNote] = useState(''); const [parts, setParts] = useState<AssemblyPart[]>([]); const [error, setError] = useState(''); const [exportError, setExportError] = useState('');
  const selected = objects.find(o => o.id === selectedId); const editing = objects.find(o => o.id === editId);
  const openEdit = (o: StudioObject) => { setEditId(o.id); setName(o.name); setDescription(o.description); setNote('Object and geometry update'); setParts(structuredClone(o.parts)); setError(''); };
  const saveEdit = () => {
    if (!editing) return;
    if (!name.trim()) return setError('Object name is required.');
    if (!description.trim()) return setError('Add a short description.');
    if (!parts.length) return setError('At least one generated part is required.');
    if (parts.some(p => !p.name.trim())) return setError('Every generated part needs a name.');
    if (parts.some(p => !['box', 'cylinder'].includes(p.shape))) return setError('Part shape must be box or cylinder.');
    if (parts.some(p => [p.dimensions.x, p.dimensions.y, p.dimensions.z].some(d => !Number.isFinite(d) || d <= 0 || d > 10000))) return setError('Each dimension must be greater than 0 and no larger than 10,000 units.');
    if (parts.some(p => !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.color))) return setError('Use a valid hex color such as #63847a or #abc.');
    updateObject(editing.id, { name: name.trim(), description: description.trim(), parts }, note);
    setEditId(''); setSelectedId(editing.id); setError('');
  };
  const remove = (o: StudioObject) => { if (window.confirm(`Delete “${o.name}” and remove it from saved scenes?`)) { deleteObject(o.id); if (selectedId === o.id) setSelectedId(''); } };
  return <><PageTitle index="02 / Local library" title="Objects, kept close." deck="Saved proposals become editable, versioned studio objects on this device. Rename, describe, inspect or export their generated geometry." />
    {!objects.length ? <div className="panel grid min-h-[270px] place-items-center p-7 text-center" data-testid="empty-object-library"><div><Box className="mx-auto text-[#5c796d]" size={29} /><h2 className="display mt-3 text-[25px]">No objects yet.</h2><p className="mt-2 max-w-[350px] text-[11px] leading-5 text-[#76837a]">Generate a candidate in the brief studio, then save it as an object. Local objects are not sent to a server.</p><Link href="/" className="primary-btn mt-4 inline-flex items-center gap-2 text-[11px] no-underline"><Sparkles size={13} /> Create a proposal</Link></div></div> :
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,.7fr)_minmax(0,1.3fr)]"><section className="panel overflow-hidden" aria-label="Saved objects"><div className="border-b border-[#d8d7ca] px-4 py-3"><div className="eyebrow">Stored in this browser</div><div className="mt-1 text-[11px] text-[#718078]">{objects.length} object{objects.length === 1 ? '' : 's'}</div></div>{objects.map(o => <button key={o.id} className={`data-row block w-full px-4 py-3 text-left hover:bg-[#f2f1e8] ${selectedId === o.id ? 'bg-[#edf0e5]' : ''}`} onClick={() => setSelectedId(o.id)} data-testid={`button-open-object-${o.id}`}><span className="flex items-center justify-between gap-2"><b className="truncate text-[12px] text-[#304b45]">{o.name}</b><span className="tag !py-1">v{o.versions.length}</span></span><span className="mt-1 block truncate text-[10px] text-[#77847b]">{o.description}</span><span className="mono mt-2 block text-[8px] text-[#8a968e]">{o.parts.length} parts · updated {new Date(o.updatedAt).toLocaleDateString()}</span></button>)}</section>
      <section className="min-w-0">{selected ? <div className="panel p-4 sm:p-5" data-testid={`object-detail-${selected.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="eyebrow">Object inspector · v{selected.versions.length}</div><h2 className="display mt-1 text-[27px]">{selected.name}</h2><p className="mt-1 max-w-[540px] text-[11px] leading-5 text-[#738078]">{selected.description}</p></div>
          <div className="flex flex-wrap gap-2"><button className="quiet-btn text-[10px]" onClick={() => openEdit(selected)} data-testid="button-edit-object">Edit details</button><button className="quiet-btn flex items-center gap-1 text-[10px]" onClick={async () => setExportError((await exportGlb(selected.parts, selected.name)) ?? '')} data-testid="button-export-object-glb"><Download size={12} /> Export GLB</button><button className="quiet-btn !border-[#d8ad90] !text-[#895d47]" onClick={() => remove(selected)} data-testid="button-delete-object"><Trash2 size={12} /></button></div>
        </div>
        {exportError && <div className="error-text mt-2" role="alert" data-testid="error-object-glb-export">{exportError}</div>}
        <div className="mt-4"><Viewport parts={selected.parts} partConnections={selected.connections} className="min-h-[340px]" /></div>
        <p className="mt-2 text-[10px] leading-4 text-[#738078]">Dimensions are XYZ extents in centimeters. Cylinder axes are inferred from the closest diameter pair. Parts without poses are spaced for inspection, not assembled by a physical solver. GLB export converts centimeters to meters.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Meta label="Source proposal" value={selected.sourcePlanId} /><Meta label="Parts" value={String(selected.parts.length)} /><Meta label="Connections" value={String(selected.connections.length)} /><Meta label="Updated" value={new Date(selected.updatedAt).toLocaleString()} /></div>
        <div className="mt-4 border-t border-[#deddd1] pt-3"><div className="eyebrow">Geometry inventory · cm</div><div className="mt-2 flex flex-wrap gap-2">{selected.parts.map(p => <span className="tag !normal-case" key={p.id}>{p.name} · {p.dimensions.x}×{p.dimensions.y}×{p.dimensions.z}</span>)}</div><div className="mt-3 flex flex-wrap gap-2">{selected.connections.map((c, i) => <span className="tag !normal-case" key={i}>{c.fromPart} → {c.toPart} · {c.kind}</span>)}</div></div>
      </div> : <div className="panel grid min-h-[300px] place-items-center p-7 text-center text-[11px] text-[#75837a]" data-testid="empty-object-selection">Choose an object to inspect its geometry and actions.</div>}</section></div>}
    {editing && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1e3530]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-object-heading"><form className="panel mx-auto my-5 w-full max-w-[620px] p-5" onSubmit={e => { e.preventDefault(); saveEdit(); }}><div className="eyebrow">Versioned object update</div><h2 className="display mt-1 text-[25px]" id="edit-object-heading">Edit object and geometry</h2><label className="mt-4 block text-[11px] font-semibold">Name<input className="input-field mt-1" value={name} onChange={e => setName(e.target.value)} maxLength={100} data-testid="input-object-name" /></label><label className="mt-3 block text-[11px] font-semibold">Description<textarea className="input-field mt-1 min-h-[70px]" value={description} onChange={e => setDescription(e.target.value)} maxLength={1200} data-testid="input-object-description" /></label>
      <div className="mt-4 border-t border-[#deddd1] pt-3"><div className="eyebrow">Generated parts · positive dimensions, max 10,000 units</div><div className="mt-2 max-h-[40vh] space-y-3 overflow-y-auto">{parts.map((part, i) => <div key={part.id} className="border border-[#d8d7ca] bg-[#f7f5eb] p-3" data-testid={`edit-part-${part.id}`}><div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(90px,1fr)_110px_88px]"><label className="text-[9px] font-medium">Part name<input className="input-field mt-1 !py-2 text-[10px]" value={part.name} onChange={e => setParts(prev => prev.map((p, j) => i === j ? { ...p, name: e.target.value } : p))} maxLength={80} data-testid={`input-edit-part-name-${i}`} /></label><label className="text-[9px] font-medium">Shape<select className="input-field mt-1 !py-2 text-[10px]" value={part.shape} onChange={e => setParts(prev => prev.map((p, j) => i === j ? { ...p, shape: e.target.value as AssemblyPart['shape'] } : p))} data-testid={`select-edit-part-shape-${i}`}><option value="box">Box</option><option value="cylinder">Cylinder</option></select></label><label className="text-[9px] font-medium">Color<input className="input-field mt-1 !h-[37px] !p-1" type="color" value={/^#(?:[0-9a-f]{6})$/i.test(part.color) ? part.color : '#79958a'} onChange={e => setParts(prev => prev.map((p, j) => i === j ? { ...p, color: e.target.value } : p))} data-testid={`input-edit-part-color-${i}`} /></label></div><div className="mt-2 grid grid-cols-3 gap-2">{(['x', 'y', 'z'] as const).map(axis => <label key={axis} className="text-[9px] font-medium">Dimension {axis.toUpperCase()}<input className="input-field mt-1 !py-2 mono text-[10px]" type="number" min="0.01" max="10000" step="0.01" value={part.dimensions[axis]} onChange={e => setParts(prev => prev.map((p, j) => i === j ? { ...p, dimensions: { ...p.dimensions, [axis]: Number(e.target.value) } } : p))} data-testid={`input-edit-part-${i}-dimension-${axis}`} /></label>)}</div></div>)}</div></div>
      <label className="mt-3 block text-[11px] font-semibold">Version note<input className="input-field mt-1" value={note} onChange={e => setNote(e.target.value)} maxLength={160} data-testid="input-object-version-note" /></label>{error && <div className="error-text mt-2" role="alert" data-testid="error-object-edit">{error}</div>}<div className="mt-4 flex justify-end gap-2"><button type="button" className="quiet-btn text-[10px]" onClick={() => setEditId('')} data-testid="button-cancel-object-edit">Cancel</button><button className="primary-btn text-[10px]" type="submit" data-testid="button-save-object-edit">Save version</button></div></form></div>}
  </>;
}

function ScenesPage() {
  const { objects, scenes, saveScene, deleteScene } = useStudioWorkspace();
  const [sceneId, setSceneId] = useState(''); const [sceneName, setSceneName] = useState(''); const [description, setDescription] = useState('');
  const [members, setMembers] = useState<SceneMember[]>([]); const [connections, setConnections] = useState<StudioScene['connections']>([]);
  const [error, setError] = useState('');
  const reset = () => { setSceneId(''); setSceneName(''); setDescription(''); setMembers([]); setConnections([]); setError(''); };
  const load = (scene: StudioScene) => { setSceneId(scene.id); setSceneName(scene.name); setDescription(scene.description); setMembers(scene.members.map(m => ({ ...m, position: [...m.position] as [number, number, number] }))); setConnections(scene.connections.map(c => ({ ...c }))); setError(''); };
  const addObject = (id: string) => {
    if (!id || members.some(m => m.objectId === id)) return;
    const width = (objectId: string) => {
      const parts = resolvePartLayout(objects.find(o => o.id === objectId)?.parts ?? []);
      return parts.length ? Math.max(...parts.map(p => p.position![0] + p.dimensions.x / 2)) - Math.min(...parts.map(p => p.position![0] - p.dimensions.x / 2)) : 1;
    };
    setMembers(prev => [...prev, { objectId: id, position: [prev.length ? Math.max(...prev.map(m => m.position[0] + width(m.objectId) / 2)) + width(id) / 2 + 2 : 0, 0, 0], rotation: 0 }]);
  };
  const save = () => { if (!sceneName.trim()) return setError('Scene name is required.'); if (!members.length) return setError('Add at least one saved object.'); if (connections.some(c => c.fromObjectId === c.toObjectId)) return setError('A scene connection must join two different objects.'); const id = sceneId || crypto.randomUUID(); saveScene({ id, name: sceneName.trim(), description: description.trim(), members, connections }); setSceneId(id); setError(''); };
  const sceneParts = members.flatMap(member => { const obj = objects.find(o => o.id === member.objectId); return obj ? resolvePartLayout(obj.parts).map((p, i) => ({ ...p, id: `${obj.id}-${p.id}-${i}`, name: `${obj.name}/${p.name}`, groupId: obj.id, groupPosition: member.position, rotation: member.rotation * Math.PI / 180 })) : []; });
  const sceneLinks = connections.flatMap(link => {
    const from = members.find(member => member.objectId === link.fromObjectId);
    const to = members.find(member => member.objectId === link.toObjectId);
    return from && to ? [{ from: [from.position[0], from.position[1] + 0.45, from.position[2]] as [number, number, number], to: [to.position[0], to.position[1] + 0.45, to.position[2]] as [number, number, number], kind: link.kind }] : [];
  });
  return <><PageTitle index="03 / Scene composer" title="Arrange the assembly." deck="Compose saved objects into a local scene. Set positions, declare connections, then save and reopen the arrangement in this browser." />
    {!objects.length && <div className="mb-4 border border-[#dfc29c] bg-[#fff3df] p-3 text-[11px] text-[#79583c]" role="status" data-testid="status-no-scene-objects">Save an object from a validated proposal before composing a scene. <Link href="/" className="underline">Open brief studio</Link></div>}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,.8fr)_minmax(0,1.2fr)]"><section className="panel p-4 sm:p-5"><div className="flex items-center justify-between"><div><div className="eyebrow">Scene definition</div><h2 className="display mt-1 text-[23px]">{sceneId ? 'Edit saved scene' : 'New composition'}</h2></div><button className="quiet-btn text-[10px]" onClick={reset} data-testid="button-new-scene">New scene</button></div>
      <label className="mt-4 block text-[11px] font-semibold">Scene name<input className="input-field mt-1" value={sceneName} onChange={e => setSceneName(e.target.value)} maxLength={100} data-testid="input-scene-name" /></label><label className="mt-3 block text-[11px] font-semibold">Description<textarea className="input-field mt-1 min-h-[68px]" value={description} onChange={e => setDescription(e.target.value)} maxLength={800} data-testid="input-scene-description" /></label>
      <div className="mt-4 border-t border-[#deddd1] pt-3"><div className="flex items-center justify-between"><div className="eyebrow">Members · positions</div><select className="input-field !w-auto max-w-[170px] !py-2 text-[10px]" value="" onChange={e => addObject(e.target.value)} disabled={!objects.length} aria-label="Add object to scene" data-testid="select-add-scene-object"><option value="">Add object…</option>{objects.filter(o => !members.some(m => m.objectId === o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        {!members.length && <div className="mt-3 border border-dashed p-3 text-[10px] text-[#78847b]">No objects in this scene yet.</div>}
        <div className="mt-2 space-y-2">{members.map((m, i) => { const obj = objects.find(o => o.id === m.objectId); return <div key={m.objectId} className="border border-[#d8d7ca] bg-[#f7f5eb] p-3" data-testid={`row-scene-member-${m.objectId}`}><div className="flex items-center justify-between"><b className="text-[11px]">{obj?.name ?? 'Missing object'}</b><button type="button" className="text-[#9a6550]" aria-label={`Remove ${obj?.name ?? 'object'}`} onClick={() => { setMembers(prev => prev.filter(x => x.objectId !== m.objectId)); setConnections(prev => prev.filter(c => c.fromObjectId !== m.objectId && c.toObjectId !== m.objectId)); }} data-testid={`button-remove-scene-member-${m.objectId}`}><Trash2 size={13} /></button></div><div className="mt-2 grid grid-cols-4 gap-2">{(['x', 'y', 'z'] as const).map((axis, j) => <label key={axis} className="text-[8px] uppercase text-[#748279]">{axis}<input type="number" step="0.1" className="input-field !px-2 !py-1.5 mono text-[10px]" value={m.position[j]} onChange={e => setMembers(prev => prev.map((v, k) => k === i ? { ...v, position: v.position.map((n, a) => a === j ? Number(e.target.value) : n) as [number, number, number] } : v))} data-testid={`input-scene-position-${i}-${axis}`} /></label>)}<label className="text-[8px] uppercase text-[#748279]">Rotation°<input type="number" step="5" className="input-field !px-2 !py-1.5 mono text-[10px]" value={m.rotation} onChange={e => setMembers(prev => prev.map((v, k) => k === i ? { ...v, rotation: Number(e.target.value) } : v))} data-testid={`input-scene-rotation-${i}`} /></label></div></div>; })}</div>
      </div>
      <div className="mt-4 border-t border-[#deddd1] pt-3"><div className="flex items-center justify-between"><div className="eyebrow">Object connections</div><button className="quiet-btn text-[9px]" disabled={members.length < 2} onClick={() => setConnections(prev => [...prev, { fromObjectId: members[0].objectId, toObjectId: members[1].objectId, kind: 'rigid' }])} data-testid="button-add-scene-connection"><Plus size={11} className="inline" /> Add</button></div>{connections.map((c, i) => <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_85px_28px] gap-1"><select className="input-field !py-1.5 text-[9px]" value={c.fromObjectId} aria-label="Connection source" onChange={e => setConnections(prev => prev.map((x, k) => i === k ? { ...x, fromObjectId: e.target.value } : x))} data-testid={`select-scene-from-${i}`}>{members.map(m => <option key={m.objectId} value={m.objectId}>{objects.find(o => o.id === m.objectId)?.name}</option>)}</select><select className="input-field !py-1.5 text-[9px]" value={c.toObjectId} aria-label="Connection target" onChange={e => setConnections(prev => prev.map((x, k) => i === k ? { ...x, toObjectId: e.target.value } : x))} data-testid={`select-scene-to-${i}`}>{members.map(m => <option key={m.objectId} value={m.objectId}>{objects.find(o => o.id === m.objectId)?.name}</option>)}</select><select className="input-field !py-1.5 text-[9px]" value={c.kind} aria-label="Connection type" onChange={e => setConnections(prev => prev.map((x, k) => i === k ? { ...x, kind: e.target.value as StudioScene['connections'][number]['kind'] } : x))} data-testid={`select-scene-kind-${i}`}><option value="rigid">Rigid</option><option value="hinge">Hinge</option><option value="slide">Slide</option></select><button className="quiet-btn !px-1" aria-label="Remove scene connection" onClick={() => setConnections(prev => prev.filter((_, k) => k !== i))} data-testid={`button-remove-scene-connection-${i}`}>×</button></div>)}</div>
      {error && <div className="error-text mt-3" role="alert" data-testid="error-scene">{error}</div>}<button className="primary-btn mt-4 w-full text-[11px]" onClick={save} data-testid="button-save-scene">Save scene locally</button>
    </section>
    <section className="min-w-0"><div className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-[#d8d7ca] px-4 py-3"><div><div className="eyebrow">Scene viewport · live draft</div><div className="mt-1 text-[11px] text-[#6b7971]">{sceneName || 'Unsaved composition'}</div></div><span className="tag">{members.length} members · {connections.length} links</span></div><Viewport parts={sceneParts} connections={sceneLinks} className="min-h-[340px]" /><div className="flex flex-wrap gap-2 border-t border-[#d8d7ca] p-3">{connections.map((link, i) => <span className="tag !normal-case" key={`${link.fromObjectId}-${link.toObjectId}-${i}`} data-testid={`scene-link-label-${i}`}>{objects.find(o => o.id === link.fromObjectId)?.name ?? 'Missing'} → {objects.find(o => o.id === link.toObjectId)?.name ?? 'Missing'} · {link.kind}</span>)}{!connections.length && <span className="text-[9px] text-[#78847b]">No object links in this draft.</span>}</div><div className="p-4 text-[10px] leading-4 text-[#77847b]">Positions, rotations and links reflect this unsaved draft. The viewport is an inspection aid, not a mechanical simulation.</div></div>
      <div className="mt-4 panel p-4"><div className="eyebrow">Saved scenes</div>{!scenes.length && <div className="mt-3 text-[10px] text-[#78847b]" data-testid="empty-scenes">No saved scenes yet.</div>}{scenes.map(s => <div className="data-row flex items-center gap-2 py-3" key={s.id} data-testid={`row-scene-${s.id}`}><div className="min-w-0 flex-1"><b className="block truncate text-[11px]">{s.name}</b><span className="text-[9px] text-[#7b887f]">{s.members.length} objects · {new Date(s.updatedAt).toLocaleDateString()}</span></div><button className="quiet-btn text-[9px]" onClick={() => load(s)} data-testid={`button-open-scene-${s.id}`}>Open</button><button className="quiet-btn !px-2 !text-[#895d47]" aria-label={`Delete ${s.name}`} onClick={() => { if (window.confirm(`Delete scene “${s.name}”?`)) { deleteScene(s.id); if (sceneId === s.id) reset(); } }} data-testid={`button-delete-scene-${s.id}`}><Trash2 size={12} /></button></div>)}</div>
    </section></div>
  </>;
}

function VersionsPage() {
  const { objects, restoreVersion } = useStudioWorkspace(); const [objectId, setObjectId] = useState(''); const [versionId, setVersionId] = useState('');
  const object = objects.find(o => o.id === objectId); const version = object?.versions.find(v => v.id === versionId); const latest = object?.versions[object.versions.length - 1];
  const diff = version && latest ? [
    ['Name', version.snapshot.name, latest.snapshot.name], ['Description', version.snapshot.description, latest.snapshot.description],
    ['Parts', String(version.snapshot.parts.length), String(latest.snapshot.parts.length)],
    ['Connections', String(version.snapshot.connections.length), String(latest.snapshot.connections.length)],
  ] : [];
  return <><PageTitle index="04 / Version ledger" title="Every change leaves a trace." deck="Snapshots are kept with each local object. Compare a selected version with the current snapshot; restoring creates a new version rather than rewriting history." />
    {!objects.length ? <div className="panel grid min-h-[240px] place-items-center p-7 text-center" data-testid="empty-version-library"><div><History className="mx-auto text-[#58756a]" size={28} /><h2 className="display mt-3 text-[24px]">No snapshots yet.</h2><p className="mt-2 text-[11px] text-[#76837a]">Save a proposal as a local object to start its version history.</p><Link href="/" className="mt-3 inline-block text-[11px] text-[#536b62] underline">Go to brief studio</Link></div></div> :
      <><div className="panel p-4"><label className="block max-w-[460px] text-[11px] font-semibold">Choose an object<select className="input-field mt-2" value={objectId} onChange={e => { setObjectId(e.target.value); setVersionId(''); }} data-testid="select-version-object"><option value="">Select object…</option>{objects.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      {object && <><div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(180px,.7fr)_minmax(0,1.3fr)]"><div className="border border-[#d8d7ca] bg-[#f7f5eb] p-3"><div className="eyebrow">Snapshots · {object.versions.length}</div><div className="mt-2 space-y-1">{[...object.versions].reverse().map(v => <button key={v.id} className={`block w-full border px-3 py-2 text-left ${versionId === v.id ? 'border-[#e8875a] bg-[#fbe9dc]' : 'border-transparent hover:bg-[#edeee4]'}`} onClick={() => setVersionId(v.id)} data-testid={`button-select-version-${v.id}`}><span className="flex justify-between text-[11px]"><b>Version {v.number}</b><span className="mono text-[8px]">{new Date(v.createdAt).toLocaleDateString()}</span></span><span className="mt-1 block text-[9px] text-[#78847b]">{v.note}</span></button>)}</div></div>
      <div className="min-w-0">{version ? <div className="panel p-4" data-testid="version-detail"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">v{version.number} · {new Date(version.createdAt).toLocaleString()}</div><h2 className="display mt-1 text-[24px]">{version.snapshot.name}</h2><p className="mt-1 text-[10px] text-[#76837a]">{version.note}</p></div><button className="quiet-btn flex items-center gap-2 text-[10px]" disabled={version.id === latest?.id} onClick={() => { restoreVersion(object.id, version.id); setVersionId(''); }} data-testid="button-restore-version"><History size={12} /> Restore as new version</button></div><div className="mt-4"><Viewport parts={version.snapshot.parts} className="min-h-[260px]" /></div><div className="mt-4 border-t border-[#deddd1] pt-3"><div className="eyebrow">Difference · selected vs current</div><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[10px]"><thead><tr className="border-b text-[#76837a]"><th className="py-2">Field</th><th>Selected</th><th>Current v{latest?.number}</th></tr></thead><tbody>{diff.map(([field, a, b]) => <tr key={field} className="data-row"><th className="py-2">{field}</th><td className="max-w-[200px] break-words pr-3 text-[#54675e]">{a}</td><td className="max-w-[200px] break-words text-[#54675e]">{b}</td></tr>)}</tbody></table></div></div></div> : <div className="panel grid min-h-[260px] place-items-center p-5 text-[11px] text-[#78847b]">Select a snapshot to inspect and compare it.</div>}</div></div></>}</div></>}
  </>;
}

function ImportPage() {
  const [file, setFile] = useState<File | null>(null); const [error, setError] = useState('');
  const chooseFile = (next: File | undefined) => { setError(''); if (!next) return; if (!/\.glb$/i.test(next.name)) { setFile(null); return setError('Choose a binary .glb file.'); } if (next.size > 20 * 1024 * 1024) { setFile(null); return setError('File exceeds the 20 MB limit. Choose a smaller .glb.'); } setFile(next); };
  return <><PageTitle index="05 / Local inspection" title="Bring a model. Keep it here." deck="Preview a local binary GLB in the studio viewport. The file stays in this browser and is never uploaded or saved to the server." />
    <div className="mb-4 flex items-start gap-3 border border-[#b7c8bb] bg-[#eef0e5] p-4 text-[11px] leading-5 text-[#496258]" role="note" data-testid="notice-local-file"><LockKeyhole size={15} className="mt-0.5 shrink-0" /><span><b>Local-only preview.</b> Your selected file remains in this browser session. Charu does not upload it, sync it, or add it to the object library.</span></div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(230px,.55fr)_minmax(0,1.45fr)]"><section className="panel p-5"><div className="eyebrow">Choose a file</div><label className="mt-3 block cursor-pointer border border-dashed border-[#b7c8bb] bg-[#f6f5ec] p-5 text-center hover:bg-[#eff0e5]"><Download className="mx-auto text-[#59766b]" size={22} /><span className="mt-2 block text-[11px] font-semibold">{file ? file.name : 'Select a .glb file'}</span><span className="mt-1 block text-[9px] text-[#78847b]">Maximum size 20 MB</span><input type="file" accept=".glb,model/gltf-binary" className="sr-only" onChange={e => chooseFile(e.target.files?.[0])} data-testid="input-local-glb" /></label>
      {file && <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#deddd1] pt-3"><span className="mono truncate text-[9px] text-[#64736a]">{(file.size / 1024 / 1024).toFixed(2)} MB</span><button className="quiet-btn text-[9px]" onClick={() => { setFile(null); setError(''); }} data-testid="button-clear-local-glb">Clear preview</button></div>}
      {error && <div className="error-text mt-3" role="alert" data-testid="error-local-glb">{error}</div>}
      <div className="mt-4 border-t border-[#deddd1] pt-3 text-[9px] leading-4 text-[#78847b]">Only GLB binary files are accepted. Models are loaded locally through Three.js and discarded when you leave or clear this page.</div></section>
      <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-[#d8d7ca] px-4 py-3"><div><div className="eyebrow">Three.js viewport</div><div className="mt-1 text-[10px] text-[#728078]">{file?.name ?? 'Awaiting local file'}</div></div><span className="tag">BROWSER ONLY</span></div><Viewport parts={[]} importedFile={file} className="min-h-[390px] !rounded-none" /></section></div>
  </>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><StudioStoreProvider><AppShell><Switch>
    <Route path="/desk-kit"><Suspense fallback={<Skeleton rows={8} />}><DeskKitPage /></Suspense></Route>
    <Route path="/scene-agent"><Suspense fallback={<Skeleton rows={7} />}><SceneAgentPage /></Suspense></Route>
    <Route path="/" component={WorkspacePage} />
    <Route path="/objects" component={ObjectsPage} />
    <Route path="/scenes" component={ScenesPage} />
    <Route path="/versions" component={VersionsPage} />
    <Route path="/import" component={ImportPage} />
    <Route path="/plans" component={PlansPage} />
    <Route path="/plans/:id" component={PlanDetailPage} />
    <Route component={NotFound} />
  </Switch></AppShell></StudioStoreProvider></ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
