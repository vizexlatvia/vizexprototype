const SUPABASE_URL = "https://mzyvvnqlqeinvlrpcqhs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eXZ2bnFscWVpbnZscnBjcWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTQ2NDQsImV4cCI6MjA5NjM5MDY0NH0.RFKN5DqMxn5FfHRZyvFKRa8Vx3vMnVqU-yLEMiRO_p4";
const ADMIN_EMAIL = "vizexlatvia@gmail.com";
const LOCAL_PROFILE_CACHE_KEY = "vizex_client_profiles_cache";

const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_SITE = {
  id: "local-demo",
  name: "Brīvības 118",
  address: "Rīga, Brīvības 118",
  status: "online",
  is_default: true
};

const DEFAULT_CAMERAS = [
  { id: 1, code: "CAM-01", name: "Ieeja", location: "Galvenā ieeja", model: "VZX-4K Dome", status: "Online", quality: "1080p" },
  { id: 2, code: "CAM-02", name: "Recepcija", location: "Klientu zona", model: "VZX-4K Dome", status: "Online", quality: "1080p" },
  { id: 3, code: "CAM-03", name: "Noliktava", location: "Aizmugures noliktava", model: "VZX Bullet AI", status: "Online", quality: "4K" },
  { id: 4, code: "CAM-04", name: "Stāvvieta", location: "Āra perimetrs", model: "VZX Bullet AI", status: "Online", quality: "4K" },
  { id: 5, code: "CAM-05", name: "Birojs", location: "2. stāva birojs", model: "VZX Mini", status: "Online", quality: "720p" },
  { id: 6, code: "CAM-06", name: "Tehniskā telpa", location: "Serveru zona", model: "VZX Mini", status: "Uzmanību", quality: "720p" },
  { id: 7, code: "CAM-07", name: "Rampa", location: "Piegādes rampa", model: "VZX PTZ", status: "Online", quality: "1080p" },
  { id: 8, code: "CAM-08", name: "Kase", location: "Norēķinu zona", model: "VZX-4K Dome", status: "Online", quality: "1080p" }
];

const DEFAULT_RECORDINGS = [
  { time: "08:42", camera: "CAM-01 Ieeja", detail: "Kustība pie galvenās ieejas", length: "00:46" },
  { time: "10:18", camera: "CAM-04 Stāvvieta", detail: "Transporta aktivitāte", length: "02:14" },
  { time: "12:05", camera: "CAM-03 Noliktava", detail: "Darbinieku kustība zonā", length: "01:08" },
  { time: "14:31", camera: "CAM-06 Tehniskā telpa", detail: "Īslaicīgs signāla kritums", length: "00:19" },
  { time: "16:20", camera: "CAM-08 Kase", detail: "AI atzīmēta ikdienas aktivitāte", length: "03:02" }
];

const DEFAULT_EVENTS = [
  { time: "16:42", message: "CAM-01: tiešraide stabila" },
  { time: "16:43", message: "AI pārbaude pabeigta" },
  { time: "16:44", message: "Arhīvs sinhronizēts" },
  { time: "16:45", message: "Klienta piekļuve aktīva" }
];

let activeSite = { ...DEFAULT_SITE };
let cameras = [...DEFAULT_CAMERAS];
let recordings = [...DEFAULT_RECORDINGS];
let cloudEvents = [...DEFAULT_EVENTS];
let activeCamera = cameras[0];
let activeUser = null;
let projectChannel = null;
let toastTimer;

const body = document.body;
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const authTabs = document.querySelectorAll("[data-auth-panel]");
const authPanels = document.querySelectorAll("[data-auth-section]");
const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll(".nav-item");
const cameraList = document.getElementById("cameraList");
const videoGrid = document.getElementById("videoGrid");
const cameraTable = document.getElementById("cameraTable");
const recordingList = document.getElementById("recordingList");
const eventFeed = document.getElementById("eventFeed");
const toast = document.getElementById("toast");

