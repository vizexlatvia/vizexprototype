import { readStore, writeStore } from "./storage";
import { supabase } from "./supabase";
import type { AppUser, EventItem } from "../types";

export type CameraProfile = {
  id: string;
  code: string;
  name: string;
  ip: string;
  username: string;
  password: string;
  channel: string;
  subtype: string;
  remoteGatewayUrl?: string;
  remoteGatewayToken?: string;
  status: "Online";
  createdAt: string;
  lastStartedAt?: string;
};

export type ActivityItem = EventItem & {
  id: string;
};

export type GridLayoutState = {
  active: boolean;
  presetId: string;
  slots: Array<string | null>;
};

export type ClientWorkspaceState = {
  cameraProfiles: CameraProfile[];
  activityItems: ActivityItem[];
  gridLayout: GridLayoutState;
};

const maxActivityItems = 7;

const workspaceCachePrefix = "vizex_camera_workspace_cache_v1";
const legacyCameraProfilesStoragePrefix = "vizex_camera_profiles_v1";
const legacyCameraActivityStoragePrefix = "vizex_camera_activity_v1";
const legacyGridLayoutStoragePrefix = "vizex_grid_layout_v1";

function scopedKey(prefix: string, user: AppUser) {
  return `${prefix}:${user.email}`;
}

export function normalizeCameraIp(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).hostname;
    }
  } catch {
    return trimmed;
  }

  return trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export function normalizeGatewayBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

export function defaultGridLayoutState(): GridLayoutState {
  return {
    active: false,
    presetId: "2x2",
    slots: []
  };
}

function sanitizeCameraProfile(item: unknown, index: number): CameraProfile | null {
  if (!item || typeof item !== "object") return null;

  const source = item as Partial<CameraProfile>;
  const name = String(source.name ?? "").trim();
  const ip = normalizeCameraIp(String(source.ip ?? ""));
  const username = String(source.username ?? "").trim();
  const password = String(source.password ?? "");
  const channel = String(source.channel ?? "1").replace(/\D/g, "") || "1";
  const subtype = String(source.subtype ?? "1").replace(/\D/g, "") || "1";
  const remoteGatewayUrl = normalizeGatewayBaseUrl(String(source.remoteGatewayUrl ?? ""));
  const remoteGatewayToken = String(source.remoteGatewayToken ?? "").trim();

  if (!name || !ip || !username || !password) return null;

  return {
    id: String(source.id ?? `${Date.now()}-${index}`),
    code: String(source.code ?? `CAM-${String(index + 1).padStart(2, "0")}`),
    name,
    ip,
    username,
    password,
    channel,
    subtype,
    remoteGatewayUrl,
    remoteGatewayToken,
    status: "Online",
    createdAt: String(source.createdAt ?? new Date().toISOString()),
    lastStartedAt: source.lastStartedAt ? String(source.lastStartedAt) : undefined
  };
}

function sanitizeActivityItem(item: unknown, index: number): ActivityItem | null {
  if (!item || typeof item !== "object") return null;

  const source = item as Partial<ActivityItem>;
  const message = String(source.message ?? "").trim();
  const time = String(source.time ?? "").trim();

  if (!message || !time) return null;

  return {
    id: String(source.id ?? `${Date.now()}-${index}`),
    time,
    message
  };
}

export function sanitizeGridLayout(item: unknown): GridLayoutState {
  if (!item || typeof item !== "object") return defaultGridLayoutState();

  const source = item as Partial<GridLayoutState>;
  return {
    active: Boolean(source.active),
    presetId: typeof source.presetId === "string" && source.presetId ? source.presetId : "2x2",
    slots: Array.isArray(source.slots)
      ? source.slots.map((value) => (typeof value === "string" && value ? value : null))
      : []
  };
}

