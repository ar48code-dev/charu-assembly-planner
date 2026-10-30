import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react";
import type { AssemblyConnection, AssemblyPart, AssemblyPlan } from "@workspace/api-client-react";

const STORAGE_KEY = "charu.studio.workspace.v1";

export interface ObjectSnapshot {
  name: string;
  description: string;
  parts: AssemblyPart[];
  connections: AssemblyConnection[];
}

export interface StudioVersion {
  id: string;
  number: number;
  createdAt: string;
  note: string;
  snapshot: ObjectSnapshot;
}

export interface StudioObject extends ObjectSnapshot {
  id: string;
  prompt: string;
  sourcePlanId: string;
  createdAt: string;
  updatedAt: string;
  versions: StudioVersion[];
}

export interface SceneMember {
  objectId: string;
  position: [number, number, number];
  rotation: number;
}

export interface SceneConnection {
  fromObjectId: string;
  toObjectId: string;
  kind: "rigid" | "hinge" | "slide";
}

export interface StudioScene {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  members: SceneMember[];
  connections: SceneConnection[];
}

interface WorkspaceData {
  objects: StudioObject[];
  scenes: StudioScene[];
}

interface StudioStoreValue extends WorkspaceData {
  storageError: string | null;
  dismissStorageError: () => void;
  saveObjectFromPlan: (plan: AssemblyPlan, name: string) => StudioObject | null;
  updateObject: (id: string, patch: Partial<ObjectSnapshot>, note: string) => void;
  deleteObject: (id: string) => void;
  restoreVersion: (objectId: string, versionId: string) => void;
  saveScene: (scene: Omit<StudioScene, "createdAt" | "updatedAt"> & { createdAt?: string }) => void;
  deleteScene: (id: string) => void;
}

const emptyWorkspace = (): WorkspaceData => ({ objects: [], scenes: [] });

function readWorkspace(): { workspace: WorkspaceData; error: string | null } {
  if (typeof window === "undefined") return { workspace: emptyWorkspace(), error: null };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<WorkspaceData> | null;
    return {
      workspace: {
        objects: Array.isArray(parsed?.objects) ? parsed.objects : [],
        scenes: Array.isArray(parsed?.scenes) ? parsed.scenes : [],
      },
      error: null,
    };
  } catch {
    return {
      workspace: emptyWorkspace(),
      error: "Charu could not read this browser's saved studio data. New changes may remain session-only until browser storage is available.",
    };
  }
}

function writeWorkspace(value: WorkspaceData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function snapshotOf(object: ObjectSnapshot): ObjectSnapshot {
  return {
    name: object.name,
    description: object.description,
    parts: structuredClone(object.parts),
    connections: structuredClone(object.connections),
  };
}

function makeVersion(number: number, snapshot: ObjectSnapshot, note: string): StudioVersion {
  return {
    id: crypto.randomUUID(),
    number,
    createdAt: new Date().toISOString(),
    note: note.trim() || "Workspace update",
    snapshot: snapshotOf(snapshot),
  };
}

const StudioStoreContext = createContext<StudioStoreValue | null>(null);

export function StudioStoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readWorkspace);
  const [workspace, setWorkspace] = useState<WorkspaceData>(initial.workspace);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const commit = (next: WorkspaceData) => {
    setWorkspace(next);
    try {
      writeWorkspace(next);
      setStorageError(null);
    } catch {
      setStorageError("The browser could not save this studio change. It is available for this session only; free browser storage space before leaving.");
    }
  };

  const value = useMemo<StudioStoreValue>(() => ({
    ...workspace,
    storageError,
    dismissStorageError: () => setStorageError(null),
    saveObjectFromPlan: (plan, name) => {
      if (!plan.candidate) return null;
      const now = new Date().toISOString();
      const initial: ObjectSnapshot = {
        name: name.trim() || plan.candidate.title,
        description: plan.candidate.summary,
        parts: structuredClone(plan.candidate.parts),
        connections: structuredClone(plan.candidate.connections),
      };
      const object: StudioObject = {
        ...initial,
        id: crypto.randomUUID(),
        prompt: plan.prompt,
        sourcePlanId: plan.id,
        createdAt: now,
        updatedAt: now,
        versions: [makeVersion(1, initial, "Created from a validated assembly proposal")],
      };
      commit({ ...workspace, objects: [object, ...workspace.objects] });
      return object;
    },
    updateObject: (id, patch, note) => {
      const objects = workspace.objects.map((object) => {
        if (object.id !== id) return object;
        const updated = { ...object, ...patch, updatedAt: new Date().toISOString() };
        const version = makeVersion(object.versions.length + 1, updated, note);
        return { ...updated, versions: [...object.versions, version] };
      });
      commit({ ...workspace, objects });
    },
    deleteObject: (id) => {
      commit({
        objects: workspace.objects.filter((object) => object.id !== id),
        scenes: workspace.scenes.map((scene) => ({
          ...scene,
          members: scene.members.filter((member) => member.objectId !== id),
          connections: scene.connections.filter((connection) => connection.fromObjectId !== id && connection.toObjectId !== id),
        })),
      });
    },
    restoreVersion: (objectId, versionId) => {
      const objects = workspace.objects.map((object) => {
        if (object.id !== objectId) return object;
        const source = object.versions.find((version) => version.id === versionId);
        if (!source) return object;
        const restored = { ...object, ...snapshotOf(source.snapshot), updatedAt: new Date().toISOString() };
        return {
          ...restored,
          versions: [...object.versions, makeVersion(object.versions.length + 1, restored, `Restored from v${source.number}`)],
        };
      });
      commit({ ...workspace, objects });
    },
    saveScene: (scene) => {
      const existing = workspace.scenes.find((item) => item.id === scene.id);
      const now = new Date().toISOString();
      const saved: StudioScene = {
        ...scene,
        createdAt: existing?.createdAt ?? scene.createdAt ?? now,
        updatedAt: now,
      };
      commit({
        ...workspace,
        scenes: [saved, ...workspace.scenes.filter((item) => item.id !== scene.id)],
      });
    },
    deleteScene: (id) => commit({ ...workspace, scenes: workspace.scenes.filter((scene) => scene.id !== id) }),
  }), [workspace, storageError]);

  return createElement(StudioStoreContext.Provider, { value }, children);
}

export function useStudioWorkspace() {
  const value = useContext(StudioStoreContext);
  if (!value) throw new Error("useStudioWorkspace must be used inside StudioStoreProvider");
  return value;
}