function readStore(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getRoleForEmail(email) {
  return normalizeEmail(email) === ADMIN_EMAIL ? "admin" : "client";
}

function toAppUser(user) {
  const email = normalizeEmail(user.email ?? "");
  return { id: user.id, email, role: getRoleForEmail(email) };
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit" });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function requireSupabase() {
  if (!supabaseClient) {
    throw new Error("Supabase bibliotēka nav ielādēta. Pārbaudiet interneta savienojumu.");
  }
}

function getSiteUrl() {
  return `${window.location.origin}${window.location.pathname}`.replace(/\/?$/, "/");
}

function switchAuthPanel(panelName) {
  authTabs.forEach((button) => button.classList.toggle("active", button.dataset.authPanel === panelName));
  authPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.authSection === panelName));
}

function setView(viewName) {
  views.forEach((view) => view.classList.toggle("active", view.dataset.viewPanel === viewName));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewName));
  if (viewName === "profile") renderProfile();
}

function statusPill(status) {
  const warning = status !== "Online" && status !== "active" && status !== "online" ? " warning" : "";
  return `<span class="pill${warning}">${status}</span>`;
}

function setCamera(camera) {
  if (!camera) return;
  activeCamera = camera;
  document.getElementById("liveTitle").textContent = `${camera.code} - ${camera.name}`;
  document.getElementById("mainLocation").textContent = camera.location;
  document.getElementById("mainCamera").textContent = camera.code;
  document.getElementById("mainStatus").textContent = `${camera.quality} | 25 FPS | ${Number(camera.sort_order ?? camera.id ?? 1) * 7 + 5} ms`;
  renderCameras();
  renderEvents();
}

function renderCameras() {
  cameraList.innerHTML = cameras.map((camera) => `
    <button class="camera-button ${camera.code === activeCamera?.code ? "active" : ""}" data-camera="${camera.code}" type="button">
      <span class="camera-number">${String(camera.sort_order ?? camera.id ?? 1).padStart(2, "0")}</span>
      <span class="camera-info">
        <strong>${camera.name}</strong>
        <span>${camera.location}</span>
      </span>
      ${statusPill(camera.status)}
    </button>
  `).join("");

  videoGrid.innerHTML = cameras.slice(0, 4).map((camera) => `
    <button class="video-thumb ${camera.code === activeCamera?.code ? "active" : ""}" data-camera="${camera.code}" type="button">
      <strong>${camera.code}</strong>
      <span>${camera.name}</span>
    </button>
  `).join("");

  document.querySelectorAll("[data-camera]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = cameras.find((camera) => camera.code === button.dataset.camera);
      setCamera(selected);
    });
  });
}

function renderEvents() {
  eventFeed.innerHTML = cloudEvents.map((event) => `
    <div class="event-item">
      <strong>${event.time}</strong>
      <span>${event.message}</span>
    </div>
  `).join("");
}

function renderRecordings(items = recordings) {
  recordingList.innerHTML = items.map((item) => `
    <button class="recording-item" type="button" data-recording="${item.time}">
      <span class="recording-time">${item.time}</span>
      <span>
        <strong>${item.camera}</strong>
        <small>${item.detail}</small>
      </span>
      <span class="pill">${item.length}</span>
    </button>
  `).join("");

  document.querySelectorAll("[data-recording]").forEach((item) => {
    item.addEventListener("click", () => showToast(`Atvērts ieraksts ${item.dataset.recording}`));
  });
}

function renderCameraTable() {
  cameraTable.innerHTML = cameras.map((camera) => `
    <div class="table-row">
      <span>${String(camera.sort_order ?? camera.id ?? 1).padStart(2, "0")}</span>
      <span>${camera.name}</span>
      <span>${camera.model}</span>
      <span>${statusPill(camera.status)}</span>
      <span>${camera.quality}</span>
    </div>
  `).join("");
}

function renderProjectShell() {
  document.getElementById("contextTitle").textContent = activeSite.address || activeSite.name || "Klienta objekts";
  document.getElementById("contextMeta").textContent = `${cameras.length} kameras | ${activeSite.status}`;
  setCamera(cameras[0] ?? DEFAULT_CAMERAS[0]);
  renderRecordings();
  renderCameraTable();
}

