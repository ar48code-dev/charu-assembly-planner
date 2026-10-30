import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link } from 'wouter';
import { ArrowRight, Check, CircleAlert, Layers3, RotateCw, Save, WandSparkles } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { StudioViewport } from '@/components/studio-viewport';
import { useStudioWorkspace, type StudioScene } from '@/lib/studio-store';
import { planSceneEdits, type SceneEditPlan } from '@/lib/scene-agent';
import type { ViewportPart } from '@/lib/geometry-layout';

const commandSchema = z.object({
  command: z.string().trim().min(1, 'Write one or more scene instructions.').max(1200, 'Keep the command under 1,200 characters.'),
});
type CommandValues = z.infer<typeof commandSchema>;

function sceneParts(scene: StudioScene, objects: ReturnType<typeof useStudioWorkspace>['objects']): ViewportPart[] {
  return scene.members.flatMap(member => {
    const object = objects.find(item => item.id === member.objectId);
    if (!object) return [];
    return object.parts.map(part => ({
      ...part,
      groupId: object.id,
      groupPosition: member.position,
      rotation: member.rotation * Math.PI / 180,
    }));
  });
}

function SceneState({ scene, objects, proposed = false }: { scene: StudioScene; objects: ReturnType<typeof useStudioWorkspace>['objects']; proposed?: boolean }) {
  const parts = useMemo(() => sceneParts(scene, objects), [scene, objects]);
  const connections = useMemo(() => scene.connections.map(link => {
    const from = objects.find(item => item.id === link.fromObjectId);
    const to = objects.find(item => item.id === link.toObjectId);
    const fromMember = scene.members.find(member => member.objectId === link.fromObjectId);
    const toMember = scene.members.find(member => member.objectId === link.toObjectId);
    if (!from || !to || !fromMember || !toMember) return null;
    return {
      from: fromMember.position as [number, number, number],
      to: toMember.position as [number, number, number],
      kind: link.kind,
    };
  }).filter((value): value is NonNullable<typeof value> => value !== null), [scene, objects]);
  return <div className="overflow-hidden border border-[#d8d7ca]">
    <div className="flex items-center justify-between gap-2 border-b border-[#d8d7ca] bg-[#f7f5eb] px-3 py-2">
      <span className="eyebrow">{proposed ? 'Proposed arrangement' : 'Saved arrangement'}</span>
      <span className="mono text-[9px] text-[#718078]" data-testid={proposed ? 'status-proposed-member-count' : 'status-saved-member-count'}>{scene.members.length} object{scene.members.length === 1 ? '' : 's'}</span>
    </div>
    <StudioViewport parts={parts} connections={connections} className="min-h-[250px]" />
    {scene.members.length ? <div className="divide-y divide-[#e4e2d7] bg-[#f8f6ed]">
      {scene.members.map(member => {
        const object = objects.find(item => item.id === member.objectId);
        if (!object) return null;
        return <div key={member.objectId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-[10px]" data-testid={`${proposed ? 'proposed' : 'saved'}-scene-object-${member.objectId}`}>
          <span className="truncate font-semibold text-[#405b50]">{object.name}</span>
          <span className="mono text-right text-[#718078]">XYZ {member.position.map(v => `${v.toFixed(1)}`).join(' / ')} cm · {member.rotation.toFixed(1)}°</span>
        </div>;
      })}
    </div> : <div className="grid-paper px-4 py-8 text-center text-[11px] text-[#7a877d]" data-testid={`${proposed ? 'empty-proposed' : 'empty-saved'}-scene`}>No objects in this scene.</div>}
  </div>;
}

export default function SceneAgentPage() {
  const { scenes, objects, saveScene } = useStudioWorkspace();
  const [selectedId, setSelectedId] = useState('');
  const [plan, setPlan] = useState<SceneEditPlan | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const form = useForm<CommandValues>({
    resolver: zodResolver(commandSchema),
    mode: 'onChange',
    defaultValues: { command: '' },
  });
  const activeScene = scenes.find(scene => scene.id === selectedId) ?? scenes[0];
  const command = form.watch('command');
  const resolveCommand = (values: CommandValues) => {
    setError('');
    setNotice('');
    setPlan(null);
    if (!activeScene) {
      setError('Save a scene first, then return to prepare a local edit.');
      return;
    }
    const result = planSceneEdits(values.command, activeScene, objects);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPlan(result.plan);
  };
  const applyPlan = () => {
    if (!plan) return;
    saveScene(plan.scene);
    setSelectedId(plan.scene.id);
    setPlan(null);
    setNotice(`Applied ${plan.changes.length} reviewed change${plan.changes.length === 1 ? '' : 's'} to “${plan.scene.name}” in this browser.`);
  };

  return <div className="enter pb-10" data-testid="page-scene-agent">
    <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
      <div><div className="eyebrow">Local scene workbench / 01</div><h1 className="display mt-2 text-[clamp(38px,5vw,60px)] leading-[.94] text-[#203d39]">Edit the scene.<br className="hidden sm:block" /> Review the change.</h1></div>
      <p className="max-w-[285px] border-l-2 border-[#e8875a] pl-4 text-[12px] leading-5 text-[#64726a]">A small, explicit command set for saved arrangements. Nothing changes until you apply the reviewed proposal.</p>
    </div>

    <div className="mt-7 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(300px,.75fr)_minmax(0,1.25fr)]">
      <section className="panel p-4 sm:p-5" aria-labelledby="scene-command-heading">
        <div className="flex items-center gap-2 border-b border-[#d8d7ca] pb-4"><span className="grid h-9 w-9 place-items-center border border-[#a9b9a9] text-[#577368]"><WandSparkles size={16} /></span><div><div className="eyebrow">Instruction parser · local only</div><h2 id="scene-command-heading" className="display mt-0.5 text-[22px] text-[#294740]">A bounded vocabulary</h2></div></div>
        <label className="mt-4 block"><span className="mb-2 block text-[11px] font-semibold text-[#344e48]">Saved scene</span><select className="input-field text-[11px]" value={activeScene?.id ?? ''} onChange={event => { setSelectedId(event.target.value); setPlan(null); setError(''); setNotice(''); }} disabled={!scenes.length} data-testid="select-scene-agent-target" aria-label="Choose saved scene">
          {!scenes.length && <option value="">No saved scenes</option>}
          {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
        </select></label>
        {activeScene ? <>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(resolveCommand)} className="mt-5" noValidate data-testid="form-scene-agent-command">
              <FormField control={form.control} name="command" render={({ field }) => <FormItem>
                <FormLabel className="text-[11px] font-semibold text-[#344e48]">Scene instruction</FormLabel>
                <FormControl><textarea {...field} onChange={event => { field.onChange(event); setPlan(null); setError(''); }} rows={5} maxLength={1200} className="input-field mt-2 resize-y text-[11px] leading-5" aria-describedby="scene-command-help" data-testid="input-scene-agent-command" /></FormControl>
                <div className="mt-1 flex items-center justify-between gap-2"><span id="scene-command-help" className="text-[9px] text-[#7c887f]">Up to five separate instructions.</span><span className="mono text-[9px] text-[#8a958b]" data-testid="text-scene-command-length">{command?.length ?? 0} / 1200</span></div>
                <FormMessage className="mt-1 text-[9px]" data-testid="error-scene-agent-command" />
              </FormItem>} />
              <button type="submit" className="primary-btn mt-4 flex w-full items-center justify-center gap-2 text-[11px]" disabled={!form.formState.isValid || !activeScene} data-testid="button-propose-scene-edit"><WandSparkles size={13} /> Prepare proposal <ArrowRight size={13} /></button>
            </form>
          </Form>
          <div className="mt-5 border-t border-[#d8d7ca] pt-4">
            <div className="eyebrow">Supported instructions</div>
            <ul className="mono mt-2 space-y-2 text-[9px] leading-4 text-[#566a60]" data-testid="list-scene-command-forms">
              <li>move exact saved object name left/right/up/down/front/back by N cm</li>
              <li>place exact saved object name at X, Y, Z cm</li>
              <li>rotate exact saved object name by N degrees</li>
              <li>add exact saved object name to scene</li>
              <li>remove exact saved object name from scene</li>
              <li>arrange all in a row, optionally with N cm gap</li>
            </ul>
            <p className="mt-3 border-l-2 border-[#91a99b] pl-3 text-[9px] leading-4 text-[#77847b]" data-testid="text-scene-axis-help">Positions use XYZ in centimeters: left/right is X, up/down is Y, front/back is Z. Rotation is degrees around the vertical axis. Commands match saved object names exactly.</p>
          </div>
          {error && <div className="mt-4 flex items-start gap-2 border border-[#dfb398] bg-[#fff0e5] px-3 py-2.5 text-[10px] leading-4 text-[#8f5039]" role="alert" data-testid="error-scene-agent-parse"><CircleAlert size={14} className="mt-0.5 shrink-0" />{error}</div>}
          {notice && <div className="mt-4 flex items-start gap-2 border border-[#cbd6c7] bg-[#edf1e6] px-3 py-2.5 text-[10px] leading-4 text-[#506c53]" role="status" data-testid="status-scene-agent-applied"><Check size={14} className="mt-0.5 shrink-0" />{notice}</div>}
        </> : <div className="grid-paper mt-4 border border-dashed border-[#ccd3c9] px-4 py-8 text-center" data-testid="empty-scene-agent">
          <Layers3 size={22} className="mx-auto text-[#718a7d]" /><h3 className="display mt-3 text-[20px] text-[#405b50]">No saved scene to edit</h3><p className="mx-auto mt-2 max-w-[260px] text-[10px] leading-5 text-[#78847b]">Create and save a scene in the Scenes workbench. The local parser edits saved scenes only.</p><Link href="/scenes" className="quiet-btn mt-4 inline-flex items-center gap-2 text-[10px] no-underline" data-testid="link-create-scene-for-agent"><Layers3 size={12} /> Open Scenes workbench</Link>
        </div>}
      </section>

      <section className="min-w-0 space-y-4" aria-labelledby="scene-review-heading">
        <div className="panel p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d7ca] pb-3">
            <div><div className="eyebrow">Review before writing</div><h2 id="scene-review-heading" className="display mt-1 text-[23px] text-[#294740]">{activeScene?.name ?? 'Scene comparison'}</h2></div>
            <span className={`tag !py-1 ${plan ? '' : '!bg-[#f6f4eb]'}`} data-testid="status-scene-review">{plan ? 'Proposal ready' : 'No pending proposal'}</span>
          </div>
          {activeScene ? <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <SceneState scene={activeScene} objects={objects} />
            {plan ? <SceneState scene={plan.scene} objects={objects} proposed /> : <div className="grid-paper grid min-h-[290px] place-items-center border border-dashed border-[#ccd3c9] p-6 text-center" data-testid="empty-scene-proposal"><div><div className="mx-auto grid h-12 w-12 place-items-center border border-[#91a99b] text-[#57766b]"><RotateCw size={20} /></div><div className="display mt-4 text-[21px] text-[#304b45]">Changes stay staged</div><p className="mx-auto mt-2 max-w-[270px] text-[10px] leading-5 text-[#75837a]">Prepare a command to inspect the exact proposed positions and membership before saving.</p></div></div>}
          </div> : null}
          {plan && <div className="mt-4 border-t border-[#d8d7ca] pt-4" data-testid="section-scene-change-review">
            <div className="eyebrow">Proposed changes · {plan.changes.length}</div>
            <ul className="mt-2 space-y-2">{plan.changes.map((change, index) => <li key={`${index}-${change}`} className="flex gap-2 border-b border-[#e4e2d7] pb-2 text-[10px] leading-4 text-[#52665d]" data-testid={`row-scene-proposed-change-${index}`}><span className="mono text-[#db8159]">{String(index + 1).padStart(2, '0')}</span>{change}</li>)}</ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[300px] text-[9px] leading-4 text-[#78857c]">Proposal is a temporary clone. Generating it did not save or alter the selected scene.</p>
              <button type="button" className="primary-btn flex items-center gap-2 text-[11px]" onClick={applyPlan} data-testid="button-apply-scene-proposal"><Save size={13} /> Apply reviewed changes</button>
            </div>
          </div>}
        </div>
         <div className="border border-[#d8d7ca] bg-[#f7f5eb] px-4 py-3 text-[10px] leading-5 text-[#718078]" data-testid="notice-scene-agent-local">Scene instructions run locally using this browser’s saved objects. No scene data is sent to a model. Apply writes through the local scene store.</div>
      </section>
    </div>
  </div>;
}
