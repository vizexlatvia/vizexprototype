import { FormEvent, useEffect, useMemo, useState } from "react";
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

function statusPill(status: string) {
  const warning = status !== "Online" && status !== "active" && status !== "online";
  return <span className={`pill ${warning ? "warning" : ""}`}>{status}</span>;
}

function cameraNumber(camera: Camera) {
  return String(camera.sort_order ?? camera.id ?? 1).padStart(2, "0");
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
  const [layoutWide, setLayoutWide] = useState(false);
  const [recordingQuery, setRecordingQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("Šodien");
  const [profileDraft, setProfileDraft] = useState<Profile>(profile);

  useEffect(() => {
    setProfileDraft(profile);
  }, [profile]);

  const filteredRecordings = useMemo(() => {
    const query = recordingQuery.toLowerCase();
    return recordings.filter((item) => item.camera.toLowerCase().includes(query));
  }, [recordingQuery, recordings]);

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    onSaveProfile(profileDraft);
  }

  function updateProfile(field: keyof Profile, value: string) {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  }

  const isAdmin = user.role === "admin";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <span className="status-dot" />
          <span>VIZEXAPP</span>
        </div>
        <img className="brand-logo" src="/assets/vizex-logo-transparent.png" alt="VIZEX logo" />
        <div className="profile-actions">
          <span>{isAdmin ? "ADMIN | vizexlatvia@gmail.com" : user.email}</span>
          <button className="ghost-button" onClick={onLogout} type="button">Iziet</button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="client-card">
          <span className="eyebrow">Klienta zona</span>
          <strong>{isAdmin ? "VIZEX Latvia administrācija" : site.address || site.name}</strong>
          <span>{isAdmin ? "Admin konts | Supabase projekta dati" : `${cameras.length} kameras | ${site.status}`}</span>
        </div>

        <nav className="main-nav" aria-label="Galvenā navigācija">
          {[
            ["live", "Live", "Tiešraide"],
            ["recordings", "Ieraksti", "Video arhīvs"],
            ["cameras", "Kameras", "Saraksts"],
            ["profile", "Profils", "Klienta dati"]
          ].map(([view, label, caption]) => (
            <button
              className={`nav-item ${activeView === view ? "active" : ""}`}
              key={view}
              onClick={() => onViewChange(view as ViewName)}
              type="button"
            >
              <span>{label}</span>
              <small>{caption}</small>
            </button>
          ))}
        </nav>

        <div className="ai-panel">
          <span className="eyebrow">AI pārskats</span>
          <strong>12 notikumi šodien</strong>
          <p>3 kustības zonas, 1 signāla pārtraukums un 8 ikdienas aktivitātes.</p>
        </div>
      </aside>

      <main className="content">
        <section className={`view ${activeView === "live" ? "active" : ""}`}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Tiešraides video</span>
              <h1>{activeCamera.code} - {activeCamera.name}</h1>
            </div>
            <div className="toolbar">
              <button
                className={`icon-button ${layoutWide ? "active" : ""}`}
                onClick={() => {
                  setLayoutWide((value) => !value);
                  onToast("Video režģa skats pārslēgts");
                }}
                type="button"
              >
                {layoutWide ? "1x4" : "2x2"}
              </button>
              <button className="primary-button" onClick={() => onToast(`${activeCamera.code} kamera fokusēta`)} type="button">
                Fokusēt kameru
              </button>
            </div>
          </div>

          <div className="live-layout">
            <div className="video-stage">
              <div className="video-main">
                <div className="video-noise" />
                <div className="video-overlay">
                  <span className="live-badge">LIVE</span>
                  <span>{activeCamera.location}</span>
                </div>
                <div className="video-meta">
                  <strong>{activeCamera.code}</strong>
                  <span>{activeCamera.quality} | 25 FPS | {(Number(activeCamera.sort_order ?? activeCamera.id ?? 1) * 7) + 5} ms</span>
                </div>
              </div>
              <div className={`video-grid ${layoutWide ? "wide-layout" : ""}`}>
                {cameras.slice(0, 4).map((camera) => (
                  <button
                    className={`video-thumb ${camera.code === activeCamera.code ? "active" : ""}`}
                    key={camera.code}
                    onClick={() => onCameraChange(camera)}
                    type="button"
                  >
                    <strong>{camera.code}</strong>
                    <span>{camera.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="details-panel">
              <div className="panel-section">
                <span className="eyebrow">Kameras</span>
                <div className="camera-list">
                  {cameras.map((camera) => (
                    <button
                      className={`camera-button ${camera.code === activeCamera.code ? "active" : ""}`}
                      key={camera.code}
                      onClick={() => onCameraChange(camera)}
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
                <span className="eyebrow">Notikumu plūsma</span>
                <div className="event-feed">
                  {events.map((event) => (
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
          <div className="section-head">
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

        <section className={`view ${activeView === "cameras" ? "active" : ""}`}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Objekta aprīkojums</span>
              <h1>Kameru saraksts</h1>
            </div>
            <button className="primary-button" onClick={() => onToast("Nosaukumu rediģēšana būs nākamajā prototipa solī")} type="button">
              Nosaukumu režīms
            </button>
          </div>
          <div className="table-panel">
            <div className="table-row table-head">
              <span>Nr.</span>
              <span>Nosaukums</span>
              <span>Modelis</span>
              <span>Statuss</span>
              <span>Kvalitāte</span>
            </div>
            {cameras.map((camera) => (
              <div className="table-row" key={camera.code}>
                <span>{cameraNumber(camera)}</span>
                <span>{camera.name}</span>
                <span>{camera.model}</span>
                <span>{statusPill(camera.status)}</span>
                <span>{camera.quality}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`view ${activeView === "profile" ? "active" : ""}`}>
          <div className="section-head">
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

            {isAdmin && (
              <aside className="profile-panel">
                <span className="eyebrow">Reģistrēto klientu e-pastu datubāze</span>
                <div className="email-database">
                  {emailRegistry.length ? emailRegistry.map((entry) => (
                    <div className="email-row" key={entry.email}>
                      <span>{entry.email}</span>
                      <small>{new Date(entry.created_at).toLocaleDateString("lv-LV")} | {entry.role} | {entry.status}</small>
                    </div>
                  )) : (
                    <div className="email-row">
                      <span>Nav reģistrētu klientu</span>
                      <small>Supabase tabula ir tukša.</small>
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