async function syncEmailRegistry(user, status = "active") {
  requireSupabase();
  const appUser = toAppUser(user);
  const { error } = await supabaseClient
    .from("client_email_registry")
    .upsert({
      user_id: appUser.id,
      email: appUser.email,
      role: appUser.role,
      status,
      last_login_at: new Date().toISOString()
    }, { onConflict: "email" });

  if (error) console.warn("Email registry sync failed:", error.message);
}

async function fetchEmailRegistry() {
  requireSupabase();
  const { data, error } = await supabaseClient
    .from("client_email_registry")
    .select("email, role, status, created_at, last_login_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function fetchProfile() {
  requireSupabase();
  const { data, error } = await supabaseClient
    .from("client_profiles")
    .select("company, contact, address")
    .eq("user_id", activeUser.id)
    .maybeSingle();

  if (error) throw error;
  return data ?? { company: "", contact: "", address: "" };
}

async function saveProfile(profile) {
  requireSupabase();
  const { error } = await supabaseClient
    .from("client_profiles")
    .upsert({
      user_id: activeUser.id,
      email: activeUser.email,
      company: profile.company,
      contact: profile.contact,
      address: profile.address,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

  if (error) throw error;
}

async function loadCloudProjectData() {
  requireSupabase();

  const { data: siteRows, error: siteError } = await supabaseClient
    .from("sites")
    .select("id, name, address, status, is_default")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);

  if (siteError) throw siteError;
  if (!siteRows?.length) return;

  activeSite = siteRows[0];

  const [
    { data: cameraRows, error: cameraError },
    { data: recordingRows, error: recordingError },
    { data: eventRows, error: eventError }
  ] = await Promise.all([
    supabaseClient.from("cameras").select("id, sort_order, code, name, location, model, status, quality").eq("site_id", activeSite.id).order("sort_order"),
    supabaseClient.from("recordings").select("camera_code, camera_name, detail, recorded_at, length_label").eq("site_id", activeSite.id).order("recorded_at", { ascending: false }).limit(12),
    supabaseClient.from("events").select("camera_code, message, event_time").eq("site_id", activeSite.id).order("event_time", { ascending: false }).limit(8)
  ]);

  if (cameraError) throw cameraError;
  if (recordingError) throw recordingError;
  if (eventError) throw eventError;

  if (cameraRows?.length) cameras = cameraRows;
  if (recordingRows?.length) {
    recordings = recordingRows.map((item) => ({
      time: formatTime(item.recorded_at),
      camera: `${item.camera_code} ${item.camera_name}`.trim(),
      detail: item.detail,
      length: item.length_label
    }));
  }
  if (eventRows?.length) {
    cloudEvents = eventRows.map((item) => ({
      time: formatTime(item.event_time),
      message: item.camera_code ? `${item.camera_code}: ${item.message}` : item.message
    }));
  }
}

function subscribeToProjectChanges() {
  if (!supabaseClient || projectChannel) return;
  projectChannel = supabaseClient
    .channel("vizex-project-cloud-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "sites" }, reloadProjectFromCloud)
    .on("postgres_changes", { event: "*", schema: "public", table: "cameras" }, reloadProjectFromCloud)
    .on("postgres_changes", { event: "*", schema: "public", table: "recordings" }, reloadProjectFromCloud)
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, reloadProjectFromCloud)
    .on("postgres_changes", { event: "*", schema: "public", table: "client_profiles" }, reloadProjectFromCloud)
    .subscribe();
}

async function reloadProjectFromCloud() {
  if (!activeUser) return;
  try {
    await loadCloudProjectData();
    renderProjectShell();
    if (document.querySelector('[data-view-panel="profile"]').classList.contains("active")) {
      await renderProfile();
    }
    showToast("Supabase izmaiņas atjauninātas");
  } catch (error) {
    console.warn("Realtime refresh failed:", error.message);
  }
}

async function renderProfile() {
  if (!activeUser) return;
  const localProfiles = readStore(LOCAL_PROFILE_CACHE_KEY, {});
  let profile = localProfiles[activeUser.email] ?? { company: "", contact: "", address: "" };
  const isAdmin = activeUser.role === "admin";

  try {
    profile = await fetchProfile();
    localProfiles[activeUser.email] = profile;
    writeStore(LOCAL_PROFILE_CACHE_KEY, localProfiles);
  } catch (error) {
    console.warn("Profile cloud load failed:", error.message);
  }

  document.getElementById("profileEmail").value = activeUser.email;
  document.getElementById("profileCompany").value = profile.company ?? "";
  document.getElementById("profileContact").value = profile.contact ?? "";
  document.getElementById("profileAddress").value = profile.address ?? "";

  if (isAdmin) {
    document.getElementById("contextTitle").textContent = "VIZEX Latvia administrācija";
    document.getElementById("contextMeta").textContent = "Admin konts | Supabase projekta dati";
  } else {
    document.getElementById("contextTitle").textContent = activeSite.address || profile.company || "Klienta objekts";
    document.getElementById("contextMeta").textContent = `${cameras.length} kameras | ${activeSite.status}`;
  }

  document.getElementById("emailDatabasePanel").hidden = !isAdmin;
  if (!isAdmin) {
    document.getElementById("emailDatabase").innerHTML = "";
    return;
  }

  try {
    const emailDb = await fetchEmailRegistry();
    document.getElementById("emailDatabase").innerHTML = emailDb.map((entry) => `
      <div class="email-row">
        <span>${entry.email}</span>
        <small>${new Date(entry.created_at).toLocaleDateString("lv-LV")} | ${entry.role} | ${entry.status}</small>
      </div>
    `).join("") || `<div class="email-row"><span>Nav reģistrētu klientu</span><small>Supabase tabula ir tukša.</small></div>`;
  } catch (error) {
    document.getElementById("emailDatabase").innerHTML = `
      <div class="email-row">
        <span>Datubāze vēl nav pieejama</span>
        <small>Pārpalaižiet supabase_schema.sql Supabase SQL Editor.</small>
      </div>
    `;
  }
}

async function enterApp(user) {
  activeUser = user;
  loginScreen.hidden = true;
  appShell.hidden = false;
  body.classList.add("authenticated", "client-mode");
  body.classList.toggle("admin-mode", user.role === "admin");
  document.getElementById("activeUserLabel").textContent = user.role === "admin" ? "ADMIN | vizexlatvia@gmail.com" : user.email;

  try {
    await loadCloudProjectData();
    showToast("Projekta dati ielādēti no Supabase");
  } catch (error) {
    showToast("Supabase dati vēl nav pilnībā gatavi, rādu lokālo demo skatu");
  }

  renderProjectShell();
  await renderProfile();
  subscribeToProjectChanges();
  setView(user.role === "admin" ? "profile" : "live");
}

async function createAccount(email, password) {
  requireSupabase();
  const normalizedEmail = normalizeEmail(email);
  const role = getRoleForEmail(normalizedEmail);
  const { data, error } = await supabaseClient.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: getSiteUrl(),
      data: { role }
    }
  });

  if (error) throw error;
  if (data.session?.user) await syncEmailRegistry(data.session.user);
  return data;
}

