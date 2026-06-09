import { useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { readStore, writeStore } from "../lib/storage";
import type { AppUser, Camera, EmailRegistryEntry, EventItem, Profile, Recording, Site, ViewName } from "../types";

type DashboardProps = {
  user: AppUser;
  site: Site;
  cameras: Camera[];
  recordings: Recording[];
  events: EventItem[];
  profile: Profile;
  emailRegistry: EmailRegistryEntry[];
  activeView: ViewName;
  activeCamera: Camera;
  onViewChange: (view: ViewName) => void;
  onCameraChange: (camera: Camera) => void;
  onLogout: () => Promise<void>;
  onSaveProfile: (profile: Profile) => Promise<void>;
  onToast: (message: string) => void;
};

type CameraProfileDraft = {
  name: string;
  ip: string;
  username: string;
  password: string;
  channel: string;
};

type CameraProfile = {
  id: string;
  code: string;
  name: string;
  ip: string;
  username: string;
  password: string;
  channel: string;
  subtype: string;
  status: "Online";
  createdAt: string;
  lastStartedAt?: string;
};

type ActivityItem = EventItem & {
  id: string;
};

type GridLayoutState = {
  active: boolean;
  presetId: string;
  slots: Array<string | null>;
};

const cameraProfilesStoragePrefix = "vizex_camera_profiles_v1";
const cameraActivityStoragePrefix = "vizex_camera_activity_v1";
const gridLayoutStoragePrefix = "vizex_grid_layout_v1";

const defaultCameraProfileDraft: CameraProfileDraft = {
  name: "",
  ip: "192.168.8.10",
  username: "",
  password: "",
  channel: "1"
};

const emptyCamera: Camera = {
  id: "empty-camera",
  sort_order: 1,
  code: "CAM-00",
  name: "Nav pievienota kamera",
  location: "Kameru pārvaldība",
  model: "Dahua IP kamera",
  status: "Gaida pievienošanu",
  quality: "MJPEG"
};

const serverCatalog = [
  {
    id: "srv-riga-01",
    name: "Riga Core Server",
    type: "Cloud arhīvs",
    status: "Online",
    cameraLimit: 24,
    storage: "14 TB",
    archive: "30 dienas",
    latency: "18 ms"
  },
  {
    id: "srv-edge-02",
    name: "Edge Backup Node",
    type: "Lokāls NVR",
    status: "Online",
    cameraLimit: 16,
    storage: "8 TB",
    archive: "14 dienas",
    latency: "7 ms"
  }
];

const gridPresets = [
  { id: "1x1", label: "1x1", detail: "1 kamera", rows: 1, columns: 1 },
  { id: "1x2", label: "1x2", detail: "2 kameras", rows: 1, columns: 2 },
  { id: "1x3", label: "1x3", detail: "3 kameras", rows: 1, columns: 3 },
  { id: "1x4", label: "1x4", detail: "4 kameras", rows: 1, columns: 4 },
  { id: "2x2", label: "2x2", detail: "4 kameras", rows: 2, columns: 2 },
  { id: "2x3", label: "2x3", detail: "6 kameras", rows: 2, columns: 3 },
  { id: "2x4", label: "2x4", detail: "8 kameras", rows: 2, columns: 4 },
  { id: "3x3", label: "3x3", detail: "9 kameras", rows: 3, columns: 3 },
  { id: "4x4", label: "4x4", detail: "16 kameras", rows: 4, columns: 4 },
  { id: "5x5", label: "5x5", detail: "25 kameras", rows: 5, columns: 5 },
  { id: "10x10", label: "10x10", detail: "100 kameras", rows: 10, columns: 10 }
];

function statusPill(status: string) {
  const warning = !["Online", "online", "active", "Savienota", "Tunelis aktīvs"].includes(status);
  return <span className={`pill ${warning ? "warning" : ""}`}>{status}</span>;
}

function cameraNumber(camera: Camera) {
  return String(camera.sort_order ?? camera.id ?? 1).padStart(2, "0");
}

function cameraPing(camera: Camera) {
  return `${(Number(camera.sort_order ?? camera.id ?? 1) * 7) + 5} ms`;
}

function capacityPercent(used: number, limit: number) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function scopedKey(prefix: string, user: AppUser) {
  return `${prefix}:${user.email}`;
}

function currentTimeLabel() {
  return new Date().toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit" });
}

function createActivity(message: string): ActivityItem {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: currentTimeLabel(),
    message
  };
}

function buildDahuaGatewayUrl(profile: CameraProfile) {
  const params = new URLSearchParams({
    ip: normalizeCameraIp(profile.ip),
    port: "80",
    user: profile.username,
    pass: profile.password,
    channel: profile.channel || "1",
    subtype: profile.subtype || "1"
  });

  return `/api/dahua/mjpeg?${params.toString()}`;
}

