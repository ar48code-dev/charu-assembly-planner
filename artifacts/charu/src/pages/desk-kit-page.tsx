import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Link } from 'wouter';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  Download,
  HardDrive,
  LoaderCircle,
  Save,
  ShieldAlert,
  Trash2,
  Ruler,
  Cable,
  Boxes,
  Printer,
  FileArchive,
} from 'lucide-react';
import { DeskKitPreview } from '@/components/desk-kit-preview';
import {
  DEFAULT_DESK_KIT_PARAMETERS,
  DEFAULT_PRINTER_BUILD_VOLUME,
  defaultDeskKitFitPassport,
  getDeskKitMetrics,
  downloadDeskKitPrintPack,
  downloadDeskKitGlb,
  downloadDeskKitJson,
} from '@/lib/desk-kit-model';
import type { DeskKitCheck, DeskKitParameters, DeskKitFitPassport, PrinterBuildVolume } from '@/lib/desk-kit-model';
import { getPrinterBuildPlan } from '@/lib/printer-compiler';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const deskKitSchema = z.object({
  deskThicknessMm: z.number().min(12, 'Use 12–45 mm.').max(45, 'Use 12–45 mm.'),
  railLengthMm: z.number().min(200, 'Use 200–600 mm.').max(600, 'Use 200–600 mm.'),
  trayDepthMm: z.number().min(80, 'Use 80–180 mm.').max(180, 'Use 80–180 mm.'),
  cableCount: z.number().int('Use a whole number of cables.').min(1, 'Use 1–8 cables.').max(8, 'Use 1–8 cables.'),
  cableDiameterMm: z.number().min(3, 'Use 3–12 mm.').max(12, 'Use 3–12 mm.'),
  thicknessAtClampOneMm: z.number().min(12, 'Use 12–45 mm.').max(45, 'Use 12–45 mm.'),
  thicknessAtClampTwoMm: z.number().min(12, 'Use 12–45 mm.').max(45, 'Use 12–45 mm.'),
  measurementUncertaintyMm: z.number().min(0, 'Use 0–3 mm.').max(3, 'Use 0–3 mm.'),
  clearancePerSideMm: z.number().min(.2, 'Use 0.2–3 mm.').max(3, 'Use 0.2–3 mm.'),
  printerXMm: z.number().min(80, 'Use 80–500 mm.').max(500, 'Use 80–500 mm.'),
  printerYMm: z.number().min(80, 'Use 80–500 mm.').max(500, 'Use 80–500 mm.'),
  printerZMm: z.number().min(80, 'Use 80–500 mm.').max(500, 'Use 80–500 mm.'),
}).superRefine((parameters, context) => {
  const clearance = (parameters.trayDepthMm - 12) / parameters.cableCount - parameters.cableDiameterMm;
  if (Number.isFinite(clearance) && clearance < 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cableDiameterMm'],
      message: `This cable layout leaves ${clearance.toFixed(1)} mm clearance; at least 3 mm is required.`,
    });
  }
  if (parameters.measurementUncertaintyMm > parameters.clearancePerSideMm) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['measurementUncertaintyMm'], message: 'Uncertainty must not exceed clearance per side.' });
  }
});

type DeskKitFormValues = z.infer<typeof deskKitSchema>;
type Preset = { id: string; name: string; parameters: DeskKitParameters; fitPassport?: DeskKitFitPassport; printerVolume?: PrinterBuildVolume };
type Feedback = { kind: 'success' | 'error'; message: string } | null;

const PRESET_STORAGE_KEY = 'charu.desk-kit.presets.v1';

const parameterFields: {
  name: keyof DeskKitFormValues;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  description: string;
  icon: typeof Ruler;
}[] = [
  { name: 'deskThicknessMm', label: 'Desk thickness', unit: 'mm', min: 12, max: 45, step: 0.5, description: 'Measure the desk edge where the clamp will sit.', icon: Ruler },
  { name: 'railLengthMm', label: 'Rail length', unit: 'mm', min: 200, max: 600, step: 1, description: 'Length of the organizer along the desk edge.', icon: Ruler },
  { name: 'trayDepthMm', label: 'Tray depth', unit: 'mm', min: 80, max: 180, step: 1, description: 'Available depth beneath the desk.', icon: Boxes },
  { name: 'cableCount', label: 'Cable count', unit: 'cables', min: 1, max: 8, step: 1, description: 'One cable channel per cable.', icon: Cable },
  { name: 'cableDiameterMm', label: 'Cable diameter', unit: 'mm', min: 3, max: 12, step: 0.5, description: 'Use the widest cable in the bundle.', icon: Cable },
];