async function login(email, password) {
  requireSupabase();
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: normalizeEmail(email),
    password
  });

  if (error) throw error;
  await syncEmailRegistry(data.user);
  await enterApp(toAppUser(data.user));
}

async function logout() {
  if (projectChannel) {
    await supabaseClient.removeChannel(projectChannel);
    projectChannel = null;
  }
  if (supabaseClient) await supabaseClient.auth.signOut();
  activeUser = null;
  appShell.hidden = true;
  loginScreen.hidden = false;
  body.classList.remove("authenticated", "client-mode", "admin-mode");
  switchAuthPanel("login");
  showToast("Sesija aizvērta");
}

authTabs.forEach((button) => {
  button.addEventListener("click", () => switchAuthPanel(button.dataset.authPanel));
});

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await login(document.getElementById("loginEmail").value, document.getElementById("loginPassword").value);
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;
  const confirm = document.getElementById("registerPasswordConfirm").value;
  if (password !== confirm) {
    showToast("Paroles nesakrīt.");
    return;
  }

  try {
    const data = await createAccount(email, password);
    document.getElementById("loginEmail").value = normalizeEmail(email);
    document.getElementById("loginPassword").value = "";
    switchAuthPanel("login");
    if (data.session?.user) {
      await enterApp(toAppUser(data.session.user));
      showToast("Konts izveidots un pieslēgts Supabase.");
    } else {
      showToast("Konts izveidots. Pārbaudiet e-pastu apstiprināšanas saitei.");
    }
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("recoverForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    requireSupabase();
    const email = normalizeEmail(document.getElementById("recoverEmail").value);
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: getSiteUrl()
    });
    if (error) throw error;
    showToast("Paroles atjaunošanas saite nosūtīta uz e-pastu.");
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("resetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    requireSupabase();
    const password = document.getElementById("newPassword").value;
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    document.getElementById("resetForm").hidden = true;
    switchAuthPanel("login");
    showToast("Parole nomainīta. Varat pieslēgties.");
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("fillDemoButton").addEventListener("click", () => {
  document.getElementById("loginEmail").value = "client@vizex.app";
  document.getElementById("loginPassword").value = "";
  showToast("Ievadiet savu Supabase konta paroli");
});

document.getElementById("logoutButton").addEventListener("click", logout);

document.getElementById("profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = {
    company: document.getElementById("profileCompany").value.trim(),
    contact: document.getElementById("profileContact").value.trim(),
    address: document.getElementById("profileAddress").value.trim()
  };

  try {
    await saveProfile(profile);
    const cache = readStore(LOCAL_PROFILE_CACHE_KEY, {});
    cache[activeUser.email] = profile;
    writeStore(LOCAL_PROFILE_CACHE_KEY, cache);
    await renderProfile();
    showToast("Profils saglabāts Supabase mākonī");
  } catch (error) {
    showToast(error.message);
  }
});

navItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.view));
});

document.getElementById("layoutButton").addEventListener("click", (event) => {
  event.currentTarget.classList.toggle("active");
  event.currentTarget.textContent = event.currentTarget.classList.contains("active") ? "1x4" : "2x2";
  videoGrid.classList.toggle("wide-layout");
  showToast("Video režģa skats pārslēgts");
});

document.getElementById("focusButton").addEventListener("click", () => {
  showToast(`${activeCamera.code} kamera fokusēta`);
});

document.getElementById("exportButton").addEventListener("click", () => {
  showToast("Eksporta pieprasījums sagatavots");
});

document.getElementById("renameButton").addEventListener("click", () => {
  showToast("Nosaukumu rediģēšana būs nākamajā prototipa solī");
});

document.getElementById("recordingSearch").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  renderRecordings(recordings.filter((item) => item.camera.toLowerCase().includes(query)));
});

document.querySelectorAll(".date-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".date-chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
    showToast(`Filtrs: ${chip.textContent}`);
  });
});

async function boot() {
  renderProjectShell();

  if (!supabaseClient) {
    showToast("Supabase nav ielādēts. Pārbaudiet interneta savienojumu.");
    return;
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      loginScreen.hidden = false;
      appShell.hidden = true;
      switchAuthPanel("recover");
      document.getElementById("resetForm").hidden = false;
      showToast("Ievadiet jauno paroli.");
      return;
    }

    if (session?.user && event === "SIGNED_IN" && !activeUser) {
      await syncEmailRegistry(session.user);
      await enterApp(toAppUser(session.user));
    }
  });

  const { data } = await supabaseClient.auth.getSession();
  if (data.session?.user) {
    await syncEmailRegistry(data.session.user);
    await enterApp(toAppUser(data.session.user));
  }
}

boot();
