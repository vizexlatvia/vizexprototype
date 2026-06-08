import { useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";
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

type ConnectionMode = "ip" | "serial" | "p2p";

type StreamSettings = {
  mediaHost: string;
  webrtcPort: string;
  hlsPort: string;
  paths: Record<string, string>;
  directUrls: Record<string, string>;
};

const streamSettingsStorageKey = "vizex_mediamtx_stream_settings";

const defaultStreamSettings: StreamSettings = {
  mediaHost: "http://127.0.0.1",
  webrtcPort: "8889",
  hlsPort: "8888",
  paths: {},
  directUrls: {}
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

const configurationDevices = [
  { name: "Ieejas kamera", method: "IP", value: "192.168.1.42", server: "Riga Core Server", status: "Savienota" },
  { name: "Stāvvietas kamera", method: "SN", value: "VZX-9A41-22KF", server: "Edge Backup Node", status: "Gaida pārbaudi" },
  { name: "PTZ rampa", method: "P2P", value: "P2P-VZX-7042", server: "Riga Core Server", status: "Tunelis aktīvs" }
];

const overviewJournal = [
  { time: "16:45", type: "Sistēma", message: "Klienta piekļuve aktīva", level: "ok" },
  { time: "16:42", type: "Detekcija", message: "CAM-01: kustība pie galvenās ieejas", level: "ok" },
  { time: "16:31", type: "Ierīce", message: "Stāvvietas kamera pievienota konfigurācijas rindai", level: "warning" },
  { time: "15:58", type: "Kļūda", message: "CAM-06: īslaicīgs signāla kritums", level: "danger" },
  { time: "15:44", type: "Arhīvs", message: "Video arhīvs sinhronizēts", level: "ok" },
  { time: "15:20", type: "Paziņojums", message: "Sistēmas pārbaude pabeigta", level: "ok" }
];

const networkDevices = [
  { name: "Rūteris", detail: "WAN savienojums stabils", status: "ok" },
  { name: "NVR / lokālais mezgls", detail: "Atbildes laiks paaugstināts", status: "warning" },
  { name: "CAM-06 Tehniskā telpa", detail: "Nav stabila signāla", status: "danger" },
  { name: "VIZEX Cloud", detail: "Savienojums aktīvs", status: "ok" }
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

function cameraSignalClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("online") || normalized.includes("savienota") || normalized.includes("active")) return "ok";
  if (normalized.includes("uzman") || normalized.includes("gaida")) return "warning";
  return "danger";
}

function cameraNumber(camera: Camera) {
  return String(camera.sort_order ?? camera.id ?? 1).padStart(2, "0");
}

function cameraPing(camera: Camera) {
  return `${(Number(camera.sort_order ?? camera.id ?? 1) * 7) + 5} ms`;
}

function readStreamSettings(): StreamSettings {
  try {
    const stored = window.localStorage.getItem(streamSettingsStorageKey);
    if (!stored) return defaultStreamSettings;
    const parsed = JSON.parse(stored) as Partial<StreamSettings>;
    return {
      mediaHost: parsed.mediaHost || defaultStreamSettings.mediaHost,
      webrtcPort: parsed.webrtcPort || defaultStreamSettings.webrtcPort,
      hlsPort: parsed.hlsPort || defaultStreamSettings.hlsPort,
      paths: parsed.paths || {},
      directUrls: parsed.directUrls || {}
    };
  } catch {
    return defaultStreamSettings;
  }
}

function normalizeMediaHost(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return defaultStreamSettings.mediaHost;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function sanitizeStreamPath(value: string) {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function encodeStreamPath(path: string) {
  return sanitizeStreamPath(path).split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function buildMediaMtxEmbedUrl(settings: StreamSettings, protocol: "webrtc" | "hls", path: string) {
  const encodedPath = encodeStreamPath(path);
  if (!encodedPath) return "";

  try {
    const url = new URL(normalizeMediaHost(settings.mediaHost));
    url.port = protocol === "webrtc" ? settings.webrtcPort : settings.hlsPort;
    url.pathname = `/${encodedPath}`;
    url.searchParams.set("muted", "true");
    url.searchParams.set("autoplay", protocol === "webrtc" ? "true" : "false");
    url.searchParams.set("playsInline", "true");
    url.searchParams.set("controls", protocol === "webrtc" ? "false" : "true");
    return url.toString();
  } catch {
    return "";
  }
}

function capacityPercent(used: number, limit: number) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function Dashboard({
  user,
  site,
  cameras,
  recordings,
  events,
  profile,
  emailRegistry,
  activeView,
  activeCamera,
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
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("ip");
  const [deviceValue, setDeviceValue] = useState("");
  const [poweredOffCameraCodes, setPoweredOffCameraCodes] = useState<string[]>([]);
  const [gridPopupOpen, setGridPopupOpen] = useState(false);
  const [customGridActive, setCustomGridActive] = useState(false);
  const [activeGridPresetId, setActiveGridPresetId] = useState("2x2");
  const [gridSlots, setGridSlots] = useState<Array<string | null>>([]);
  const [streamSettings, setStreamSettings] = useState<StreamSettings>(readStreamSettings);
  const [recordingCameraCode, setRecordingCameraCode] = useState(activeCamera.code);

  useEffect(() => {
    setProfileDraft(profile);
  }, [profile]);

  useEffect(() => {
    window.localStorage.setItem(streamSettingsStorageKey, JSON.stringify(streamSettings));
  }, [streamSettings]);

  const isAdmin = user.role === "admin";
  const activeServer = serverCatalog.find((server) => server.id === activeServerId) ?? serverCatalog[0];
  const assignedCameraCount = cameras.length;
  const activeGridPreset = gridPresets.find((preset) => preset.id === activeGridPresetId) ?? gridPresets[4];
  const gridSlotCount = activeGridPreset.rows * activeGridPreset.columns;
  const gridDensityClass = gridSlotCount > 36 ? "dense" : gridSlotCount > 16 ? "compact" : "";
  const gridRowMinHeight = gridSlotCount > 36 ? "28px" : gridSlotCount > 16 ? "42px" : "64px";
  const customGridSlots = useMemo(
    () => Array.from({ length: gridSlotCount }, (_, index) => {
      const cameraCode = gridSlots[index];
      return cameraCode ? cameras.find((camera) => camera.code === cameraCode) ?? null : null;
    }),
    [cameras, gridSlotCount, gridSlots]
  );
  const filteredRecordings = useMemo(() => {
    const query = recordingQuery.toLowerCase();
    return recordings.filter((item) => item.camera.toLowerCase().includes(query));
  }, [recordingQuery, recordings]);
  const activeRecordingCamera = cameras.find((camera) => camera.code === recordingCameraCode) ?? activeCamera;
  const activeCameraDirectUrl = streamSettings.directUrls[activeCamera.code] ?? "";
  const recordingCameraDirectUrl = streamSettings.directUrls[activeRecordingCamera.code] ?? "";
  const activeCameraStreamPath = streamSettings.paths[activeCamera.code] ?? "";
  const recordingCameraStreamPath = streamSettings.paths[activeRecordingCamera.code] ?? "";
  const activeCameraWebRtcUrl = buildMediaMtxEmbedUrl(streamSettings, "webrtc", activeCameraStreamPath);
  const activeRecordingHlsUrl = buildMediaMtxEmbedUrl(streamSettings, "hls", recordingCameraStreamPath);

  const navItems: Array<{ view: ViewName; label: string; caption: string }> = [
    { view: "overview", label: "Pārskats", caption: "Sistēmas statuss" },
    { view: "live", label: "Tiešraide", caption: "Video režģis" },
    { view: "recordings", label: "Ieraksti", caption: "Video arhīvs" },
    { view: "servers", label: "Serveri", caption: "Kvotas un arhīvs" },
    { view: "configuration", label: "Konfigurācija", caption: "IP, SN un P2P" },
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

  function submitDevice(event: FormEvent) {
    event.preventDefault();
    const modeLabel = connectionMode === "ip" ? "IP adrese" : connectionMode === "serial" ? "sērijas numurs" : "P2P ID";
    onToast(`Ierīces pievienošana pēc ${modeLabel}: ${deviceValue || "nav ievadīts"}`);
  }

  function selectGridPreset(preset: typeof gridPresets[number]) {
    const slotCount = preset.rows * preset.columns;
    setActiveGridPresetId(preset.id);
    setGridSlots(Array.from({ length: slotCount }, () => null));
    setCustomGridActive(true);
    setGridPopupOpen(false);
    onToast(`Režģis ${preset.label} izvēlēts`);
  }

  function startCameraDrag(event: DragEvent<HTMLButtonElement>, camera: Camera) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", camera.code);
  }

  function assignCameraToGrid(slotIndex: number, cameraCode: string) {
    const nextCamera = cameras.find((camera) => camera.code === cameraCode);
    if (!nextCamera) return;

    setGridSlots((current) => {
      const nextSlots = Array.from({ length: gridSlotCount }, (_, index) => current[index] ?? null);
      nextSlots[slotIndex] = nextCamera.code;
      return nextSlots;
    });
    onCameraChange(nextCamera);
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
    onToast(`${camera.code} ${nextPoweredOff ? "izslēgta" : "ieslēgta"} prototipa skatā`);
  }

  function updateStreamSetting(field: keyof Omit<StreamSettings, "paths">, value: string) {
    setStreamSettings((current) => ({ ...current, [field]: value }));
  }

  function updateCameraStreamPath(camera: Camera, value: string) {
    setStreamSettings((current) => ({
      ...current,
      paths: {
        ...current.paths,
        [camera.code]: sanitizeStreamPath(value)
      }
    }));
  }

  function updateCameraDirectUrl(camera: Camera, value: string) {
    setStreamSettings((current) => ({
      ...current,
      directUrls: {
        ...current.directUrls,
        [camera.code]: value.trim()
      }
    }));
  }

  function getCameraDirectUrl(camera: Camera) {
    return streamSettings.directUrls[camera.code] ?? "";
  }

  function getCameraWebRtcUrl(camera: Camera) {
    return buildMediaMtxEmbedUrl(streamSettings, "webrtc", streamSettings.paths[camera.code] ?? "");
  }

  function getCameraHlsUrl(camera: Camera) {
    return buildMediaMtxEmbedUrl(streamSettings, "hls", streamSettings.paths[camera.code] ?? "");
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
          <p>Pārskatā redzams notikumu žurnāls un tīkla statuss. Detalizēta konfigurācija atrodas atsevišķā sadaļā.</p>
        </div>
      </aside>

      <main className="content dashboard-content">
        <section className={`view ${activeView === "overview" ? "active" : ""}`}>
          <div className="section-head dashboard-head">
            <div>
              <span className="eyebrow">VIZEX platforma</span>
              <h1>{isAdmin ? "Admin darba vide" : "Jūsu sistēmas pārskats"}</h1>
            </div>
            <button className="primary-button" onClick={() => onViewChange("configuration")} type="button">
              Pievienot ierīci
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
                {overviewJournal.map((event) => (
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
                    const cameraWebRtcUrl = camera ? getCameraWebRtcUrl(camera) : "";
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
                            {!cameraDirectUrl && cameraWebRtcUrl && !poweredOff && (
                              <iframe
                                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                                className="stream-frame"
                                scrolling="no"
                                src={cameraWebRtcUrl}
                                title={`${camera.code} WebRTC`}
                              />
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
                                  onToast(`${camera.code} konfigurācijas logs būs nākamajā solī`);
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
                  {!activeCameraDirectUrl && activeCameraWebRtcUrl && !isCameraPoweredOff(activeCamera) && (
                    <iframe
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      className="stream-frame"
                      scrolling="no"
                      src={activeCameraWebRtcUrl}
                      title={`${activeCamera.code} WebRTC`}
                    />
                  )}
                  <div className="video-noise" />
                  <div className="video-reticle" />
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
                      onClick={() => onToast(`${activeCamera.code} konfigurācijas logs būs nākamajā solī`)}
                      type="button"
                    >
                      <span aria-hidden="true">⚙</span>
                    </button>
                  </div>
                  <span className="tile-camera-label main-label">
                    <strong>{cameraNumber(activeCamera)} {activeCamera.name}</strong>
                    <small>{activeCamera.code} | {activeCamera.model}</small>
                  </span>
                  <span className="tile-ping main-ping">{cameraPing(activeCamera)}</span>
                </div>
              )}
            </div>

            <aside className="details-panel">
              <div className="panel-section">
                <span className="eyebrow">Kameras</span>
                <h2>Kameru saraksts</h2>
                <div className="camera-list">
                  {cameras.map((camera) => (
                    <button
                      className={`camera-button ${camera.code === activeCamera.code ? "active" : ""}`}
                      draggable
                      key={camera.code}
                      onClick={() => onCameraChange(camera)}
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
                  ))}
                </div>
              </div>
              <div className="panel-section">
                <span className="eyebrow">Aktīvā kamera</span>
                <div className="camera-detail-list">
                  <span><strong>Nosaukums</strong>{activeCamera.name}</span>
                  <span><strong>Lokācija</strong>{activeCamera.location}</span>
                  <span><strong>Modelis</strong>{activeCamera.model}</span>
                  <span><strong>Statuss</strong>{activeCamera.status}</span>
                </div>
              </div>
              <div className="panel-section stream-panel">
                <span className="eyebrow">Vienkāršais tests</span>
                <label>
                  {activeCamera.code} Direct MJPEG/HTTP URL
                  <input
                    value={activeCameraDirectUrl}
                    onChange={(event) => updateCameraDirectUrl(activeCamera, event.target.value)}
                    placeholder="http://192.168.1.20:8080/video"
                    type="text"
                  />
                </label>
                <p className="stream-helper">Ātrākais tests: telefona IP kamera vai kameras MJPEG links. Ja šis ir aizpildīts, tas tiek rādīts pirms MediaMTX.</p>
              </div>
              <div className="panel-section stream-panel">
                <span className="eyebrow">MediaMTX rezerves variants</span>
                <label>
                  Serveris
                  <input
                    value={streamSettings.mediaHost}
                    onChange={(event) => updateStreamSetting("mediaHost", event.target.value)}
                    onBlur={() => updateStreamSetting("mediaHost", normalizeMediaHost(streamSettings.mediaHost))}
                    placeholder="http://127.0.0.1"
                    type="text"
                  />
                </label>
                <div className="stream-port-grid">
                  <label>
                    WebRTC
                    <input
                      value={streamSettings.webrtcPort}
                      onChange={(event) => updateStreamSetting("webrtcPort", event.target.value.replace(/\D/g, ""))}
                      placeholder="8889"
                      type="text"
                    />
                  </label>
                  <label>
                    HLS
                    <input
                      value={streamSettings.hlsPort}
                      onChange={(event) => updateStreamSetting("hlsPort", event.target.value.replace(/\D/g, ""))}
                      placeholder="8888"
                      type="text"
                    />
                  </label>
                </div>
                <label>
                  {activeCamera.code} path
                  <input
                    value={activeCameraStreamPath}
                    onChange={(event) => updateCameraStreamPath(activeCamera, event.target.value)}
                    placeholder="mystream"
                    type="text"
                  />
                </label>
                <div className="stream-link-row">
                  <a className={`ghost-button ${activeCameraWebRtcUrl ? "" : "disabled"}`} href={activeCameraWebRtcUrl || undefined} rel="noreferrer" target="_blank">
                    WebRTC tests
                  </a>
                  <a className={`ghost-button ${getCameraHlsUrl(activeCamera) ? "" : "disabled"}`} href={getCameraHlsUrl(activeCamera) || undefined} rel="noreferrer" target="_blank">
                    HLS tests
                  </a>
                </div>
              </div>
              <div className="panel-section">
                <span className="eyebrow">Pēdējās aktivitātes</span>
                <div className="event-feed compact">
                  {events.slice(0, 4).map((event) => (
                    <div className="event-item" key={`${event.time}-${event.message}`}>
                      <strong>{event.time}</strong>
                      <span>{event.message}</span>
                    </div>
                  ))}
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
                  {(recordingCameraDirectUrl || recordingCameraStreamPath) && <span className="pill">{activeRecordingCamera.code}</span>}
                </div>
                <label>
                  Kamera
                  <select value={activeRecordingCamera.code} onChange={(event) => setRecordingCameraCode(event.target.value)}>
                    {cameras.map((camera) => <option key={camera.code} value={camera.code}>{camera.code} - {camera.name}</option>)}
                  </select>
                </label>
                {recordingCameraDirectUrl ? (
                  <div className="archive-frame-wrap">
                    <img className="archive-frame mjpeg-frame" src={recordingCameraDirectUrl} alt={`${activeRecordingCamera.code} direct stream`} />
                  </div>
                ) : activeRecordingHlsUrl ? (
                  <div className="archive-frame-wrap">
                    <iframe
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      className="archive-frame"
                      scrolling="no"
                      src={activeRecordingHlsUrl}
                      title={`${activeRecordingCamera.code} HLS`}
                    />
                  </div>
                ) : (
                  <div className="archive-empty">
                    <strong>Nav piesaistīta plūsma</strong>
                    <span>{activeRecordingCamera.code} Direct URL vai MediaMTX path pievieno Tiešraide sadaļā.</span>
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
                  <button className="ghost-button" onClick={() => setActiveServerId(server.id)} type="button">Izvēlēties konfigurācijai</button>
                </section>
              );
            })}
          </div>
        </section>

        <section className={`view ${activeView === "configuration" ? "active" : ""}`}>
          <div className="section-head dashboard-head">
            <div>
              <span className="eyebrow">Ierīču konfigurācija</span>
              <h1>Pievienot kameru vai ierīci</h1>
            </div>
            <button className="primary-button" onClick={() => onToast("Web konfigurācijas logs tiks pieslēgts nākamajā integrācijas solī")} type="button">
              Atvērt web konfigurāciju
            </button>
          </div>

          <div className="configuration-layout">
            <form className="config-panel" onSubmit={submitDevice}>
              <span className="eyebrow">Savienojuma veids</span>
              <div className="mode-tabs">
                {[
                  ["ip", "IP adrese"],
                  ["serial", "Sērijas numurs"],
                  ["p2p", "P2P ID"]
                ].map(([mode, label]) => (
                  <button
                    className={`mode-tab ${connectionMode === mode ? "active" : ""}`}
                    key={mode}
                    onClick={() => setConnectionMode(mode as ConnectionMode)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label>
                Serveris
                <select value={activeServerId} onChange={(event) => setActiveServerId(event.target.value)}>
                  {serverCatalog.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
                </select>
              </label>
              <label>
                {connectionMode === "ip" ? "Ierīces IP adrese" : connectionMode === "serial" ? "Ierīces sērijas numurs" : "P2P identifikators"}
                <input
                  value={deviceValue}
                  onChange={(event) => setDeviceValue(event.target.value)}
                  placeholder={connectionMode === "ip" ? "192.168.1.100" : connectionMode === "serial" ? "VZX-SN-0000" : "P2P-VZX-0000"}
                  type="text"
                />
              </label>
              <button className="primary-button" type="submit">Pārbaudīt savienojumu</button>

              <div className="config-steps">
                <span>1. Izvēlies serveri</span>
                <span>2. Ievadi IP, SN vai P2P ID</span>
                <span>3. Pārbaudi web piekļuvi</span>
                <span>4. Pievieno kameru klienta kontam</span>
              </div>
            </form>

            <aside className="config-panel">
              <span className="eyebrow">Pievienotās ierīces</span>
              <div className="device-list">
                {configurationDevices.map((device) => (
                  <div className="device-row" key={device.value}>
                    <span>
                      <strong>{device.name}</strong>
                      <small>{device.method}: {device.value} | {device.server}</small>
                    </span>
                    {statusPill(device.status)}
                  </div>
                ))}
              </div>
              <p className="privacy-note">P2P pēc sērijas numura šobrīd ir prototipa plūsma. Produkcijā vajadzēs drošu ierīces reģistru, tokenus un ražotāja API.</p>
            </aside>
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
                <small>Kopējā demo kapacitāte</small>
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
