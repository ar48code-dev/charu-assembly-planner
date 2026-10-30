import { type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, Box, Check, CheckCheck,
  CircleAlert, CircleCheck, Clipboard, Download,
  FileText, GitBranch, History, Layers3, LoaderCircle, LockKeyhole, Plus,
  Ruler, ShieldAlert, SlidersHorizontal, Sparkles, Wrench,
} from 'lucide-react';
import {
  useHealthCheck, useGetAssemblyPlannerStatus, useGetAssemblyPlannerSummary,
  useListAssemblyPlans, useCreateAssemblyPlan, useGetAssemblyPlan,
  useAcceptAssemblyPlan, getHealthCheckQueryKey, getGetAssemblyPlannerStatusQueryKey,
  getGetAssemblyPlannerSummaryQueryKey, getListAssemblyPlansQueryKey,
  getGetAssemblyPlanQueryKey,
} from '@workspace/api-client-react';
import type { AssemblyPlan, AssemblyPlanInput, LockedConnection } from '@workspace/api-client-react';
import {
  Link, Route, Router as WouterRouter, Switch, useLocation, useParams,
} from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();

const seedPrompt = 'A compact tabletop camera slider with a hand-cranked carriage, stable feet, and a rail that can be assembled without tools.';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: health, isLoading: healthLoading, isError: healthError, refetch: retryHealth } =
    useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: 1 } });
  const { data: planner, isLoading: plannerLoading, isError: plannerError, refetch: retryPlanner } =
    useGetAssemblyPlannerStatus({ query: { queryKey: getGetAssemblyPlannerStatusQueryKey(), retry: 1 } });
  const healthLabel = healthLoading ? 'Checking' : healthError ? 'Unreachable' : health?.status ?? 'Unknown';
  const plannerLabel = plannerLoading ? 'Checking provider' : plannerError ? 'Status unavailable' :
    planner?.configured ? `Key configured · ${planner.provider} / ${planner.model}` : 'Provider not configured';
  return (
    <div className="charu-shell">
      <aside className="charu-rail">
        <Link href="/" className="flex items-center gap-3 text-current no-underline">
          <div className="relative grid h-10 w-10 place-items-center border border-[#759187] text-[#eff0df]">
            <span className="display text-[24px] leading-none">c</span>
            <i className="absolute -right-1 -top-1 h-2 w-2 bg-[#e8875a]" />
          </div>
          <div>
            <div className="display text-[21px] leading-none tracking-[-.04em]">charu</div>
            <div className="mono mt-1 text-[8px] uppercase tracking-[.2em] text-[#a8bcb0]">Assembly planner</div>
          </div>
        </Link>
        <div className="mt-11 eyebrow !text-[#9bb1a5]">Workbench</div>
        <nav className="rail-nav mt-3 flex flex-col gap-1">
          <Link href="/" className={`rail-link ${location === '/' ? 'active' : ''}`} data-testid="link-new-plan">
            <Plus size={15} strokeWidth={1.8} /><span>New assembly</span>
          </Link>
          <Link href="/plans" className={`rail-link ${location.startsWith('/plans') ? 'active' : ''}`} data-testid="link-plan-history">
            <History size={15} strokeWidth={1.8} /><span>Plan archive</span>
          </Link>
        </nav>
        <div className="rail-foot mt-auto border-t border-[#42615a] pt-5">
          <div className="eyebrow !text-[#9bb1a5]">Connection</div>
          <div className="mt-3 flex items-center justify-between text-[12px]">
            <span className="text-[#e2e8dc]">API health</span>
            <span className="mono flex items-center gap-2 text-[10px] text-[#cad7cc]">
              {!healthLoading && !healthError && <i className="dot" />}
              {healthLabel}
            </span>
          </div>
          {healthError && <button onClick={() => void retryHealth()} className="mt-2 text-[10px] text-[#e9a27c] underline">Retry health check</button>}
          <div className="mt-4 border-t border-[#42615a] pt-4 text-[11px] leading-relaxed text-[#a8bcb0]">
            <div className="mb-1 text-[#e2e8dc]">Proposal engine</div>
            <div>{plannerLabel}</div>
            {(plannerError || healthError) && <button onClick={() => void retryPlanner()} className="mt-2 text-[10px] text-[#e9a27c] underline">Retry status</button>}
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-[9px] tracking-[.1em] text-[#86a196]">
          <LockKeyhole size={12} /> HARD CONSTRAINTS STAY LOCKED
        </div>
      </aside>
      <main className="charu-main">
        <header className="charu-topbar">
          <div className="eyebrow">Make the idea hold together</div>
          <div className="mono hidden text-[10px] text-[#728078] sm:block">NEBIUS PROPOSAL / HUMAN ACCEPTANCE</div>
        </header>
        {plannerError && (
          <div className="mt-5 flex items-center justify-between gap-4 border border-[#d79a7e] bg-[#fff0e5] px-4 py-3 text-sm text-[#754c3a]" role="alert">
            <span className="flex items-center gap-2"><CircleAlert size={16} /> Provider status could not be loaded. Generation availability is unknown.</span>
            <button className="quiet-btn !py-1.5 text-xs" onClick={() => void retryPlanner()}>Retry</button>
          </div>
        )}
        {!plannerLoading && !plannerError && planner && !planner.configured && (
          <div className="mt-5 flex gap-3 border border-[#d9b794] bg-[#fff3df] px-4 py-3 text-sm text-[#694f39]" role="status">
            <ShieldAlert className="mt-0.5 shrink-0" size={17} />
            <div><strong className="font-semibold">Planner not configured.</strong> No proposal can be created until a provider is available. Existing saved plans remain inspectable.</div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

function PageTitle({ index, title, deck }: { index: string; title: string; deck: string }) {
  return (
    <div className="mb-8 mt-9">
      <div className="eyebrow">{index}</div>
      <h1 className="display mt-2 text-[clamp(34px,5vw,56px)] leading-[.98] text-[#203d39]">{title}</h1>
      <p className="mt-3 max-w-[650px] text-[14px] leading-6 text-[#63716a]">{deck}</p>
    </div>
  );
}

function QueryError({ label, retry }: { label: string; retry: () => unknown }) {
  return (
    <div className="panel flex items-start gap-3 p-5 text-sm text-[#805741]" role="alert">
      <CircleAlert size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1"><div className="font-semibold">{label}</div><div className="mt-1 text-xs leading-5 text-[#806e5d]">The server did not return this record. Nothing has been substituted.</div></div>
      <button className="quiet-btn text-xs" onClick={() => void retry()}>Retry</button>
    </div>
  );
}

function SkeletonBlock({ rows = 3 }: { rows?: number }) {
  return <div aria-label="Loading" className="panel animate-pulse space-y-4 p-6">{Array.from({ length: rows }, (_, i) => <div key={i} className={`h-4 bg-[#e4e4d8] ${i === 0 ? 'w-1/3' : 'w-full'}`} />)}</div>;
}

function StatStrip() {
  const { data, isLoading, isError, refetch } = useGetAssemblyPlannerSummary({
    query: { queryKey: getGetAssemblyPlannerSummaryQueryKey(), staleTime: 15000 },
  });
  if (isLoading) return <div className="mt-8 grid grid-cols-3 gap-px border border-[#d8d7ca] bg-[#d8d7ca]">{[0, 1, 2].map(n => <div key={n} className="h-[76px] animate-pulse bg-[#f7f4e9]" />)}</div>;
  if (isError) return <div className="mt-8 flex items-center justify-between border border-[#d8d7ca] px-4 py-3 text-xs text-[#69756e]">Summary could not be loaded.<button onClick={() => void refetch()} className="underline">Retry</button></div>;
  return (
    <div className="mt-8 grid grid-cols-3 gap-px border border-[#d8d7ca] bg-[#d8d7ca]" data-testid="summary-planner">
      {[
        ['Plans made', data?.totalPlans ?? 0],
        ['Validated', data?.validPlans ?? 0],
        ['Accepted', data?.acceptedPlans ?? 0],
      ].map(([label, value]) => <div key={label} className="bg-[#f8f6ed] px-4 py-4">
        <div className="eyebrow !text-[9px]">{label}</div><div className="display mt-1 text-[26px]" data-testid={`metric-${String(label).toLowerCase().replace(' ', '-')}`}>{value}</div>
      </div>)}
    </div>
  );
}

function parseList(text: string) {
  return Array.from(new Set(text.split(/[\n,]/).map(item => item.trim()).filter(Boolean)));
}

function PlannerHome() {
  const [prompt, setPrompt] = useState(seedPrompt);
  const [useCase, setUseCase] = useState<AssemblyPlanInput['useCase']>('display');
  const [partsText, setPartsText] = useState('base, rail, carriage');
  const [connections, setConnections] = useState<LockedConnection[]>([{ fromPart: 'base', toPart: 'rail' }]);
  const [maxParts, setMaxParts] = useState(5);
  const [geometryBudget, setGeometryBudget] = useState(12000);
  const [result, setResult] = useState<AssemblyPlan | null>(null);
  const [formError, setFormError] = useState('');
  const createPlan = useCreateAssemblyPlan();
  const queryClient = useQueryClient();
  const { data: planner } = useGetAssemblyPlannerStatus({ query: { queryKey: getGetAssemblyPlannerStatusQueryKey() } });
  const requiredParts = useMemo(() => parseList(partsText), [partsText]);
  const ready = prompt.trim().length >= 15 && requiredParts.length <= 5 &&
    requiredParts.length > 0 && maxParts >= 2 && maxParts <= 8 &&
    geometryBudget >= 100 && geometryBudget <= 80000 &&
    connections.every(c => c.fromPart.trim() && c.toPart.trim() &&
      requiredParts.includes(c.fromPart) && requiredParts.includes(c.toPart));

  const submit = () => {
    setFormError('');
    if (prompt.trim().length < 15) return setFormError('Describe the assembly in at least 15 characters.');
    if (!requiredParts.length || requiredParts.length > 5) return setFormError('Add between 1 and 5 required parts.');
    if (connections.some(c => !c.fromPart.trim() || !c.toPart.trim())) return setFormError('Complete or remove each locked connection.');
    if (connections.some(c => !requiredParts.includes(c.fromPart) || !requiredParts.includes(c.toPart))) return setFormError('Each locked connection must use names from the required-parts list.');
    const payload: AssemblyPlanInput = { prompt: prompt.trim(), useCase, requiredParts, requiredConnections: connections, maxParts, geometryBudget };
    createPlan.mutate({ data: payload }, {
      onSuccess: plan => {
        setResult(plan);
        void queryClient.invalidateQueries({ queryKey: getListAssemblyPlansQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetAssemblyPlannerSummaryQueryKey() });
      },
      onError: () => setFormError('The server could not create a proposal. Your input is still here; retry when ready.'),
    });
  };

  const partOptions = requiredParts.length ? requiredParts : [''];
  const appendConnection = () => setConnections(prev => [...prev, {
    fromPart: partOptions[0], toPart: partOptions[1] ?? partOptions[0],
  }]);
  return (
    <div className="enter">
      <div className="mt-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="eyebrow">01 / Specify the assembly</div>
          <h1 className="display mt-2 text-[clamp(38px,5vw,62px)] leading-[.94] text-[#203d39]">A good idea<br className="hidden sm:block" /> needs good joints.</h1>
        </div>
        <div className="max-w-[260px] border-l-2 border-[#e8875a] pl-4 text-[12px] leading-5 text-[#64726a]">State the intent. Lock the non-negotiables. Inspect what the model actually proposes.</div>
      </div>
      <StatStrip />
      <div className="mt-8 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(310px,.75fr)]">
        <section className="panel p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-[#d8d7ca] pb-4">
            <div><div className="eyebrow">Design brief</div><h2 className="display mt-1 text-[24px]">Set the boundaries</h2></div>
            <span className="mono text-[10px] text-[#829088]">INPUT / 01</span>
          </div>
          <label className="mt-5 block">
            <span className="mb-2 flex items-center justify-between text-[12px] font-semibold text-[#344e48]"><span>What are you making?</span><span className="mono text-[10px] font-normal text-[#859188]">{prompt.length} / 2000</span></span>
            <textarea className="input-field min-h-[112px] resize-y leading-6" maxLength={2000} minLength={15} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe what the assembly should do..." data-testid="input-assembly-prompt" />
          </label>
          <div className="mt-5">
            <div className="mb-2 text-[12px] font-semibold text-[#344e48]">Intended use</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['display', 'Display', 'Visual concept'],
                ['simulation', 'Simulation', 'Concept only'],
                ['game', 'Game', 'Concept only'],
              ] as const).map(([value, title, desc]) => (
                <button key={value} type="button" onClick={() => setUseCase(value)} className={`border px-3 py-3 text-left transition-colors ${useCase === value ? 'border-[#e8875a] bg-[#fbe9dc]' : 'border-[#d8d7ca] bg-[#f6f4eb] hover:bg-[#ecefe5]'}`} data-testid={`button-usecase-${value}`}>
                  <div className="text-[12px] font-semibold text-[#304b45]">{title}</div><div className="mt-1 text-[10px] text-[#77847b]">{desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 border-t border-[#d8d7ca] pt-5">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2 text-[12px] font-semibold text-[#344e48]"><LockKeyhole size={14} /> Locked parts</div><p className="mt-1 text-[10px] text-[#77847b]">These names are hard constraints, not suggestions. Up to five.</p></div>
              <span className="tag">LOCKED · {requiredParts.length}</span>
            </div>
            <input className="input-field mt-3 mono text-[12px]" value={partsText} onChange={e => setPartsText(e.target.value)} placeholder="base, support, hinge" data-testid="input-required-parts" />
          </div>
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="flex items-center gap-2 text-[12px] font-semibold text-[#344e48]"><GitBranch size={14} /> Locked connections</div><p className="mt-1 text-[10px] text-[#77847b]">Required part-to-part links; these cannot be softened away.</p></div>
              <button type="button" className="quiet-btn flex items-center gap-1.5 text-[11px]" onClick={appendConnection} data-testid="button-add-connection"><Plus size={13} /> Add link</button>
            </div>
            <div className="mt-3 space-y-2">
              {connections.map((connection, index) => (
                <div key={index} className="grid grid-cols-[1fr_22px_1fr_34px] items-center gap-2">
                  <select className="input-field !py-2 mono text-[11px]" aria-label={`Connection ${index + 1} from`} value={connection.fromPart} onChange={e => setConnections(prev => prev.map((c, i) => i === index ? { ...c, fromPart: e.target.value } : c))} data-testid={`select-connection-from-${index}`}>
                    {partOptions.map((part, i) => <option key={`${part}-${i}`} value={part}>{part || 'Add a required part'}</option>)}
                  </select><ArrowRight size={14} className="text-[#e8875a]" />
                  <select className="input-field !py-2 mono text-[11px]" aria-label={`Connection ${index + 1} to`} value={connection.toPart} onChange={e => setConnections(prev => prev.map((c, i) => i === index ? { ...c, toPart: e.target.value } : c))} data-testid={`select-connection-to-${index}`}>
                    {partOptions.map((part, i) => <option key={`${part}-${i}`} value={part}>{part || 'Add a required part'}</option>)}
                  </select>
                  <button type="button" aria-label="Remove connection" className="quiet-btn !px-2 !py-1.5 text-[#9a6550]" onClick={() => setConnections(prev => prev.filter((_, i) => i !== index))} data-testid={`button-remove-connection-${index}`}>×</button>
                </div>
              ))}
              {!connections.length && <div className="border border-dashed border-[#c7d0c8] px-3 py-3 text-[11px] text-[#7b877e]">No links locked. Add one if the design requires it.</div>}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#d8d7ca] pt-5">
            <label><span className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#344e48]"><Layers3 size={13} /> Part ceiling <LockKeyhole size={11} /></span><input type="number" className="input-field mono" min={2} max={8} value={maxParts} onChange={e => setMaxParts(Number(e.target.value))} data-testid="input-max-parts" /><span className="mt-1 block text-[9px] text-[#839087]">Allowed: 2–8 total</span></label>
            <label><span className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#344e48]"><Ruler size={13} /> Geometry budget <LockKeyhole size={11} /></span><input type="number" className="input-field mono" min={100} max={80000} step={100} value={geometryBudget} onChange={e => setGeometryBudget(Number(e.target.value))} data-testid="input-geometry-budget" /><span className="mt-1 block text-[9px] text-[#839087]">Allowed: 100–80,000 units</span></label>
          </div>
          {formError && <div className="mt-4 flex items-start gap-2 border border-[#d79a7e] bg-[#fff0e5] px-3 py-2.5 text-[12px] text-[#7d4c39]" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" />{formError}</div>}
          {createPlan.isError && !formError && <div className="mt-4 text-xs text-[#874d38]">The request failed. No plan was saved.</div>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] text-[#78857c]">A proposal is a reviewable artifact, not a safety certification.</span>
            <button className="primary-btn flex items-center gap-2" disabled={!ready || createPlan.isPending || (planner?.configured === false)} onClick={submit} data-testid="button-create-proposal">
              {createPlan.isPending ? <><LoaderCircle size={15} className="animate-spin" /> Asking planner</> : <><Sparkles size={15} /> Create proposal <ArrowDownRight size={15} /></>}
            </button>
          </div>
        </section>
        <section className="min-w-0">
          {result ? <PlanReview plan={result} onAccepted={plan => setResult(plan)} /> : <WelcomePanel />}
          <RecentActivity />
        </section>
      </div>
    </div>
  );
}

function WelcomePanel() {
  return (
    <div className="panel grid-paper min-h-[290px] overflow-hidden p-5 sm:p-7">
      <div className="flex items-center justify-between"><span className="eyebrow">Proposal canvas</span><span className="mono text-[9px] text-[#87958b]">AWAITING INPUT</span></div>
      <div className="flex min-h-[210px] flex-col items-center justify-center text-center">
        <div className="relative grid h-20 w-20 place-items-center border border-[#91a99b] text-[#57766b]">
          <Box size={31} strokeWidth={1} />
          <span className="absolute -right-2 -top-2 h-4 w-4 border border-[#e8875a] bg-[#f7f5eb]" />
          <span className="absolute -bottom-2 -left-2 h-3 w-3 bg-[#d9e29b]" />
        </div>
        <div className="display mt-5 text-[25px] text-[#304b45]">Nothing assembled yet.</div>
        <p className="mt-2 max-w-[280px] text-[12px] leading-5 text-[#75837a]">The live proposal will appear here exactly as returned, with every constraint and validation check in view.</p>
      </div>
    </div>
  );
}

function RecentActivity() {
  const { data: summary, isLoading, isError, refetch } = useGetAssemblyPlannerSummary({
    query: { queryKey: getGetAssemblyPlannerSummaryQueryKey(), staleTime: 15000 },
  });
  return (
    <div className="mt-5 panel p-5">
      <div className="flex items-center justify-between">
        <div><div className="eyebrow">Recent work</div><h3 className="display mt-1 text-[20px]">From the archive</h3></div>
        <Link href="/plans" className="flex items-center gap-1 text-[11px] text-[#536b62] no-underline hover:text-[#b8603d]">All plans <ArrowRight size={13} /></Link>
      </div>
      {isLoading && <div className="mt-4 space-y-2">{[1, 2].map(n => <div key={n} className="h-9 animate-pulse bg-[#eeede3]" />)}</div>}
      {isError && <div className="mt-4 flex justify-between text-[11px] text-[#7b6b5d]">Recent plans unavailable.<button onClick={() => void refetch()} className="underline">Retry</button></div>}
      {!isLoading && !isError && summary?.recentPlans.length === 0 && <div className="mt-4 border-t border-[#deddd1] py-4 text-[11px] text-[#77847b]">No saved proposals yet. Your first one will live here.</div>}
      {!isLoading && !isError && summary?.recentPlans.slice(0, 3).map(plan => (
        <Link href={`/plans/${encodeURIComponent(plan.id)}`} key={plan.id} className="mt-2 flex items-center justify-between gap-3 border-t border-[#deddd1] py-3 text-current no-underline hover:bg-[#f0efe5]" data-testid={`link-recent-plan-${plan.id}`}>
          <div className="min-w-0"><div className="truncate text-[12px] font-semibold text-[#304b45]">{plan.candidate?.title ?? plan.prompt}</div><div className="mono mt-1 text-[9px] text-[#849188]">{new Date(plan.createdAt).toLocaleString()} · {plan.repairAttempts} repair{plan.repairAttempts === 1 ? '' : 's'}</div></div>
          <StatusPill status={plan.status} />
        </Link>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const accepted = status === 'accepted';
  const valid = status === 'valid';
  return <span className={`tag shrink-0 !py-1 ${accepted ? '!border-[#c4d1a0] !bg-[#eef2d8] !text-[#4c6347]' : valid ? '!border-[#bdd2c2] !bg-[#e9f0e7] !text-[#456955]' : '!border-[#dfb6a1] !bg-[#f8e9df] !text-[#895d47]'}`}><i className={`dot ${!valid && !accepted ? '!bg-[#dc8c68]' : ''}`} />{status}</span>;
}

function ConstraintRail({ plan }: { plan: AssemblyPlan }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="border border-[#ccd5c9] bg-[#eef0e5] p-3">
        <div className="eyebrow flex items-center gap-1.5 !text-[#68796d]"><LockKeyhole size={11} /> Parts · locked</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{plan.requiredParts.map((part, index) => <span key={`${part}-${index}`} className="tag !bg-[#f6f5ec]">{part}</span>)}</div>
        {!plan.requiredParts.length && <div className="mt-2 text-[10px] text-[#829087]">No required parts recorded.</div>}
      </div>
      <div className="border border-[#ccd5c9] bg-[#eef0e5] p-3">
        <div className="eyebrow flex items-center gap-1.5 !text-[#68796d]"><GitBranch size={11} /> Connections · locked</div>
        <div className="mt-2 space-y-1.5">{plan.requiredConnections.map((connection, index) => <div className="mono flex items-center gap-2 text-[10px] text-[#45615a]" key={`${connection.fromPart}-${connection.toPart}-${index}`}><LockKeyhole size={10} />{connection.fromPart}<ArrowRight size={11} className="text-[#e8875a]" />{connection.toPart}</div>)}</div>
        {!plan.requiredConnections.length && <div className="mt-2 text-[10px] text-[#829087]">No required connections recorded.</div>}
      </div>
      <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 border border-[#ccd5c9] px-3 py-2.5">
        <div className="mono flex items-center gap-2 text-[10px] text-[#50655d]"><LockKeyhole size={11} /><span>MAX PARTS <b className="text-[#213f39]">{plan.maxParts}</b></span></div>
        <div className="mono flex items-center gap-2 text-[10px] text-[#50655d]"><LockKeyhole size={11} /><span>GEOMETRY BUDGET <b className="text-[#213f39]">{plan.geometryBudget.toLocaleString()}</b></span></div>
      </div>
    </div>
  );
}

function SpatialView({ plan }: { plan: AssemblyPlan }) {
  const [selected, setSelected] = useState<string | null>(null);
  const candidate = plan.candidate;
  if (!candidate) return (
    <div className="grid-paper grid min-h-[240px] place-items-center border border-dashed border-[#bbc9bd] p-6 text-center">
      <div><CircleAlert className="mx-auto text-[#b36c4e]" size={25} /><div className="display mt-3 text-[20px]">No candidate returned</div><p className="mt-1 max-w-[300px] text-[11px] leading-5 text-[#75837a]">The saved response has no assembly geometry. Validation is shown separately; no diagram has been invented.</p></div>
    </div>
  );
  const count = candidate.parts.length;
  const coords = candidate.parts.map((_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(count, 1);
    return { x: 220 + Math.cos(angle) * (count > 2 ? 105 : 80), y: 134 + Math.sin(angle) * (count > 2 ? 76 : 42) };
  });
  const idForName = (name: string) => candidate.parts.find(p => p.id === name || p.name === name)?.id;
  return (
    <div className="grid-paper overflow-hidden border border-[#cbd3c8]">
      <div className="flex items-center justify-between border-b border-[#cbd3c8] bg-[#f4f2e9]/80 px-4 py-2.5">
        <div className="eyebrow flex items-center gap-2"><Activity size={12} /> Spatial assembly</div>
        <div className="mono text-[9px] text-[#75847a]">{count} PART{count === 1 ? '' : 'S'} / {candidate.connections.length} JOINT{candidate.connections.length === 1 ? '' : 'S'}</div>
      </div>
      {count === 0 ? <div className="grid h-[230px] place-items-center text-xs text-[#79867d]">Candidate contains no parts to render.</div> : (
        <svg viewBox="0 0 440 270" role="img" aria-label={`Spatial assembly diagram for ${candidate.title}`} className="block h-auto w-full">
          <defs><marker id="arrow-charu" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#e8875a" /></marker></defs>
          <ellipse cx="220" cy="228" rx="146" ry="20" fill="rgba(32,61,57,.08)" />
          {candidate.connections.map((joint, index) => {
            const from = coords[candidate.parts.findIndex(p => p.id === idForName(joint.fromPart))];
            const to = coords[candidate.parts.findIndex(p => p.id === idForName(joint.toPart))];
            return from && to ? <g key={`${joint.fromPart}-${joint.toPart}-${index}`}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#e8875a" strokeWidth="2" strokeDasharray={joint.kind === 'rigid' ? undefined : '5 4'} markerEnd="url(#arrow-charu)" opacity=".82" />
              <rect x={(from.x + to.x) / 2 - 21} y={(from.y + to.y) / 2 - 12} width="42" height="16" fill="#f7f5eb" stroke="#d5d4c7" />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 1} textAnchor="middle" fill="#815d49" fontFamily="DM Mono" fontSize="8">{joint.kind}</text>
            </g> : null;
          })}
          {candidate.parts.map((part, index) => {
            const { x, y } = coords[index];
            const active = selected === part.id;
            const color = /^#[0-9a-f]{3,8}$/i.test(part.color) ? part.color : '#79958a';
            return <g key={part.id} onClick={() => setSelected(active ? null : part.id)} role="button" tabIndex={0} aria-label={`Inspect ${part.name}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(active ? null : part.id); }} className="cursor-pointer">
              <ellipse cx={x} cy={y + 16} rx="29" ry="7" fill="rgba(32,61,57,.14)" />
              {part.shape === 'cylinder' ? <g>
                <path d={`M${x - 22} ${y - 10} L${x - 22} ${y + 10} Q${x} ${y + 21} ${x + 22} ${y + 10} L${x + 22} ${y - 10}`} fill={color} stroke={active ? '#e8875a' : '#34564e'} strokeWidth={active ? 3 : 1.5} />
                <ellipse cx={x} cy={y - 10} rx="22" ry="8" fill={color} stroke={active ? '#e8875a' : '#34564e'} strokeWidth={active ? 3 : 1.5} />
              </g> : <g>
                <path d={`M${x - 23} ${y - 13} l14 -9 32 0 -14 9 z`} fill={color} stroke={active ? '#e8875a' : '#34564e'} strokeWidth={active ? 2.6 : 1.2} />
                <path d={`M${x - 23} ${y - 13} v25 l32 0 v-25 z`} fill={color} stroke={active ? '#e8875a' : '#34564e'} strokeWidth={active ? 2.6 : 1.2} />
                <path d={`M${x + 9} ${y - 13} l14 -9 v25 l-14 12 z`} fill={color} stroke={active ? '#e8875a' : '#34564e'} strokeWidth={active ? 2.6 : 1.2} />
              </g>}
              <text x={x} y={y + 39} textAnchor="middle" fill="#294740" fontFamily="DM Mono" fontSize="9">{part.name.slice(0, 19)}</text>
            </g>;
          })}
          <text x="18" y="24" fill="#88968a" fontFamily="DM Mono" fontSize="8">SELECT A COMPONENT TO INSPECT</text>
        </svg>
      )}
      {selected && candidate.parts.filter(part => part.id === selected).map(part => <div key={part.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#cbd3c8] bg-[#faf8f0] px-4 py-3">
        <div><div className="text-[12px] font-semibold text-[#294740]">{part.name}</div><div className="mono mt-1 text-[9px] text-[#748279]">{part.id} · {part.shape} · {part.dimensions.x} × {part.dimensions.y} × {part.dimensions.z}</div></div>
        <span className="flex items-center gap-2 text-[10px] text-[#738078]"><i className="h-3 w-3 border border-[#59756a]" style={{ backgroundColor: /^#[0-9a-f]{3,8}$/i.test(part.color) ? part.color : '#79958a' }} />{part.color}</span>
      </div>)}
    </div>
  );
}

function PlanReview({ plan, onAccepted }: { plan: AssemblyPlan; onAccepted?: (plan: AssemblyPlan) => void }) {
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [exportError, setExportError] = useState('');
  const acceptPlan = useAcceptAssemblyPlan();
  const queryClient = useQueryClient();
  const canAccept = plan.validation.valid && plan.status !== 'accepted' && plan.candidate !== null;
  const isAccepted = plan.status === 'accepted' || Boolean(plan.acceptedAt);
  const saveManifest = async () => {
    setExportError('');
    try {
      const canonical = canonicalJson(plan);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const manifest = {
        schema: 'charu-assembly-evidence/1',
        provider: 'Nebius Token Factory',
        integrity: {
          algorithm: 'SHA-256',
          scope: 'canonicalized plan object',
          canonicalPlanHash: hash,
        },
        plan,
      };
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `charu-evidence-${plan.id}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError('Evidence export failed because this browser cannot compute a secure content hash.');
    }
  };
  const accept = () => {
    setAcceptError('');
    acceptPlan.mutate({ id: plan.id }, {
      onSuccess: saved => {
        onAccepted?.(saved);
        setConfirmAccept(false);
        void queryClient.invalidateQueries({ queryKey: getGetAssemblyPlanQueryKey(plan.id) });
        void queryClient.invalidateQueries({ queryKey: getListAssemblyPlansQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetAssemblyPlannerSummaryQueryKey() });
      },
      onError: () => setAcceptError('Acceptance was not confirmed by the server. The plan remains unchanged here.'),
    });
  };
  return (
    <div className="panel overflow-hidden" data-testid={`review-plan-${plan.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d8d7ca] p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><div className="eyebrow">Planner response</div><StatusPill status={plan.status} /></div>
          <h2 className="display mt-2 break-words text-[26px] leading-tight text-[#294740]" data-testid="text-candidate-title">{plan.candidate?.title ?? 'Proposal without a candidate'}</h2>
          <p className="mt-2 text-[12px] leading-5 text-[#6b7971]">{plan.candidate?.summary ?? 'The saved response did not include candidate content.'}</p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <button className="quiet-btn flex items-center gap-2 text-[10px]" onClick={() => void saveManifest()} data-testid="button-export-manifest"><Download size={13} /> Export evidence</button>
          <span className="mono text-[8px] text-[#879187]">SHA-256 · saved response</span>
          {exportError && <span role="alert" className="max-w-[220px] text-[10px] text-[#9a584b]">{exportError}</span>}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <ConstraintRail plan={plan} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetaCell label="Use case" value={plan.useCase} />
          <MetaCell label="Model" value={plan.model || 'Not reported'} />
          <MetaCell label="Repair attempts" value={String(plan.repairAttempts)} />
          <MetaCell label="Created" value={new Date(plan.createdAt).toLocaleString()} />
        </div>
        <div className="mt-5">
          <SpatialView plan={plan} />
        </div>
        <div className="mt-5 border-t border-[#deddd1] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><div className="eyebrow">Validation evidence</div><span className={`tag !py-1 ${plan.validation.valid ? '!border-[#bdd2c2] !bg-[#e9f0e7] !text-[#456955]' : '!border-[#dfb6a1] !bg-[#f8e9df] !text-[#895d47]'}`}>{plan.validation.valid ? 'Checks passed' : 'Invalid'}</span></div>
            <span className="mono text-[9px] text-[#7c8980]">{plan.validation.checks.filter(c => c.passed).length}/{plan.validation.checks.length} PASS</span>
          </div>
          <div className="mt-3 space-y-2">
            {plan.validation.checks.length ? plan.validation.checks.map((check, index) => <div key={`${check.name}-${index}`} className="flex items-start gap-2.5 border-b border-[#e6e4d9] pb-2 last:border-0">
              {check.passed ? <CircleCheck size={15} className="mt-0.5 shrink-0 text-[#61856c]" /> : <CircleAlert size={15} className="mt-0.5 shrink-0 text-[#b9684c]" />}
              <div><div className="text-[11px] font-semibold text-[#3b554d]">{check.name}</div><div className="mt-0.5 text-[10px] leading-4 text-[#78847b]">{check.detail}</div></div>
            </div>) : <div className="text-[11px] text-[#7b887f]">No checks were included in the response.</div>}
          </div>
        </div>
        {plan.validation.warnings.length > 0 && <div className="mt-4 border border-[#dfc29c] bg-[#fff3df] p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#79583c]"><ShieldAlert size={14} /> Warnings from the planner</div>
          <ul className="mt-2 space-y-1.5 pl-4 text-[10px] leading-4 text-[#806849]">{plan.validation.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
        </div>}
        {plan.candidate && <div className="mt-5 grid grid-cols-1 gap-5 border-t border-[#deddd1] pt-4 sm:grid-cols-2">
          <div><div className="eyebrow flex items-center gap-2"><Wrench size={12} /> Build sequence</div>
            {plan.candidate.steps.length ? <ol className="mt-3 space-y-2">{plan.candidate.steps.map((step, index) => <li key={`${step}-${index}`} className="flex gap-3 text-[11px] leading-5 text-[#52665d]"><span className="mono mt-0.5 text-[9px] text-[#db8159]">{String(index + 1).padStart(2, '0')}</span><span>{step}</span></li>)}</ol> : <div className="mt-3 text-[10px] text-[#839087]">No assembly steps returned.</div>}
          </div>
          <div><div className="eyebrow flex items-center gap-2"><FileText size={12} /> Design notes</div>
            {plan.candidate.designNotes.length ? <ul className="mt-3 space-y-2">{plan.candidate.designNotes.map((note, index) => <li key={`${note}-${index}`} className="border-l border-[#ced4c4] pl-3 text-[11px] leading-5 text-[#63736a]">{note}</li>)}</ul> : <div className="mt-3 text-[10px] text-[#839087]">No design notes returned.</div>}
          </div>
        </div>}
        <div className="mt-5 border-t border-[#deddd1] pt-4">
          <p className="text-[10px] leading-4 text-[#8a6c56]">Validation checks are not proof of mechanical safety. Inspect and independently assess the design before use.</p>
          {isAccepted && <div className="mt-3 flex items-center gap-2 bg-[#edf1df] px-3 py-2 text-[11px] text-[#4e684e]" data-testid="status-accepted"><CheckCheck size={15} /> Explicitly accepted{plan.acceptedAt ? ` ${new Date(plan.acceptedAt).toLocaleString()}` : ' (timestamp not reported)'}</div>}
          {!isAccepted && !confirmAccept && <button className="primary-btn mt-4 flex w-full items-center justify-center gap-2" disabled={!canAccept} onClick={() => setConfirmAccept(true)} data-testid="button-accept-plan">
            {plan.validation.valid ? <><Check size={15} /> Review and accept proposal</> : <><ShieldAlert size={15} /> Invalid proposal cannot be accepted</>}
          </button>}
          {!isAccepted && confirmAccept && <div className="mt-4 border border-[#d8ad90] bg-[#fff1e5] p-3">
            <div className="text-[12px] font-semibold text-[#684c3a]">Accept this exact proposal?</div>
            <p className="mt-1 text-[10px] leading-4 text-[#79634f]">This records your explicit acceptance of the server-saved response. It does not certify mechanical safety.</p>
            {acceptError && <div className="mt-2 text-[10px] text-[#9b5339]" role="alert">{acceptError}</div>}
            <div className="mt-3 flex gap-2">
              <button className="quiet-btn flex-1 text-[11px]" onClick={() => setConfirmAccept(false)} disabled={acceptPlan.isPending} data-testid="button-cancel-accept">Go back</button>
              <button className="primary-btn flex-1 text-[11px]" onClick={accept} disabled={acceptPlan.isPending || !canAccept} data-testid="button-confirm-accept">{acceptPlan.isPending ? 'Recording…' : 'Confirm acceptance'}</button>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 border border-[#e0dfd3] bg-[#f6f4eb] p-2.5"><div className="eyebrow !text-[8px]">{label}</div><div className="mono mt-1 truncate text-[10px] text-[#415c52]" title={value}>{value}</div></div>;
}

function PlansPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const { data: plans, isLoading, isError, refetch } = useListAssemblyPlans({
    query: { queryKey: getListAssemblyPlansQueryKey(), staleTime: 10000, refetchOnMount: 'always' },
  });
  const filtered = useMemo(() => (plans ?? []).filter(plan => {
    const matchStatus = filter === 'all' || plan.status === filter;
    const phrase = `${plan.candidate?.title ?? ''} ${plan.prompt} ${plan.model} ${plan.id}`.toLowerCase();
    return matchStatus && phrase.includes(search.toLowerCase());
  }), [plans, filter, search]);
  return (
    <>
      <PageTitle index="02 / Archive" title="Plans with a paper trail." deck="Every saved response is a record of what the provider proposed, what the checks found, and whether a person accepted it." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[220px] flex-1">
          <SlidersHorizontal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#77847b]" />
          <input className="input-field !pl-9 text-[12px]" placeholder="Search plans, prompts, model…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-plans" />
        </div>
        <div className="flex items-center gap-2"><span className="eyebrow hidden sm:block">Show</span><select className="input-field !w-auto min-w-[120px] text-[11px]" value={filter} onChange={e => setFilter(e.target.value)} data-testid="select-plan-status">
          <option value="all">All statuses</option><option value="valid">Valid</option><option value="invalid">Invalid</option><option value="accepted">Accepted</option>
        </select></div>
      </div>
      {isLoading && <SkeletonBlock rows={5} />}
      {isError && <QueryError label="Saved plans could not be loaded." retry={refetch} />}
      {!isLoading && !isError && plans?.length === 0 && <div className="panel grid min-h-[300px] place-items-center p-8 text-center">
        <div><div className="mx-auto grid h-14 w-14 place-items-center border border-[#b7c8bb] text-[#58756a]"><History size={23} /></div><h2 className="display mt-4 text-[26px]">Archive is quiet.</h2><p className="mx-auto mt-2 max-w-[340px] text-[12px] leading-5 text-[#76837a]">No saved assembly plans yet. Create a proposal to start building a traceable record.</p><Link href="/" className="primary-btn mt-5 inline-flex items-center gap-2 text-[12px] no-underline"><Plus size={14} /> Start an assembly</Link></div>
      </div>}
      {!isLoading && !isError && plans && plans.length > 0 && filtered.length === 0 && <div className="panel p-8 text-center"><div className="display text-[24px]">Nothing matches that cut.</div><p className="mt-2 text-[12px] text-[#78847c]">Try a different phrase or status filter.</p><button className="quiet-btn mt-4 text-xs" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button></div>}
      {!isLoading && !isError && filtered.length > 0 && <div className="space-y-3">
        {filtered.map((plan, index) => <PlanListItem plan={plan} key={plan.id} index={index} />)}
      </div>}
      {!isLoading && !isError && plans && <div className="mono mt-4 text-[9px] text-[#869188]">{filtered.length} SHOWN / {plans.length} SAVED · ORDER AS RETURNED</div>}
    </>
  );
}

function PlanListItem({ plan, index }: { plan: AssemblyPlan; index: number }) {
  return (
    <Link href={`/plans/${encodeURIComponent(plan.id)}`} className="panel group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-4 text-current no-underline transition-colors hover:bg-[#f9f7ee]" style={{ animationDelay: `${index * 35}ms` }} data-testid={`card-plan-${plan.id}`}>
      <div className="hidden h-12 w-12 place-items-center border border-[#cbd5c9] bg-[#eff0e5] text-[#557166] sm:grid"><Box size={20} strokeWidth={1.5} /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="truncate text-[13px] font-semibold text-[#304b45]">{plan.candidate?.title ?? plan.prompt}</span><StatusPill status={plan.status} /></div>
        <div className="mt-1 line-clamp-1 text-[10px] text-[#7a867e]">{plan.candidate?.summary ?? 'No candidate summary was returned.'}</div>
        <div className="mono mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-[#87948a]"><span>{new Date(plan.createdAt).toLocaleString()}</span><span>{plan.useCase}</span><span>{plan.candidate?.parts.length ?? 0} parts</span><span>{plan.repairAttempts} repairs</span><span>{plan.model || 'model unreported'}</span></div>
      </div>
      <ArrowRight size={17} className="text-[#a8b0a5] transition-transform group-hover:translate-x-1 group-hover:text-[#e8875a]" />
    </Link>
  );
}

function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const { data: plan, isLoading, isError, refetch } = useGetAssemblyPlan(id, {
    query: { enabled: !!id, queryKey: getGetAssemblyPlanQueryKey(id), refetchOnMount: 'always' },
  });
  return (
    <>
      <div className="mt-8"><Link href="/plans" className="inline-flex items-center gap-2 text-[11px] text-[#617269] no-underline hover:text-[#b8603d]"><ArrowLeft size={14} /> Back to archive</Link></div>
      <PageTitle index="03 / Saved record" title={isLoading ? 'Retrieving the record…' : 'Read the proposal closely.'} deck="This page reloads the persisted server response. Constraints, checks, warnings, and acceptance state are shown as recorded." />
      {isLoading && <SkeletonBlock rows={6} />}
      {isError && <QueryError label="This saved plan could not be loaded." retry={refetch} />}
      {!isLoading && !isError && !plan && <div className="panel p-6 text-sm text-[#68766e]">No plan data was returned for this identifier.</div>}
      {!isLoading && !isError && plan && <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-[#d8d7ca] bg-[#eeece1] px-4 py-3">
          <div className="min-w-0"><div className="eyebrow">Plan identifier</div><div className="mono mt-1 truncate text-[11px] text-[#4d6459]">{plan.id}</div></div>
          <button className="quiet-btn flex items-center gap-2 text-[10px]" onClick={() => navigator.clipboard?.writeText(plan.id)} data-testid="button-copy-plan-id"><Clipboard size={12} /> Copy ID</button>
        </div>
        <PlanReview plan={plan} />
      </>}
    </>
  );
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><AppShell>
    <Switch>
      <Route path="/" component={PlannerHome} />
      <Route path="/plans" component={PlansPage} />
      <Route path="/plans/:id" component={PlanDetailPage} />
      <Route component={NotFound} />
    </Switch>
  </AppShell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>;
}

export default App;