function sanitizeWorkspaceState(state: Partial<ClientWorkspaceState> | null | undefined): ClientWorkspaceState {
  return {
    cameraProfiles: Array.isArray(state?.cameraProfiles)
      ? state.cameraProfiles.map(sanitizeCameraProfile).filter(Boolean) as CameraProfile[]
      : [],
    activityItems: Array.isArray(state?.activityItems)
      ? state.activityItems.map(sanitizeActivityItem).filter(Boolean).slice(0, maxActivityItems) as ActivityItem[]
      : [],
    gridLayout: sanitizeGridLayout(state?.gridLayout)
  };
}

function hasWorkspaceContent(state: ClientWorkspaceState) {
  return state.cameraProfiles.length > 0 || state.activityItems.length > 0 || state.gridLayout.slots.some(Boolean);
}

function readLegacyWorkspaceCache(user: AppUser): ClientWorkspaceState {
  return sanitizeWorkspaceState({
    cameraProfiles: readStore<CameraProfile[]>(scopedKey(legacyCameraProfilesStoragePrefix, user), []),
    activityItems: readStore<ActivityItem[]>(scopedKey(legacyCameraActivityStoragePrefix, user), []),
    gridLayout: readStore<GridLayoutState>(scopedKey(legacyGridLayoutStoragePrefix, user), defaultGridLayoutState())
  });
}

export function readWorkspaceCache(user: AppUser): ClientWorkspaceState {
  const combined = readStore<ClientWorkspaceState | null>(scopedKey(workspaceCachePrefix, user), null);
  if (combined) return sanitizeWorkspaceState(combined);
  return readLegacyWorkspaceCache(user);
}

export function writeWorkspaceCache(user: AppUser, state: ClientWorkspaceState) {
  const normalizedState = sanitizeWorkspaceState(state);

  writeStore(scopedKey(workspaceCachePrefix, user), normalizedState);
  writeStore(scopedKey(legacyCameraProfilesStoragePrefix, user), normalizedState.cameraProfiles);
  writeStore(scopedKey(legacyCameraActivityStoragePrefix, user), normalizedState.activityItems);
  writeStore(scopedKey(legacyGridLayoutStoragePrefix, user), normalizedState.gridLayout);
}

export async function saveWorkspaceState(user: AppUser, state: ClientWorkspaceState) {
  const normalizedState = sanitizeWorkspaceState(state);
  writeWorkspaceCache(user, normalizedState);

  const { error } = await supabase
    .from("client_workspace_state")
    .upsert({
      user_id: user.id,
      email: user.email,
      camera_profiles: normalizedState.cameraProfiles,
      activity_items: normalizedState.activityItems,
      grid_layout: normalizedState.gridLayout,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

  if (error) {
    console.warn("Workspace sync failed:", error.message);
    return false;
  }

  return true;
}

export async function loadWorkspaceState(user: AppUser): Promise<{
  state: ClientWorkspaceState;
  source: "cloud" | "local";
  syncEnabled: boolean;
}> {
  const localState = readWorkspaceCache(user);
  const { data, error } = await supabase
    .from("client_workspace_state")
    .select("camera_profiles, activity_items, grid_layout")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("Workspace cloud load failed:", error.message);
    return {
      state: localState,
      source: "local",
      syncEnabled: false
    };
  }

  if (!data) {
    if (hasWorkspaceContent(localState)) {
      const bootstrapped = await saveWorkspaceState(user, localState);
      return {
        state: localState,
        source: bootstrapped ? "cloud" : "local",
        syncEnabled: bootstrapped
      };
    }

    return {
      state: localState,
      source: "local",
      syncEnabled: true
    };
  }

  const cloudState = sanitizeWorkspaceState({
    cameraProfiles: data.camera_profiles as CameraProfile[],
    activityItems: data.activity_items as ActivityItem[],
    gridLayout: data.grid_layout as GridLayoutState
  });

  writeWorkspaceCache(user, cloudState);

  return {
    state: cloudState,
    source: "cloud",
    syncEnabled: true
  };
}