function normalizeCameraIp(value: string) {
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

function profileToCamera(profile: CameraProfile, index: number): Camera {
  return {
    id: profile.id,
    sort_order: index + 1,
    code: profile.code,
    name: profile.name,
    location: normalizeCameraIp(profile.ip),
    model: "Dahua IP kamera",
    status: profile.status,
    quality: `CH ${profile.channel || "1"} / SUB ${profile.subtype || "1"}`
  };
}

function nextCameraCode(profiles: CameraProfile[]) {
  const nextNumber = profiles.reduce((max, profile) => {
    const match = profile.code.match(/CAM-(\d+)/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;

  return `CAM-${String(nextNumber).padStart(2, "0")}`;
}

function readGridLayout(user: AppUser): GridLayoutState {
  const saved = readStore<GridLayoutState | null>(scopedKey(gridLayoutStoragePrefix, user), null);
  if (!saved) return { active: false, presetId: "2x2", slots: [] };
  const presetExists = gridPresets.some((preset) => preset.id === saved.presetId);
  return {
    active: Boolean(saved.active),
    presetId: presetExists ? saved.presetId : "2x2",
    slots: Array.isArray(saved.slots) ? saved.slots : []
  };
}

export function Dashboard({
  user,
  site,
  recordings,
  profile,
  emailRegistry,
  activeView,
  activeCamera: activeCameraFromApp,
  onViewChange,
  onCameraChange,
  onLogout,
  onSaveProfile,
  onToast
}: DashboardProps) {
  const [recordingQuery, setRecordingQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("Šodien");
  const [profileDraft, setProfileDraft] = useState<Profile>(profile);
  const [activeServerId, setActiveServerId] = useState(serverCatalog[0].id);
  const [poweredOffCameraCodes, setPoweredOffCameraCodes] = useState<string[]>([]);
  const [gridPopupOpen, setGridPopupOpen] = useState(false);
  const [customGridActive, setCustomGridActive] = useState(() => readGridLayout(user).active);
  const [activeGridPresetId, setActiveGridPresetId] = useState(() => readGridLayout(user).presetId);
  const [gridSlots, setGridSlots] = useState<Array<string | null>>(() => readGridLayout(user).slots);
  const [cameraProfiles, setCameraProfiles] = useState<CameraProfile[]>(() => readStore<CameraProfile[]>(scopedKey(cameraProfilesStoragePrefix, user), []));
  const [activityItems, setActivityItems] = useState<ActivityItem[]>(() => readStore<ActivityItem[]>(scopedKey(cameraActivityStoragePrefix, user), []));
  const [cameraDraft, setCameraDraft] = useState<CameraProfileDraft>(defaultCameraProfileDraft);
  const [activeCameraCode, setActiveCameraCode] = useState(activeCameraFromApp.code);
  const [recordingCameraCode, setRecordingCameraCode] = useState(activeCameraFromApp.code);

  useEffect(() => {
    setProfileDraft(profile);
  }, [profile]);

  const isAdmin = user.role === "admin";
  const managedCameras = useMemo(
    () => cameraProfiles.map((cameraProfile, index) => profileToCamera(cameraProfile, index)),
    [cameraProfiles]
  );
  const assignedCameraCount = managedCameras.length;
  const activeGridPreset = gridPresets.find((preset) => preset.id === activeGridPresetId) ?? gridPresets[4];
  const gridSlotCount = activeGridPreset.rows * activeGridPreset.columns;
  const gridDensityClass = gridSlotCount > 36 ? "dense" : gridSlotCount > 16 ? "compact" : "";
  const gridRowMinHeight = gridSlotCount > 36 ? "28px" : gridSlotCount > 16 ? "42px" : "64px";
  const customGridSlots = useMemo(
    () => Array.from({ length: gridSlotCount }, (_, index) => {
      const cameraCode = gridSlots[index];
      return cameraCode ? managedCameras.find((camera) => camera.code === cameraCode) ?? null : null;
    }),
    [gridSlotCount, gridSlots, managedCameras]
  );
  const filteredRecordings = useMemo(() => {
    const query = recordingQuery.toLowerCase();
    if (!managedCameras.length) return [];
    return recordings.filter((item) => (
      managedCameras.some((camera) => item.camera.includes(camera.code)) && item.camera.toLowerCase().includes(query)
    ));
  }, [managedCameras, recordingQuery, recordings]);
  const activeCamera = managedCameras.find((camera) => camera.code === activeCameraCode) ?? managedCameras[0] ?? emptyCamera;
  const activeCameraProfile = cameraProfiles.find((cameraProfile) => cameraProfile.code === activeCamera.code) ?? null;
  const activeRecordingCamera = managedCameras.find((camera) => camera.code === recordingCameraCode) ?? activeCamera;
  const activeRecordingCameraProfile = cameraProfiles.find((cameraProfile) => cameraProfile.code === activeRecordingCamera.code) ?? null;
  const activeCameraDirectUrl = activeCameraProfile ? buildDahuaGatewayUrl(activeCameraProfile) : "";
  const recordingCameraDirectUrl = activeRecordingCameraProfile ? buildDahuaGatewayUrl(activeRecordingCameraProfile) : "";
  const cameraCodes = useMemo(() => managedCameras.map((camera) => camera.code), [managedCameras]);
  const overviewJournalItems = useMemo(() => (
    activityItems.length
      ? activityItems.slice(0, 6).map((item) => ({ time: item.time, type: "Notikums", message: item.message, level: "ok" }))
      : [{ time: currentTimeLabel(), type: "Sistēma", message: "Kameru pārvaldība gatava. Pievieno pirmo kameru.", level: "warning" }]
  ), [activityItems]);
  const networkDevices = useMemo(() => {
    const cameraRows = managedCameras.slice(0, 5).map((camera) => ({
      name: `${camera.code} ${camera.name}`,
      detail: `${camera.location} | ${camera.status}`,
      status: camera.status === "Online" ? "ok" : "warning"
    }));

    return [
      { name: "Lokālais tīkls", detail: "Kameru savienojumi tiek pārbaudīti no šī datora", status: "ok" },
      ...(cameraRows.length ? cameraRows : [{ name: "Kameras", detail: "Nav pievienotu kameru", status: "warning" }]),
      { name: "VIZEX platforma", detail: "Kameru profili sinhronizēti lokāli", status: "ok" }
    ];
  }, [managedCameras]);

  useEffect(() => {
    writeStore(scopedKey(cameraProfilesStoragePrefix, user), cameraProfiles);
  }, [cameraProfiles, user]);

  useEffect(() => {
    writeStore(scopedKey(cameraActivityStoragePrefix, user), activityItems.slice(0, 30));
  }, [activityItems, user]);

  useEffect(() => {
    writeStore<GridLayoutState>(scopedKey(gridLayoutStoragePrefix, user), {
      active: customGridActive,
      presetId: activeGridPreset.id,
      slots: gridSlots.slice(0, gridSlotCount)
    });
  }, [activeGridPreset.id, customGridActive, gridSlotCount, gridSlots, user]);

  useEffect(() => {
    if (!cameraProfiles.length) {
      setGridSlots((current) => current.map(() => null));
      return;
    }

    if (!cameraCodes.includes(activeCameraCode)) {
      setActiveCameraCode(cameraCodes[0]);
      onCameraChange(managedCameras[0]);
    }

    if (!cameraCodes.includes(recordingCameraCode)) {
      setRecordingCameraCode(cameraCodes[0]);
    }

    setGridSlots((current) => current.map((code) => (code && cameraCodes.includes(code) ? code : null)));
  }, [activeCameraCode, cameraCodes, cameraProfiles.length, managedCameras, onCameraChange, recordingCameraCode]);

  const navItems: Array<{ view: ViewName; label: string; caption: string }> = [
    { view: "overview", label: "Pārskats", caption: "Sistēmas statuss" },
    { view: "live", label: "Tiešraide", caption: "Video režģis" },
    { view: "recordings", label: "Ieraksti", caption: "Video arhīvs" },
    { view: "servers", label: "Serveri", caption: "Kvotas un arhīvs" },
    { view: "profile", label: "Profils", caption: "Klienta dati" }
  ];

  if (isAdmin) {
    navItems.push({ view: "admin", label: "Admin", caption: "Klienti un resursi" });
  }

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    onSaveProfile(profileDraft);
  }

  function updateProfile(field: keyof Profile, value: string) {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  }

  function appendActivity(message: string) {
    const nextActivity = createActivity(message);
    setActivityItems((current) => [nextActivity, ...current].slice(0, 30));
  }

  function selectCamera(camera: Camera) {
    setActiveCameraCode(camera.code);
    onCameraChange(camera);
  }

  function selectGridPreset(preset: typeof gridPresets[number]) {
    const slotCount = preset.rows * preset.columns;
    setActiveGridPresetId(preset.id);
    setGridSlots((current) => Array.from({ length: slotCount }, (_, index) => current[index] ?? null));
    setCustomGridActive(true);
    setGridPopupOpen(false);
    appendActivity(`Režģis ${preset.label} saglabāts`);
    onToast(`Režģis ${preset.label} izvēlēts un saglabāts`);
  }

  function startCameraDrag(event: DragEvent<HTMLButtonElement>, camera: Camera) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", camera.code);
  }

  function assignCameraToGrid(slotIndex: number, cameraCode: string) {
    const nextCamera = managedCameras.find((camera) => camera.code === cameraCode);
    if (!nextCamera) return;

    setGridSlots((current) => {
      const nextSlots = Array.from({ length: gridSlotCount }, (_, index) => current[index] ?? null);
      nextSlots[slotIndex] = nextCamera.code;
      return nextSlots;
    });
    selectCamera(nextCamera);
    appendActivity(`${nextCamera.code}: kamera ievietota režģa logā ${String(slotIndex + 1).padStart(2, "0")}`);
  }

  function handleGridDrop(event: DragEvent<HTMLDivElement>, slotIndex: number) {
    event.preventDefault();
    const cameraCode = event.dataTransfer.getData("text/plain");
    if (!cameraCode) return;
    assignCameraToGrid(slotIndex, cameraCode);
    onToast(`${cameraCode} ievietota režģī`);
  }

  function isCameraPoweredOff(camera: Camera) {
    return poweredOffCameraCodes.includes(camera.code);
  }

  function toggleCameraPower(camera: Camera) {
    const nextPoweredOff = !isCameraPoweredOff(camera);
    setPoweredOffCameraCodes((current) => (
      nextPoweredOff ? [...current, camera.code] : current.filter((code) => code !== camera.code)
    ));
    appendActivity(`${camera.code}: kamera ${nextPoweredOff ? "izslēgta" : "ieslēgta"}`);
    onToast(`${camera.code} ${nextPoweredOff ? "izslēgta" : "ieslēgta"} prototipa skatā`);
  }

  function getCameraDirectUrl(camera: Camera) {
    const cameraProfile = cameraProfiles.find((profileItem) => profileItem.code === camera.code);
    return cameraProfile ? buildDahuaGatewayUrl(cameraProfile) : "";
  }

  function updateCameraDraft(field: keyof CameraProfileDraft, value: string) {
    setCameraDraft((current) => ({ ...current, [field]: value }));
  }

  function submitCameraProfile(event: FormEvent) {
    event.preventDefault();

    const name = cameraDraft.name.trim();
    const ip = normalizeCameraIp(cameraDraft.ip);
    const username = cameraDraft.username.trim();
    const password = cameraDraft.password;
    const channel = cameraDraft.channel.trim() || "1";

    if (!name || !ip || !username || !password) {
      onToast("Aizpildi nosaukumu, IP, lietotāju un paroli");
      return;
    }

    const duplicateProfile = cameraProfiles.find((profileItem) => profileItem.ip === ip && (profileItem.channel || "1") === channel);
    if (duplicateProfile) {
      onToast(`${duplicateProfile.code} jau izmanto IP ${ip} un kanālu ${channel}`);
      return;
    }

    const code = nextCameraCode(cameraProfiles);
    const profileItem: CameraProfile = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      code,
      name,
      ip,
      username,
      password,
      channel,
      subtype: "1",
      status: "Online",
      createdAt: new Date().toISOString(),
      lastStartedAt: new Date().toISOString()
    };
    const nextCamera = profileToCamera(profileItem, cameraProfiles.length);

    setCameraProfiles((current) => [...current, profileItem]);
    setCameraDraft(defaultCameraProfileDraft);
    setActiveCameraCode(code);
    setRecordingCameraCode(code);
    onCameraChange(nextCamera);
    appendActivity(`${code}: ${name} pievienota kameru pārvaldībā, kanāls ${channel}`);
    onToast(`${code} pievienota un pieslēgta kanālam ${channel}`);
  }

  function activateCameraProfile(profileItem: CameraProfile) {
    const camera = managedCameras.find((item) => item.code === profileItem.code) ?? profileToCamera(profileItem, cameraProfiles.indexOf(profileItem));
    const now = new Date().toISOString();
    setCameraProfiles((current) => current.map((item) => (
      item.id === profileItem.id ? { ...item, lastStartedAt: now, status: "Online" } : item
    )));
    selectCamera(camera);
    appendActivity(`${profileItem.code}: tiešraide palaista`);
    onToast(`${profileItem.code} tiešraide palaista`);
  }

  function removeCameraProfile(profileId: string) {
    const removedProfile = cameraProfiles.find((item) => item.id === profileId);
    if (!removedProfile) return;

    setCameraProfiles((current) => current.filter((item) => item.id !== profileId));
    setGridSlots((current) => current.map((code) => (code === removedProfile.code ? null : code)));
    setPoweredOffCameraCodes((current) => current.filter((code) => code !== removedProfile.code));
    appendActivity(`${removedProfile.code}: ${removedProfile.name} noņemta no kameru pārvaldības`);
    onToast(`${removedProfile.code} noņemta`);
  }

  function renderCameraManagementPanel() {
    return (
      <div className="camera-management-panel live-dahua-panel">
        <div className="camera-management-head">
          <div>
            <span className="eyebrow">Kameru pārvaldība</span>
            <h2>Pievienot Dahua kameru</h2>
          </div>
          <span className="pill">{assignedCameraCount} profili</span>
        </div>
        <form className="camera-management-form" onSubmit={submitCameraProfile}>
          <label>
            Nosaukums
            <input
              value={cameraDraft.name}
              onChange={(event) => updateCameraDraft("name", event.target.value)}
              placeholder="Ieeja, noliktava, pagalms"
              type="text"
            />
          </label>
          <label>
            IP
            <input
              value={cameraDraft.ip}
              onChange={(event) => updateCameraDraft("ip", event.target.value)}
              onBlur={(event) => updateCameraDraft("ip", normalizeCameraIp(event.target.value))}
              placeholder="192.168.8.10"
              type="text"
            />
          </label>
          <label>
            Kanāls
            <input
              value={cameraDraft.channel}
              onChange={(event) => updateCameraDraft("channel", event.target.value.replace(/\D/g, ""))}
              placeholder="1"
              type="text"
            />
          </label>
          <label>
            Lietotājs
            <input
              value={cameraDraft.username}
              onChange={(event) => updateCameraDraft("username", event.target.value)}
              placeholder="admin"
              type="text"
            />
          </label>
          <label>
            Parole
            <input
              value={cameraDraft.password}
              onChange={(event) => updateCameraDraft("password", event.target.value)}
              placeholder="Kameras parole"
              type="password"
            />
          </label>
          <button className="primary-button compact" type="submit">Pievienot kameru</button>
        </form>
        <div className="camera-management-note">
          <span>Channel: <strong>izvēlies formā</strong></span>
          <span>Subtype: <strong>1</strong></span>
          <span>HTTP ports: <strong>80</strong></span>
        </div>
        <div className="camera-profile-list">
          {cameraProfiles.length ? cameraProfiles.map((profileItem) => (
            <div className={`camera-profile-row ${profileItem.code === activeCamera.code ? "active" : ""}`} key={profileItem.id}>
              <span className="camera-number">{profileItem.code.replace("CAM-", "")}</span>
              <span className="camera-profile-main">
                <strong>{profileItem.code} {profileItem.name}</strong>
                <small>{profileItem.ip} | CH {profileItem.channel || "1"} / SUB {profileItem.subtype || "1"}</small>
              </span>
              <button className="ghost-button" onClick={() => activateCameraProfile(profileItem)} type="button">Palaist</button>
              <button className="ghost-button danger" onClick={() => removeCameraProfile(profileItem.id)} type="button">Dzēst</button>
            </div>
          )) : (
            <div className="camera-empty-state">
              <strong>Nav pievienotu kameru</strong>
              <span>Pievieno pirmo Dahua kameru, lai tā parādītos sarakstā, režģī un notikumu žurnālā.</span>
            </div>
          )}
        </div>
        <div className="dahua-action-row">
          <a className={`ghost-button ${activeCameraDirectUrl ? "" : "disabled"}`} href={activeCameraDirectUrl || undefined} rel="noreferrer" target="_blank">
            Atvērt stream
          </a>
          <button
            className="ghost-button"
            onClick={() => {
              if (activeCameraProfile) activateCameraProfile(activeCameraProfile);
            }}
            disabled={!activeCameraProfile}
            type="button"
          >
            Atsvaidzināt tiešraidi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell dashboard-shell">
      <header className="topbar dashboard-topbar">
        <div className="topbar-left">
          <span className="status-dot" />
          <span>{isAdmin ? "ADMIN PORTĀLS" : "KLIENTA PORTĀLS"}</span>
        </div>
        <img className="brand-logo" src="/assets/vizex-logo-transparent.png" alt="VIZEX logo" />
        <div className="profile-actions">
          <span>{isAdmin ? "vizexlatvia@gmail.com" : user.email}</span>
          <button className="ghost-button" onClick={onLogout} type="button">Iziet</button>
        </div>
      </header>

      <aside className="sidebar dashboard-sidebar">
        <div className="client-card dashboard-client-card">
          <span className="eyebrow">{isAdmin ? "VIZEX vadība" : "Klienta objekts"}</span>
          <strong>{isAdmin ? "Administrācijas panelis" : site.address || site.name}</strong>
          <span>{assignedCameraCount} kameras | {site.status}</span>
        </div>

        <nav className="main-nav dashboard-nav" aria-label="Galvenā navigācija">
          {navItems.map((item) => (
            <button
              className={`nav-item ${activeView === item.view ? "active" : ""}`}
              key={item.view}
              onClick={() => onViewChange(item.view)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.caption}</small>
            </button>
          ))}
        </nav>

        <div className="ai-panel service-panel">
          <span className="eyebrow">Platformas statuss</span>
          <strong>Sistēma darbojas</strong>
          <p>Pārskatā redzams notikumu žurnāls un tīkla statuss. Kameru pārvaldība un tiešraide atrodas vienā darba skatā.</p>
        </div>
      </aside>

      <main className="content dashboard-content">
        <section className={`view ${activeView === "overview" ? "active" : ""}`}>
          <div className="section-head dashboard-head">
            <div>
              <span className="eyebrow">VIZEX platforma</span>
              <h1>{isAdmin ? "Admin darba vide" : "Jūsu sistēmas pārskats"}</h1>
            </div>
            <button className="primary-button" onClick={() => onViewChange("live")} type="button">
              Atvērt tiešraidi
            </button>
          </div>

          <div className="dashboard-metrics">
            <div className="metric-card">
              <span>Kameras</span>
              <strong>{assignedCameraCount}</strong>
              <small>Aktīvas klienta objektā</small>
            </div>
            <div className="metric-card">
              <span>Arhīvs</span>
              <strong>30d</strong>
              <small>Maksimālais video glabāšanas logs</small>
            </div>
            <div className="metric-card">
              <span>Sistēma</span>
              <strong>Online</strong>
              <small>Pamatservisi darbojas</small>
            </div>
          </div>

          <div className="overview-grid">
            <section className="ops-panel overview-panel">
              <div className="panel-title-row">
                <div>
                  <span className="eyebrow">Notikumi</span>
                  <h2>Notikumu žurnāls</h2>
                </div>
                <button className="ghost-button" onClick={() => onToast("Notikumu filtri būs nākamajā prototipa solī")} type="button">Filtri</button>
              </div>
              <div className="journal-feed">
                {overviewJournalItems.map((event) => (
                  <div className={`journal-item ${event.level}`} key={`${event.time}-${event.message}`}>
                    <span className="journal-time">{event.time}</span>
                    <span>
                      <strong>{event.type}</strong>
                      <small>{event.message}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="ops-panel overview-panel">
              <div className="panel-title-row">
                <div>
                  <span className="eyebrow">Savienojumi</span>
                  <h2>Tīkls</h2>
                </div>
                <button className="ghost-button" onClick={() => onToast("Tīkla diagnostika būs nākamajā prototipa solī")} type="button">Diagnostika</button>
              </div>
              <div className="network-list">
                {networkDevices.map((device) => (
                  <div className="network-row" key={device.name}>
                    <span className={`network-dot ${device.status}`} />
                    <span>
                      <strong>{device.name}</strong>
                      <small>{device.detail}</small>
                    </span>
                  </div>
                ))}
              </div>
              <div className="network-legend">
                <span><i className="network-dot ok" />Viss kārtībā</span>
                <span><i className="network-dot warning" />Kļūda</span>
                <span><i className="network-dot danger" />Nedarbojas</span>
              </div>
            </section>
          </div>
        </section>

        <section className={`view ${activeView === "live" ? "active" : ""}`}>
          <div className="section-head dashboard-head">
            <div>
              <span className="eyebrow">Tiešraide</span>
              <h1>Dzīvā video kontrole</h1>
            </div>
            <div className="toolbar">
              <div className="grid-menu-wrap">
                <button
                  aria-expanded={gridPopupOpen}
                  className={`icon-button grid-toggle ${gridPopupOpen || customGridActive ? "active" : ""}`}
                  onClick={() => setGridPopupOpen((value) => !value)}
                  type="button"
                >
                  <span className="grid-icon" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>Režģis</span>
                </button>
                {gridPopupOpen && (
                  <div className="grid-popup">
                    <div className="grid-popup-head">
                      <strong>Režģa skats</strong>
                      <span>Izvēlies gatavu maketu</span>
                    </div>
                    <div className="grid-preset-list">
                      {gridPresets.map((preset) => (
                        <button
                          className={`grid-preset ${activeGridPreset.id === preset.id ? "active" : ""}`}
                          key={preset.id}
                          onClick={() => selectGridPreset(preset)}
                          type="button"
                        >
                          <span className="preset-mini-grid" style={{ gridTemplateColumns: `repeat(${Math.min(preset.columns, 4)}, 1fr)` }}>
                            {Array.from({ length: Math.min(preset.rows * preset.columns, 16) }, (_, index) => <i key={`${preset.id}-${index}`} />)}
                          </span>
                          <span>
                            <strong>{preset.label}</strong>
                            <small>{preset.detail}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="live-layout">
            <div className="video-stage">
              {customGridActive ? (
                <div
                  className={`custom-video-grid ${gridDensityClass}`}
                  style={{
                    gridTemplateColumns: `repeat(${activeGridPreset.columns}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${activeGridPreset.rows}, minmax(${gridRowMinHeight}, 1fr))`
                  }}
                >
                  {customGridSlots.map((camera, index) => {
                    const poweredOff = camera ? isCameraPoweredOff(camera) : false;
                    const cameraDirectUrl = camera ? getCameraDirectUrl(camera) : "";
                    return (
                      <div
                        className={`grid-slot ${camera ? "filled" : ""} ${poweredOff ? "offline" : ""}`}
                        key={`grid-slot-${index}`}
                        onClick={() => camera && onCameraChange(camera)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={(event) => handleGridDrop(event, index)}
                      >
                        {camera ? (
                          <>
                            {cameraDirectUrl && !poweredOff && (
                              <img className="stream-frame mjpeg-frame" src={cameraDirectUrl} alt={`${camera.code} direct stream`} />
                            )}
                            <div className="video-noise" />
                            <div className="tile-actions">
                              <button
                                aria-label={`${camera.code} ieslēgt vai izslēgt`}
                                className={`tile-power ${poweredOff ? "off" : ""}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleCameraPower(camera);
                                }}
                                type="button"
                              >
                                <span className="power-icon" aria-hidden="true" />
                              </button>
                              <button
                                aria-label={`${camera.code} iestatījumi`}
                                className="tile-gear"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToast(`${camera.code} iestatījumu logs būs nākamajā solī`);
                                }}
                                type="button"
                              >
                                <span aria-hidden="true">⚙</span>
                              </button>
                            </div>
                            <span className="tile-camera-label">
                              <strong>{cameraNumber(camera)} {camera.name}</strong>
                              <small>{camera.code}</small>
                            </span>
                            <span className="tile-ping">{cameraPing(camera)}</span>
                          </>
                        ) : (
                          <span className="empty-slot-copy">
                            <strong>Logs {String(index + 1).padStart(2, "0")}</strong>
                            <small>Tukšs</small>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`video-main ${isCameraPoweredOff(activeCamera) ? "offline" : ""}`}>
                  {activeCameraDirectUrl && !isCameraPoweredOff(activeCamera) && (
                    <img className="stream-frame mjpeg-frame" src={activeCameraDirectUrl} alt={`${activeCamera.code} direct stream`} />
                  )}
                  <div className="video-noise" />
                  <div className="video-reticle" />
                  {activeCameraProfile && (
                    <div className="tile-actions main-actions">
                      <button
                        aria-label={`${activeCamera.code} ieslēgt vai izslēgt`}
                        className={`tile-power ${isCameraPoweredOff(activeCamera) ? "off" : ""}`}
                        onClick={() => toggleCameraPower(activeCamera)}
                        type="button"
                      >
                        <span className="power-icon" aria-hidden="true" />
                      </button>
                      <button
                        aria-label={`${activeCamera.code} iestatījumi`}
                        className="tile-gear"
                        onClick={() => onToast(`${activeCamera.code} iestatījumu logs būs nākamajā solī`)}
                        type="button"
                      >
                        <span aria-hidden="true">⚙</span>
                      </button>
                    </div>
                  )}
                  <span className="tile-camera-label main-label">
                    <strong>{cameraNumber(activeCamera)} {activeCamera.name}</strong>
                    <small>{activeCamera.code} | {activeCamera.model}</small>
                  </span>
                  <span className="tile-ping main-ping">{cameraPing(activeCamera)}</span>
                </div>
              )}
              {renderCameraManagementPanel()}
            </div>

            <aside className="details-panel">
              <div className="panel-section">
                <span className="eyebrow">Kameras</span>
                <h2>Kameru saraksts</h2>
                <div className="camera-list">
                  {managedCameras.length ? managedCameras.map((camera) => (
                    <button
                      className={`camera-button ${camera.code === activeCamera.code ? "active" : ""}`}
                      draggable
                      key={camera.code}
                      onClick={() => selectCamera(camera)}
                      onDragStart={(event) => startCameraDrag(event, camera)}
                      type="button"
                    >
                      <span className="camera-number">{cameraNumber(camera)}</span>
                      <span className="camera-info">
                        <strong>{camera.name}</strong>
                        <span>{camera.location}</span>
                      </span>
                      {statusPill(camera.status)}
                    </button>
                  )) : (
                    <div className="camera-empty-state compact">
                      <strong>Nav pievienotu kameru</strong>
                      <span>Pievieno kameru zem video laukuma.</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="panel-section">
                <span className="eyebrow">Pēdējās aktivitātes</span>
                <div className="event-feed compact">
                  {activityItems.length ? activityItems.slice(0, 6).map((event) => (
                    <div className="event-item" key={`${event.time}-${event.message}`}>
                      <strong>{event.time}</strong>
                      <span>{event.message}</span>
                    </div>
                  )) : (
                    <div className="camera-empty-state compact">
                      <strong>Notikumu vēl nav</strong>
                      <span>Kameras pievienošana, palaišana un režģa darbības parādīsies šeit.</span>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className={`view ${activeView === "recordings" ? "active" : ""}`}>
          <div className="section-head dashboard-head">
            <div>
              <span className="eyebrow">Video arhīvs</span>
              <h1>Ieraksti</h1>
            </div>
            <div className="toolbar">
              <input className="search-input" value={recordingQuery} onChange={(event) => setRecordingQuery(event.target.value)} type="search" placeholder="Meklēt kameru" />
              <button className="primary-button" onClick={() => onToast("Eksporta pieprasījums sagatavots")} type="button">Eksportēt</button>
            </div>
          </div>

          <div className="recording-layout">
            <div className="timeline-panel">
              <div className="date-row">
                {["Šodien", "Vakar", "7 dienas"].map((filter) => (
                  <button
                    className={`date-chip ${dateFilter === filter ? "active" : ""}`}
                    key={filter}
                    onClick={() => {
                      setDateFilter(filter);
                      onToast(`Filtrs: ${filter}`);
                    }}
                    type="button"
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div className="timeline">
                {[8, 24, 41, 68, 87].map((left) => <span key={left} style={{ left: `${left}%` }} />)}
              </div>
              <div className="archive-stream-panel">
                <div className="panel-title-row">
                  <div>
                    <span className="eyebrow">Stream pārbaude</span>
                    <h2>Stream pārbaude</h2>
                  </div>
                  {recordingCameraDirectUrl && <span className="pill">{activeRecordingCamera.code}</span>}
                </div>
                <label>
                  Kamera
                  <select value={activeRecordingCamera.code} onChange={(event) => setRecordingCameraCode(event.target.value)}>
                    {managedCameras.length ? managedCameras.map((camera) => <option key={camera.code} value={camera.code}>{camera.code} - {camera.name}</option>) : (
                      <option value={emptyCamera.code}>Nav pievienotu kameru</option>
                    )}
                  </select>
                </label>
                {recordingCameraDirectUrl ? (
                  <div className="archive-frame-wrap">
                    <img className="archive-frame mjpeg-frame" src={recordingCameraDirectUrl} alt={`${activeRecordingCamera.code} direct stream`} />
                  </div>
                ) : (
                  <div className="archive-empty">
                    <strong>Nav piesaistīta plūsma</strong>
                    <span>{activeRecordingCamera.code} lokālo Dahua testu palaid Tiešraides sadaļā.</span>
                  </div>
                )}
              </div>
            </div>
            <div className="recording-list">
              {filteredRecordings.map((item) => (
                <button className="recording-item" key={`${item.time}-${item.camera}`} onClick={() => onToast(`Atvērts ieraksts ${item.time}`)} type="button">
                  <span className="recording-time">{item.time}</span>
                  <span>
                    <strong>{item.camera}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="pill">{item.length}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={`view ${activeView === "servers" ? "active" : ""}`}>
          <div className="section-head dashboard-head">
            <div>
              <span className="eyebrow">Serveru resursi</span>
              <h1>Klientam piešķirtie serveri</h1>
            </div>
            <button className="primary-button" onClick={() => onToast("Servera pieprasījums sagatavots adminam")} type="button">Pieprasīt serveri</button>
          </div>

          <div className="server-grid">
            {serverCatalog.map((server, index) => {
              const used = index === 0 ? Math.min(assignedCameraCount, server.cameraLimit) : 4;
              const percent = capacityPercent(used, server.cameraLimit);
              return (
                <section className={`server-card ${activeServerId === server.id ? "active" : ""}`} key={server.id}>
                  <div className="panel-title-row">
                    <div>
                      <span className="eyebrow">{server.type}</span>
                      <h2>{server.name}</h2>
                    </div>
                    {statusPill(server.status)}
                  </div>
                  <div className="server-specs">
                    <span><strong>{used}/{server.cameraLimit}</strong><small>Kameras</small></span>
                    <span><strong>{server.storage}</strong><small>Krātuve</small></span>
                    <span><strong>{server.latency}</strong><small>Latence</small></span>
                  </div>
                  <span className="capacity-bar"><i style={{ width: `${percent}%` }} /></span>
                  <button className="ghost-button" onClick={() => setActiveServerId(server.id)} type="button">Izvēlēties serveri</button>
                </section>
              );
            })}
          </div>
        </section>

        <section className={`view ${activeView === "profile" ? "active" : ""}`}>
          <div className="section-head dashboard-head">
            <div>
              <span className="eyebrow">Klienta profils</span>
              <h1>Profila dati un piekļuve</h1>
            </div>
            <button className="primary-button" form="profileForm" type="submit">Saglabāt profilu</button>
          </div>

          <div className="profile-layout">
            <form className="profile-panel" id="profileForm" onSubmit={submitProfile}>
              <label>
                Konta e-pasts
                <input type="email" value={user.email} readOnly />
              </label>
              <label>
                Uzņēmuma vai objekta nosaukums
                <input value={profileDraft.company} onChange={(event) => updateProfile("company", event.target.value)} type="text" maxLength={80} autoComplete="organization" />
              </label>
              <label>
                Kontaktpersona
                <input value={profileDraft.contact} onChange={(event) => updateProfile("contact", event.target.value)} type="text" maxLength={80} autoComplete="name" />
              </label>
              <label>
                Objekta adrese
                <input value={profileDraft.address} onChange={(event) => updateProfile("address", event.target.value)} type="text" maxLength={120} autoComplete="street-address" />
              </label>
              <p className="privacy-note">Profils neglabā personas kodu, maksājumu kartes, video paroles vai citas liekas sensitīvas detaļas.</p>
            </form>

            <aside className="profile-panel">
              <span className="eyebrow">Piekļuves politika</span>
              <div className="config-steps">
                <span>Klienta panelis redz tikai savus serverus</span>
                <span>Admin panelis piešķir serveru un kameru limitus</span>
                <span>P2P/SN ierīces jāapstiprina drošā reģistrā</span>
              </div>
            </aside>
          </div>
        </section>

        {isAdmin && (
          <section className={`view ${activeView === "admin" ? "active" : ""}`}>
            <div className="section-head dashboard-head">
              <div>
                <span className="eyebrow">Admin portāls</span>
                <h1>Klienti, serveri un kvotas</h1>
              </div>
              <button className="primary-button" onClick={() => onToast("Jauna klienta izveide būs nākamais admin solis")} type="button">Jauns klients</button>
            </div>

            <div className="admin-grid">
              <div className="metric-card">
                <span>Klienti</span>
                <strong>{Math.max(emailRegistry.length, 1)}</strong>
                <small>Reģistrēti Supabase</small>
              </div>
              <div className="metric-card">
                <span>Serveru fonds</span>
                <strong>{serverCatalog.length}</strong>
                <small>Piešķirami klientiem</small>
              </div>
              <div className="metric-card">
                <span>Kameras limits</span>
                <strong>{serverCatalog.reduce((sum, server) => sum + server.cameraLimit, 0)}</strong>
                <small>Kopējā prototipa kapacitāte</small>
              </div>
            </div>

            <div className="admin-panels">
              <section className="table-panel">
                <div className="table-row table-head">
                  <span>E-pasts</span>
                  <span>Loma</span>
                  <span>Statuss</span>
                  <span>Izveidots</span>
                </div>
                {(emailRegistry.length ? emailRegistry : [{ email: "client@vizex.app", role: "client", status: "demo", created_at: new Date().toISOString() } as EmailRegistryEntry]).map((entry) => (
                  <div className="table-row" key={entry.email}>
                    <span>{entry.email}</span>
                    <span>{entry.role}</span>
                    <span>{statusPill(entry.status)}</span>
                    <span>{new Date(entry.created_at).toLocaleDateString("lv-LV")}</span>
                  </div>
                ))}
              </section>

              <aside className="ops-panel">
                <span className="eyebrow">Admin nākamie soļi</span>
                <div className="config-steps">
                  <span>Klientam piešķirt serveru skaitu</span>
                  <span>Noteikt kameru limitu katram serverim</span>
                  <span>Apstiprināt P2P/SN ierīces</span>
                  <span>Redzēt datu plūsmas un arhīva noslodzi</span>
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