function parsePresets(raw: string | null): Preset[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Saved presets have an unexpected format.');
  return parsed.filter((item): item is Preset => {
    if (!item || typeof item !== 'object') return false;
    const preset = item as Partial<Preset>;
    if (typeof preset.id !== 'string' || typeof preset.name !== 'string' || !preset.parameters) return false;
    return deskKitSchema.safeParse({
      ...DEFAULT_DESK_KIT_PARAMETERS,
      ...preset.parameters,
      ...(preset.fitPassport ?? defaultDeskKitFitPassport(preset.parameters)),
      printerXMm: preset.printerVolume?.xMm ?? DEFAULT_PRINTER_BUILD_VOLUME.xMm,
      printerYMm: preset.printerVolume?.yMm ?? DEFAULT_PRINTER_BUILD_VOLUME.yMm,
      printerZMm: preset.printerVolume?.zMm ?? DEFAULT_PRINTER_BUILD_VOLUME.zMm,
    }).success;
  });
}

function CheckRow({ check, index }: { check: DeskKitCheck; index: number }) {
  const Icon = check.passed ? CheckCircle2 : CircleAlert;
  return (
    <div className="flex items-start gap-3 border-b border-[#e4e2d7] py-3 last:border-b-0" data-testid={`row-fit-check-${check.id}`}>
      <Icon size={16} className={`mt-0.5 shrink-0 ${check.passed ? 'text-[#66816a]' : 'text-[#b96345]'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-[#344e48]" data-testid={`text-fit-check-label-${check.id}`}>{check.label}</span>
          <span className={`mono text-[9px] uppercase tracking-[.12em] ${check.passed ? 'text-[#66816a]' : 'text-[#a85c43]'}`} data-testid={`status-fit-check-${check.id}`}>{check.passed ? 'Pass' : 'Review'}</span>
        </div>
        <p className="mt-1 text-[10px] leading-4 text-[#758178]" data-testid={`text-fit-check-detail-${check.id}`}>{check.detail}</p>
      </div>
      <span className="mono pt-0.5 text-[9px] text-[#a0a79b]" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    </div>
  );
}

export default function DeskKitPage() {
  const form = useForm<DeskKitFormValues>({
    resolver: zodResolver(deskKitSchema),
    mode: 'onChange',
    defaultValues: {
      ...DEFAULT_DESK_KIT_PARAMETERS,
      ...defaultDeskKitFitPassport(DEFAULT_DESK_KIT_PARAMETERS),
      printerXMm: DEFAULT_PRINTER_BUILD_VOLUME.xMm,
      printerYMm: DEFAULT_PRINTER_BUILD_VOLUME.yMm,
      printerZMm: DEFAULT_PRINTER_BUILD_VOLUME.zMm,
    },
  });
  const watched = useWatch({ control: form.control });
  const parameters = useMemo<DeskKitParameters>(() => ({
    deskThicknessMm: watched.deskThicknessMm ?? DEFAULT_DESK_KIT_PARAMETERS.deskThicknessMm,
    railLengthMm: watched.railLengthMm ?? DEFAULT_DESK_KIT_PARAMETERS.railLengthMm,
    trayDepthMm: watched.trayDepthMm ?? DEFAULT_DESK_KIT_PARAMETERS.trayDepthMm,
    cableCount: watched.cableCount ?? DEFAULT_DESK_KIT_PARAMETERS.cableCount,
    cableDiameterMm: watched.cableDiameterMm ?? DEFAULT_DESK_KIT_PARAMETERS.cableDiameterMm,
  }), [
    watched.deskThicknessMm,
    watched.railLengthMm,
    watched.trayDepthMm,
    watched.cableCount,
    watched.cableDiameterMm,
  ]);
  const fitPassport = useMemo<DeskKitFitPassport>(() => ({
    thicknessAtClampOneMm: watched.thicknessAtClampOneMm ?? parameters.deskThicknessMm,
    thicknessAtClampTwoMm: watched.thicknessAtClampTwoMm ?? parameters.deskThicknessMm,
    measurementUncertaintyMm: watched.measurementUncertaintyMm ?? .2,
    clearancePerSideMm: watched.clearancePerSideMm ?? .8,
  }), [watched.thicknessAtClampOneMm, watched.thicknessAtClampTwoMm, watched.measurementUncertaintyMm, watched.clearancePerSideMm, parameters.deskThicknessMm]);
  const printerVolume = useMemo<PrinterBuildVolume>(() => ({
    xMm: watched.printerXMm ?? DEFAULT_PRINTER_BUILD_VOLUME.xMm,
    yMm: watched.printerYMm ?? DEFAULT_PRINTER_BUILD_VOLUME.yMm,
    zMm: watched.printerZMm ?? DEFAULT_PRINTER_BUILD_VOLUME.zMm,
  }), [watched.printerXMm, watched.printerYMm, watched.printerZMm]);
  const metrics = useMemo(() => getDeskKitMetrics(parameters, fitPassport), [
    parameters.deskThicknessMm,
    parameters.railLengthMm,
    parameters.trayDepthMm,
    parameters.cableCount,
    parameters.cableDiameterMm,
    fitPassport,
  ]);
  const printerPlan = useMemo(() => getPrinterBuildPlan(parameters, fitPassport, printerVolume), [parameters, fitPassport, printerVolume]);
  const isValid = deskKitSchema.safeParse({ ...parameters, ...fitPassport, printerXMm: printerVolume.xMm, printerYMm: printerVolume.yMm, printerZMm: printerVolume.zMm }).success && metrics.ready;
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [storageFeedback, setStorageFeedback] = useState<Feedback>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exportPending, setExportPending] = useState<'glb' | 'json' | 'print' | null>(null);
  const [exportFeedback, setExportFeedback] = useState<Feedback>(null);

  useEffect(() => {
    try {
      const saved = parsePresets(window.localStorage.getItem(PRESET_STORAGE_KEY));
      setPresets(saved);
      setStorageReady(true);
    } catch {
      setStorageFeedback({ kind: 'error', message: 'Browser storage is unavailable or its saved presets could not be read. Your current dimensions are still usable.' });
      setStorageReady(false);
    }
  }, []);

  const persistPresets = (next: Preset[], successMessage: string) => {
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
      setPresets(next);
      setStorageFeedback({ kind: 'success', message: successMessage });
      return true;
    } catch {
      setStorageFeedback({ kind: 'error', message: 'Could not write to this browser’s storage. Nothing was saved.' });
      return false;
    }
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) {
      setStorageFeedback({ kind: 'error', message: 'Enter a name for this preset first.' });
      return;
    }
    if (!isValid) {
      setStorageFeedback({ kind: 'error', message: 'Resolve all fit checks before saving a preset.' });
      return;
    }
    const next = [
      ...presets.filter(preset => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase()),
      { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name, parameters: { ...parameters }, fitPassport: { ...fitPassport }, printerVolume: { ...printerVolume } },
    ];
    if (persistPresets(next, 'Preset saved in this browser.')) setPresetName('');
  };

  const loadPreset = (preset: Preset) => {
    const legacyFit = defaultDeskKitFitPassport(preset.parameters);
    form.reset({
      ...DEFAULT_DESK_KIT_PARAMETERS, ...preset.parameters,
      ...(preset.fitPassport ?? legacyFit),
      printerXMm: preset.printerVolume?.xMm ?? DEFAULT_PRINTER_BUILD_VOLUME.xMm,
      printerYMm: preset.printerVolume?.yMm ?? DEFAULT_PRINTER_BUILD_VOLUME.yMm,
      printerZMm: preset.printerVolume?.zMm ?? DEFAULT_PRINTER_BUILD_VOLUME.zMm,
    });
    setStorageFeedback({ kind: 'success', message: `Loaded “${preset.name}” into the live configuration.` });
    setDeleteId(null);
  };

  const deletePreset = (id: string) => {
    if (persistPresets(presets.filter(preset => preset.id !== id), 'Preset deleted from this browser.')) setDeleteId(null);
  };

  const exportFile = async (format: 'glb' | 'json' | 'print') => {
    if (!isValid || exportPending) return;
    setExportPending(format);
    setExportFeedback(null);
    try {
      if (format === 'glb') await downloadDeskKitGlb(parameters, fitPassport, printerPlan.ready ? printerPlan.segmentCount : 1);
      else if (format === 'json') downloadDeskKitJson(parameters, fitPassport, printerPlan);
      else {
        const result = await downloadDeskKitPrintPack(parameters, fitPassport, printerVolume);
        setExportFeedback({ kind: 'success', message: `Print pack created locally: ${result.partCount} STL files, fit passport and assembly notes.` });
        return;
      }
      setExportFeedback({ kind: 'success', message: `${format.toUpperCase()} export started. Check your browser’s downloads.` });
    } catch (error) {
      setExportFeedback({ kind: 'error', message: error instanceof Error ? error.message : `${format.toUpperCase()} export failed. Try again.` });
    } finally {
      setExportPending(null);
    }
  };

  const clearanceTone = metrics.channelClearanceMm >= 3 ? 'text-[#55765c]' : 'text-[#ad6046]';

  return (
    <div className="enter pb-10" data-testid="page-desk-kit">
      <div className="mt-7 flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-[10px] text-[#64746b] no-underline hover:text-[#203d39]" data-testid="link-back-to-brief-studio">
            <ArrowLeft size={13} /> Back to brief studio
          </Link>
          <div className="eyebrow mt-6">Desk Kit mode / 01</div>
          <h1 className="display mt-2 text-[clamp(38px,5vw,60px)] leading-[.94] text-[#203d39]" data-testid="text-desk-kit-title">Fit the cable<br className="hidden sm:block" /> run to your desk.</h1>
          <p className="mt-3 max-w-[600px] text-[12px] leading-6 text-[#63716a]" data-testid="text-desk-kit-intro">
            A custom-fit under-desk organizer, defined by real measurements. Change a dimension and the local geometry and fit checks respond immediately.
          </p>
        </div>
        <div className="mt-8 flex items-center gap-2 border border-[#d5d5c8] bg-[#f7f5eb] px-3 py-2.5">
          <span className="grid h-7 w-7 place-items-center border border-[#a9b9a9] text-[#577368]"><HardDrive size={14} /></span>
          <span><span className="eyebrow block !text-[8px]">Geometry source</span><span className="mono mt-1 block text-[9px] text-[#4c675d]" data-testid="status-geometry-local">Generated locally</span></span>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(310px,.78fr)_minmax(470px,1.22fr)]">
        <section className="panel min-w-0 p-4 sm:p-5" aria-labelledby="dimensions-heading">
          <div className="flex items-start justify-between gap-3 border-b border-[#d8d7ca] pb-4">
            <div><div className="eyebrow">01 / Dimensions</div><h2 id="dimensions-heading" className="display mt-1 text-[25px] text-[#294740]">Set the fit</h2></div>
            <span className="tag !py-1" data-testid="status-validation-summary"><i className={`dot ${isValid ? '' : '!bg-[#dc8c68]'}`} />{isValid ? 'Fit checks pass' : 'Needs adjustment'}</span>
          </div>

          <Form {...form}>
            <form onSubmit={event => event.preventDefault()} className="mt-4 space-y-3" noValidate data-testid="form-desk-kit-parameters">
              {parameterFields.map(({ name, label, unit, min, max, step, description, icon: Icon }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-[minmax(0,1fr)_112px] items-start gap-x-3 gap-y-1 border-b border-[#e4e2d7] pb-3 last:border-b-0">
                      <div className="min-w-0">
                        <FormLabel className="flex items-center gap-2 text-[11px] font-semibold text-[#344e48]" data-testid={`label-parameter-${name}`}><Icon size={13} className="text-[#718a7d]" />{label}</FormLabel>
                        <FormDescription className="mt-1 text-[9px] leading-4 text-[#7c887f]" data-testid={`help-parameter-${name}`}>{description} <span className="mono">{min}–{max} {unit}</span></FormDescription>
                        <FormMessage className="mt-1 text-[9px]" data-testid={`error-parameter-${name}`} />
                      </div>
                      <div className="relative">
                        <FormControl>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            inputMode="decimal"
                            className="input-field mono !py-2.5 !pr-10 text-right text-[12px]"
                            value={Number.isFinite(field.value) ? field.value : ''}
                            onChange={event => {
                              const value = event.target.value === '' ? Number.NaN : Number(event.target.value);
                              field.onChange(value);
                              if (name === 'deskThicknessMm' && Number.isFinite(value)) {
                                form.setValue('thicknessAtClampOneMm', value, { shouldValidate: true });
                                form.setValue('thicknessAtClampTwoMm', value, { shouldValidate: true });
                              }
                            }}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            aria-label={`${label} in ${unit}`}
                            data-testid={`input-parameter-${name}`}
                          />
                        </FormControl>
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-[#8a958b]">{unit}</span>
                      </div>
                    </FormItem>
                  )}
                />
              ))}
              <div className="border-t border-[#d8d7ca] pt-4">
                <div className="eyebrow">Fit Passport / local measurement record</div>
                <h3 className="display mt-1 text-[20px] text-[#294740]">Two points, one envelope</h3>
                <p className="mt-1 text-[10px] leading-4 text-[#758178]">Nominal desk thickness above remains the average of the two clamp readings.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {([
                    ['thicknessAtClampOneMm', 'Clamp point one', 12, 45, .5],
                    ['thicknessAtClampTwoMm', 'Clamp point two', 12, 45, .5],
                    ['measurementUncertaintyMm', 'Measurement uncertainty', 0, 3, .1],
                    ['clearancePerSideMm', 'Clearance per side', .2, 3, .1],
                  ] as const).map(([name, label, min, max, step]) => (
                    <FormField key={name} control={form.control} name={name} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold text-[#344e48]">{label} · mm</FormLabel>
                        <FormControl><input type="number" min={min} max={max} step={step} className="input-field mono !py-2 text-[11px]" value={Number.isFinite(field.value) ? field.value : ''} onChange={event => {
                          const value = event.target.value === '' ? Number.NaN : Number(event.target.value);
                          field.onChange(value);
                          if ((name === 'thicknessAtClampOneMm' || name === 'thicknessAtClampTwoMm') && Number.isFinite(value)) {
                            const other = form.getValues(name === 'thicknessAtClampOneMm' ? 'thicknessAtClampTwoMm' : 'thicknessAtClampOneMm');
                            form.setValue('deskThicknessMm', (value + other) / 2, { shouldValidate: true });
                          }
                        }} onBlur={field.onBlur} name={field.name} ref={field.ref} data-testid={`input-fit-${name}`} /></FormControl>
                        <FormMessage className="text-[9px]" data-testid={`error-fit-${name}`} />
                      </FormItem>
                    )} />
                  ))}
                </div>
              </div>
            </form>
          </Form>

          <div className="mt-4 border-t border-[#d8d7ca] pt-4" data-testid="section-local-presets">
            <div className="flex items-center gap-2"><Save size={13} className="text-[#718a7d]" /><div><div className="eyebrow">Keep a setup</div><h3 className="display mt-0.5 text-[19px] text-[#294740]">Local presets</h3></div></div>
            <p className="mt-2 text-[10px] leading-4 text-[#758178]" data-testid="text-preset-storage-note">Presets stay in this browser only. They are not uploaded or synced.</p>
            <div className="mt-3 flex gap-2">
              <label className="sr-only" htmlFor="desk-kit-preset-name">Preset name</label>
              <input id="desk-kit-preset-name" className="input-field min-w-0 !py-2 text-[11px]" placeholder="e.g. Studio desk" value={presetName} onChange={event => setPresetName(event.target.value)} maxLength={48} data-testid="input-preset-name" />
              <button type="button" className="quiet-btn flex shrink-0 items-center gap-1.5 !px-3 text-[10px]" disabled={!storageReady || !isValid} onClick={savePreset} data-testid="button-save-preset"><Save size={12} /> Save</button>
            </div>
            {presets.length > 0 ? (
              <ul className="mt-3 divide-y divide-[#e4e2d7]" data-testid="list-local-presets">
                {presets.map(preset => (
                  <li key={preset.id} className="flex items-center gap-2 py-2" data-testid={`row-local-preset-${preset.id}`}>
                    <button type="button" onClick={() => loadPreset(preset)} className="min-w-0 flex-1 text-left" data-testid={`button-load-preset-${preset.id}`}>
                      <span className="block truncate text-[11px] font-semibold text-[#405b50]">{preset.name}</span>
              <span className="mono mt-0.5 block truncate text-[8px] text-[#889289]">{preset.parameters.deskThicknessMm} mm nominal · {preset.parameters.railLengthMm} mm rail · {preset.parameters.cableCount} cables · {preset.fitPassport ? 'Fit Passport' : 'legacy v1 defaults'}</span>
                    </button>
                    {deleteId === preset.id ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" className="text-[9px] text-[#a85c43] underline" onClick={() => deletePreset(preset.id)} data-testid={`button-confirm-delete-preset-${preset.id}`}>Delete</button>
                        <button type="button" className="text-[9px] text-[#718078] underline" onClick={() => setDeleteId(null)} data-testid={`button-cancel-delete-preset-${preset.id}`}>Cancel</button>
                      </span>
                    ) : <button type="button" aria-label={`Delete ${preset.name} preset`} onClick={() => setDeleteId(preset.id)} className="quiet-btn !px-2 !py-1 text-[#8a6858]" data-testid={`button-delete-preset-${preset.id}`}><Trash2 size={12} /></button>}
                  </li>
                ))}
              </ul>
            ) : <div className="mt-3 border border-dashed border-[#ccd3c9] px-3 py-3 text-[10px] text-[#819087]" data-testid="empty-local-presets">No presets saved in this browser yet.</div>}
            {storageFeedback && <div className={`mt-3 flex items-start gap-2 border px-3 py-2 text-[10px] leading-4 ${storageFeedback.kind === 'error' ? 'border-[#dfb398] bg-[#fff0e5] text-[#8f5039]' : 'border-[#cbd6c7] bg-[#edf1e6] text-[#506c53]'}`} role={storageFeedback.kind === 'error' ? 'alert' : 'status'} data-testid={`status-preset-${storageFeedback.kind}`}>{storageFeedback.kind === 'error' ? <CircleAlert size={13} className="mt-0.5 shrink-0" /> : <Check size={13} className="mt-0.5 shrink-0" />}{storageFeedback.message}</div>}
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          <section className="panel overflow-hidden" aria-labelledby="preview-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d7ca] px-4 py-3 sm:px-5">
              <div><div className="eyebrow">02 / Live geometry</div><h2 id="preview-heading" className="display mt-1 text-[23px] text-[#294740]">Under the desk</h2></div>
              <span className="mono text-[9px] text-[#829088]" data-testid="status-preview-units">DIMENSIONS IN MILLIMETERS</span>
            </div>
            {metrics.ready ? (
              <DeskKitPreview parameters={parameters} fitPassport={fitPassport} segmentCount={printerPlan.ready ? printerPlan.segmentCount : 1} className="min-h-[290px] sm:min-h-[360px]" />
            ) : (
              <div className="grid-paper grid min-h-[290px] place-items-center p-6 text-center sm:min-h-[360px]" data-testid="status-preview-needs-valid-fit">
                <div className="max-w-[320px]">
                  <div className="mx-auto grid h-12 w-12 place-items-center border border-[#d2a487] bg-[#fbefe4] text-[#a66449]"><ShieldAlert size={20} /></div>
                  <h3 className="display mt-4 text-[21px] text-[#475b50]">Preview paused for fit</h3>
                  <p className="mt-2 text-[11px] leading-5 text-[#78837a]">Adjust the highlighted dimensions until every check passes. The geometry preview will update as soon as the kit is valid.</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-px border-t border-[#d8d7ca] bg-[#d8d7ca] sm:grid-cols-4" data-testid="grid-derived-dimensions">
              <div className="bg-[#f8f6ed] px-3 py-2.5"><div className="eyebrow !text-[8px]">Clamp opening</div><div className="mono mt-1 text-[11px] text-[#405c50]" data-testid="metric-clamp-opening">{Number.isFinite(metrics.clampOpeningMm) ? `${metrics.clampOpeningMm.toFixed(1)} mm` : '—'}</div></div>
              <div className="bg-[#f8f6ed] px-3 py-2.5"><div className="eyebrow !text-[8px]">Channel pitch</div><div className="mono mt-1 text-[11px] text-[#405c50]" data-testid="metric-channel-pitch">{Number.isFinite(metrics.channelPitchMm) ? `${metrics.channelPitchMm.toFixed(1)} mm` : '—'}</div></div>
              <div className="bg-[#f8f6ed] px-3 py-2.5"><div className="eyebrow !text-[8px]">Clearance</div><div className={`mono mt-1 text-[11px] ${clearanceTone}`} data-testid="metric-channel-clearance">{Number.isFinite(metrics.channelClearanceMm) ? `${metrics.channelClearanceMm.toFixed(1)} mm` : '—'}</div></div>
              <div className="bg-[#f8f6ed] px-3 py-2.5"><div className="eyebrow !text-[8px]">Rail span</div><div className="mono mt-1 text-[11px] text-[#405c50]" data-testid="metric-rail-span">{Number.isFinite(parameters.railLengthMm) ? `${parameters.railLengthMm} mm` : '—'}</div></div>
            </div>
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="passport-heading" data-testid="section-fit-passport">
            <div className="eyebrow">Input-based geometric fit envelope</div>
            <h2 id="passport-heading" className="display mt-1 text-[23px] text-[#294740]">Fit Passport</h2>
            <div className="mt-3 grid grid-cols-2 gap-px border border-[#d8d7ca] bg-[#d8d7ca] sm:grid-cols-4">
              {[
                ['Clamp one', `${fitPassport.thicknessAtClampOneMm} mm`, 'metric-passport-one'],
                ['Clamp two', `${fitPassport.thicknessAtClampTwoMm} mm`, 'metric-passport-two'],
                ['Measured range', `${metrics.measuredThicknessRangeMm[0].toFixed(1)}–${metrics.measuredThicknessRangeMm[1].toFixed(1)} mm`, 'metric-passport-range'],
                ['Clamp openings', `${metrics.clampOpeningsMm[0].toFixed(1)} / ${metrics.clampOpeningsMm[1].toFixed(1)} mm`, 'metric-passport-openings'],
              ].map(([label, value, id]) => <div key={id} className="bg-[#f8f6ed] px-3 py-2.5"><div className="eyebrow !text-[8px]">{label}</div><div className="mono mt-1 text-[10px] text-[#405c50]" data-testid={id}>{value}</div></div>)}
            </div>
            <p className="mt-3 border border-[#dfc29c] bg-[#fff3df] px-3 py-2.5 text-[10px] leading-4 text-[#806849]" data-testid="notice-fit-passport-limits">This is an input-based geometric fit envelope only. It is not secure retention, a compatibility guarantee, load testing, safety review, or manufacturing certification.</p>
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="fit-checks-heading" data-testid="section-fit-checks">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#d8d7ca] pb-3">
              <div><div className="eyebrow">03 / Dimensional review</div><h2 id="fit-checks-heading" className="display mt-1 text-[23px] text-[#294740]">Fit checks</h2></div>
              <div className={`mono text-[10px] ${metrics.ready ? 'text-[#55765c]' : 'text-[#ad6046]'}`} data-testid="text-fit-check-count">{metrics.checks.filter(check => check.passed).length} / {metrics.checks.length} passed</div>
            </div>
            <div className="mt-1">
              {metrics.checks.map((check, index) => <CheckRow key={check.id} check={check} index={index} />)}
            </div>
            <div className="mt-3 flex items-start gap-2 border border-[#dfc29c] bg-[#fff3df] px-3 py-2.5 text-[10px] leading-4 text-[#806849]" data-testid="notice-dimensional-limitations">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              <p>These are dimensional checks only. They do not certify strength, materials, safety, or manufacturing suitability.</p>
            </div>
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="printer-heading" data-testid="section-printer-compiler">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="eyebrow flex items-center gap-2"><Printer size={13} /> 04 / Printer-aware compilation</div><h2 id="printer-heading" className="display mt-1 text-[23px] text-[#294740]">Check the build volume</h2></div>
              <span className="tag !py-1" data-testid="status-printer-plan"><i className={`dot ${printerPlan.ready ? '' : '!bg-[#dc8c68]'}`} />{printerPlan.ready ? 'Plan ready' : 'Review plan'}</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[#758178]">Enter the machine’s usable X, Y and Z volume. Compiler checks are geometric estimates, not a slicer simulation.</p>
            <Form {...form}><div className="mt-3 grid grid-cols-3 gap-2">
              {([
                ['printerXMm', 'X', printerVolume.xMm],
                ['printerYMm', 'Y', printerVolume.yMm],
                ['printerZMm', 'Z', printerVolume.zMm],
              ] as const).map(([name, axis]) => <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-semibold">{axis} volume · mm</FormLabel><FormControl><input type="number" min={80} max={500} step={1} className="input-field mono !py-2 text-[11px]" value={Number.isFinite(field.value) ? field.value : ''} onChange={event => field.onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))} onBlur={field.onBlur} name={field.name} ref={field.ref} data-testid={`input-printer-${axis.toLowerCase()}`} /></FormControl><FormMessage className="text-[9px]" /></FormItem>
              )} />)}
            </div></Form>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="grid-printer-plan-summary">
              {[
                ['Rail orientation', `${printerPlan.railAxis} axis`, 'metric-printer-axis'],
                ['Rail sections', String(printerPlan.segmentCount), 'metric-printer-sections'],
                ['Section length', `${printerPlan.segmentLengthMm.toFixed(1)} mm`, 'metric-printer-segment-length'],
                ['Usable rail span', `${printerPlan.usableRailSpanMm.toFixed(0)} mm`, 'metric-printer-usable-span'],
              ].map(([label, value, id]) => <div key={id} className="border border-[#e0dfd3] bg-[#f6f4eb] p-2.5"><div className="eyebrow !text-[8px]">{label}</div><div className="mono mt-1 text-[10px] text-[#405c50]" data-testid={id}>{value}</div></div>)}
            </div>
            <div className="mt-3 space-y-2">
              {printerPlan.checks.map((check, index) => <div key={check.id} className="flex gap-2 border-b border-[#e6e4d9] pb-2 text-[10px]" data-testid={`row-printer-check-${check.id}`}><span className={`mono ${check.passed ? 'text-[#66816a]' : 'text-[#a85c43]'}`}>{check.passed ? 'PASS' : 'REVIEW'}</span><div><b>{check.label}</b><div className="mt-0.5 text-[#78847b]" data-testid={`text-printer-check-${check.id}`}>{check.detail}</div></div><span className="mono ml-auto text-[#a0a79b]">{String(index + 1).padStart(2, '0')}</span></div>)}
            </div>
            <p className="mt-3 border border-[#dfc29c] bg-[#fff3df] px-3 py-2.5 text-[10px] leading-4 text-[#806849]" data-testid="notice-printer-limitations">Segmented rails use an untested prototype joint. Printer and material tolerances, strength, slicer orientation and actual machine fit are not certified. Inspect each part in your slicer before printing.</p>
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="export-heading" data-testid="section-export">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="eyebrow">05 / Take it with you</div><h2 id="export-heading" className="display mt-1 text-[23px] text-[#294740]">Export this fit</h2></div>
              <span className="tag !py-1"><i className={`dot ${isValid ? '' : '!bg-[#dc8c68]'}`} />{isValid ? 'Ready to export' : 'Resolve checks first'}</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[#758178]" data-testid="text-export-description">GLB contains editable organizer geometry. JSON records dimensions, Fit Passport and printer plan. Print ZIP contains centered individual STL parts and assembly notes.</p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" className="primary-btn flex items-center justify-center gap-2 text-[11px]" disabled={!isValid || exportPending !== null} onClick={() => void exportFile('glb')} data-testid="button-export-glb">
                {exportPending === 'glb' ? <><LoaderCircle size={14} className="animate-spin" /> Building GLB…</> : <><Download size={14} /> Export GLB</>}
              </button>
              <button type="button" className="quiet-btn flex items-center justify-center gap-2 text-[11px]" disabled={!isValid || exportPending !== null} onClick={() => void exportFile('json')} data-testid="button-export-json">
                {exportPending === 'json' ? <><LoaderCircle size={14} className="animate-spin" /> Preparing JSON…</> : <><Download size={14} /> Export parameter JSON</>}
              </button>
              <button type="button" className="quiet-btn flex items-center justify-center gap-2 text-[11px]" disabled={!isValid || !printerPlan.ready || exportPending !== null} onClick={() => void exportFile('print')} data-testid="button-export-print-pack">
                {exportPending === 'print' ? <><LoaderCircle size={14} className="animate-spin" /> Compiling ZIP…</> : <><FileArchive size={14} /> Print pack ZIP</>}
              </button>
            </div>
            {exportFeedback && <div className={`mt-3 flex items-start gap-2 border px-3 py-2 text-[10px] leading-4 ${exportFeedback.kind === 'error' ? 'border-[#dfb398] bg-[#fff0e5] text-[#8f5039]' : 'border-[#cbd6c7] bg-[#edf1e6] text-[#506c53]'}`} role={exportFeedback.kind === 'error' ? 'alert' : 'status'} data-testid={`status-export-${exportFeedback.kind}`}><Check size={13} className="mt-0.5 shrink-0" />{exportFeedback.message}</div>}
            <p className="mt-3 border-t border-[#e4e2d7] pt-3 text-[9px] leading-4 text-[#879188]" data-testid="text-export-locality">Deterministic geometry is generated on this device. Exports are created locally in your browser.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
