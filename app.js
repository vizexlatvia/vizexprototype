const STORAGE_KEYS = {
  auth: "vizex_auth_accounts",
  emailDb: "vizex_registered_client_emails",
  session: "vizex_active_session",
  profiles: "vizex_client_profiles",
  recovery: "vizex_recovery_codes"
};

const ADMIN_EMAIL = "vizexlatvia@gmail.com";

const cameras = [
  { id: 1, code: "CAM-01", name: "Ieeja", location: "Galvenā ieeja", model: "VZX-4K Dome", status: "Online", quality: "1080p" },
  { id: 2, code: "CAM-02", name: "Recepcija", location: "Klientu zona", model: "VZX-4K Dome", status: "Online", quality: "1080p" },
  { id: 3, code: "CAM-03", name: "Noliktava", location: "Aizmugures noliktava", model: "VZX Bullet AI", status: "Online", quality: "4K" },
  { id: 4, code: "CAM-04", name: "Stāvvieta", location: "Āra perimetrs", model: "VZX Bullet AI", status: "Online", quality: "4K" },
  { id: 5, code: "CAM-05", name: "Birojs", location: "2. stāva birojs", model: "VZX Mini", status: "Online", quality: "720p" },
  { id: 6, code: "CAM-06", name: "Tehniskā telpa", location: "Serveru zona", model: "VZX Mini", status: "Uzmanību", quality: "720p" },
  { id: 7, code: "CAM-07", name: "Rampa", location: "Piegādes rampa", model: "VZX PTZ", status: "Online", quality: "1080p" },
  { id: 8, code: "CAM-08", name: "Kase", location: "Norēķinu zona", model: "VZX-4K Dome", status: "Online", quality: "1080p" }
];

const recordings = [
  { time: "08:42", camera: "CAM-01 Ieeja", detail: "Kustība pie galvenās ieejas", length: "00:46" },
  { time: "10:18", camera: "CAM-04 Stāvvieta", detail: "Transporta aktivitāte", length: "02:14" },
  { time: "12:05", camera: "CAM-03 Noliktava", detail: "Darbinieku kustība zonā", length: "01:08" },
  { time: "14:31", camera: "CAM-06 Tehniskā telpa", detail: "Īslaicīgs signāla kritums", length: "00:19" },
  { time: "16:20", camera: "CAM-08 Kase", detail: "AI atzīmēta ikdienas aktivitāte", length: "03:02" }
];

let activeCamera = cameras[0];
let activeUser = null;
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

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashPassword(password, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createAccount(email, password, source = "manual") {
  const normalizedEmail = normalizeEmail(email);
  const accounts = readStore(STORAGE_KEYS.auth, []);
  if (accounts.some((account) => account.email === normalizedEmail)) {
    throw new Error("Šis e-pasts jau ir reģistrēts.");
  }

  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  const createdAt = new Date().toISOString();
  const role = getRoleForEmail(normalizedEmail);
  accounts.push({ email: normalizedEmail, salt, passwordHash, role, createdAt });
  writeStore(STORAGE_KEYS.auth, accounts);

  const emailDb = readStore(STORAGE_KEYS.emailDb, []);
  emailDb.push({ email: normalizedEmail, role, status: "active", source, createdAt });
  writeStore(STORAGE_KEYS.emailDb, emailDb);

  const profiles = readStore(STORAGE_KEYS.profiles, {});
  profiles[normalizedEmail] = profiles[normalizedEmail] ?? {
    company: source === "demo" ? "Brīvības 118" : "",
    contact: "",
    address: source === "demo" ? "Rīga, Brīvības 118" : ""
  };
  writeStore(STORAGE_KEYS.profiles, profiles);
}

async function ensureDemoAccount() {
  const accounts = readStore(STORAGE_KEYS.auth, []);
  if (!accounts.some((account) => account.email === "client@vizex.app")) {
    await createAccount("client@vizex.app", "demo123", "demo");
  }
}

function migrateAdminAccount() {
  let changed = false;
  const accounts = readStore(STORAGE_KEYS.auth, []);
  accounts.forEach((account) => {
    const role = getRoleForEmail(account.email);
    if (account.role !== role) {
      account.role = role;
      changed = true;
    }
  });
  if (changed) writeStore(STORAGE_KEYS.auth, accounts);

  const emailDb = readStore(STORAGE_KEYS.emailDb, []);
  let emailDbChanged = false;
  emailDb.forEach((entry) => {
    const role = getRoleForEmail(entry.email);
    if (entry.role !== role) {
      entry.role = role;
      emailDbChanged = true;
    }
  });
  if (emailDbChanged) writeStore(STORAGE_KEYS.emailDb, emailDb);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function switchAuthPanel(panelName) {
  authTabs.forEach((button) => button.classList.toggle("active", button.dataset.authPanel === panelName));
  authPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.authSection === panelName));
}

function setView(viewName) {
  views.forEach((view) => view.classList.toggle("active", view.dataset.viewPanel === viewName));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewName));
}

function statusPill(status) {
  const warning = status !== "Online" && status !== "active" ? " warning" : "";
  return `<span class="pill${warning}">${status}</span>`;
}

function setCamera(camera) {
  activeCamera = camera;
  document.getElementById("liveTitle").textContent = `${camera.code} - ${camera.name}`;
  document.getElementById("mainLocation").textContent = camera.location;
  document.getElementById("mainCamera").textContent = camera.code;
  document.getElementById("mainStatus").textContent = `${camera.quality} | 25 FPS | ${camera.id * 7 + 5} ms`;
  renderCameras();
  renderEvents();
}

function renderCameras() {
  cameraList.innerHTML = cameras.map((camera) => `
    <button class="camera-button ${camera.id === activeCamera.id ? "active" : ""}" data-camera="${camera.id}" type="button">
      <span class="camera-number">${String(camera.id).padStart(2, "0")}</span>
      <span class="camera-info">
        <strong>${camera.name}</strong>
        <span>${camera.location}</span>
      </span>
      ${statusPill(camera.status)}
    </button>
  `).join("");

  videoGrid.innerHTML = cameras.slice(0, 4).map((camera) => `
    <button class="video-thumb ${camera.id === activeCamera.id ? "active" : ""}" data-camera="${camera.id}" type="button">
      <strong>${camera.code}</strong>
      <span>${camera.name}</span>
    </button>
  `).join("");

  document.querySelectorAll("[data-camera]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = cameras.find((camera) => camera.id === Number(button.dataset.camera));
      setCamera(selected);
    });
  });
}

function renderEvents() {
  const events = [
    `${activeCamera.code}: tiešraide stabila`,
    "AI pārbaude pabeigta",
    "Arhīvs sinhronizēts",
    "Klienta piekļuve aktīva"
  ];

  eventFeed.innerHTML = events.map((event, index) => `
    <div class="event-item">
      <strong>${String(16 - index).padStart(2, "0")}:${String(42 + index).padStart(2, "0")}</strong>
      <span>${event}</span>
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
      <span>${String(camera.id).padStart(2, "0")}</span>
      <span>${camera.name}</span>
      <span>${camera.model}</span>
      <span>${statusPill(camera.status)}</span>
      <span>${camera.quality}</span>
    </div>
  `).join("");
}

function renderProfile() {
  if (!activeUser) return;
  const profiles = readStore(STORAGE_KEYS.profiles, {});
  const profile = profiles[activeUser.email] ?? {};
  const isAdmin = activeUser.role === "admin";
  document.getElementById("profileEmail").value = activeUser.email;
  document.getElementById("profileCompany").value = profile.company ?? "";
  document.getElementById("profileContact").value = profile.contact ?? "";
  document.getElementById("profileAddress").value = profile.address ?? "";
  document.getElementById("contextTitle").textContent = isAdmin ? "VIZEX Latvia administrācija" : profile.company || profile.address || "Klienta objekts";
  document.getElementById("contextMeta").textContent = isAdmin ? "Admin konts | klientu e-pastu pārskats" : "8 kameras | online";

  document.getElementById("emailDatabasePanel").hidden = !isAdmin;
  if (!isAdmin) {
    document.getElementById("emailDatabase").innerHTML = "";
    return;
  }

  const emailDb = readStore(STORAGE_KEYS.emailDb, []);
  document.getElementById("emailDatabase").innerHTML = emailDb.map((entry) => `
    <div class="email-row">
      <span>${entry.email}</span>
      <small>${new Date(entry.createdAt).toLocaleDateString("lv-LV")} | ${entry.role} | ${entry.status}</small>
    </div>
  `).join("");
}

function enterApp(user) {
  activeUser = user;
  writeStore(STORAGE_KEYS.session, { email: user.email, startedAt: new Date().toISOString() });
  loginScreen.hidden = true;
  appShell.hidden = false;
  body.classList.add("authenticated", "client-mode");
  body.classList.toggle("admin-mode", user.role === "admin");
  document.getElementById("activeUserLabel").textContent = user.role === "admin" ? "ADMIN | vizexlatvia@gmail.com" : user.email;
  renderProfile();
  setView(user.role === "admin" ? "profile" : "live");
  showToast(user.role === "admin" ? "Admin profils atvērts" : "Klienta profils atvērts");
}

async function login(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const account = readStore(STORAGE_KEYS.auth, []).find((item) => item.email === normalizedEmail);
  if (!account) throw new Error("Konts ar šo e-pastu nav atrasts.");
  const passwordHash = await hashPassword(password, account.salt);
  if (passwordHash !== account.passwordHash) throw new Error("Nepareiza parole.");
  enterApp({ email: account.email, role: account.role ?? getRoleForEmail(account.email) });
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
    await createAccount(email, password);
    document.getElementById("loginEmail").value = normalizeEmail(email);
    document.getElementById("loginPassword").value = "";
    switchAuthPanel("login");
    showToast("Klienta konts izveidots. Varat pieslēgties.");
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("recoverForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const email = normalizeEmail(document.getElementById("recoverEmail").value);
  const exists = readStore(STORAGE_KEYS.emailDb, []).some((entry) => entry.email === email);
  if (!exists) {
    showToast("Šis e-pasts nav reģistrēts.");
    return;
  }

  const code = randomCode();
  const recovery = readStore(STORAGE_KEYS.recovery, {});
  recovery[email] = { code, createdAt: new Date().toISOString() };
  writeStore(STORAGE_KEYS.recovery, recovery);
  document.getElementById("recoveryCode").value = code;
  showToast(`Atkopšanas kods: ${code}`);
});

document.getElementById("resetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = normalizeEmail(document.getElementById("recoverEmail").value);
  const code = document.getElementById("recoveryCode").value.trim();
  const password = document.getElementById("newPassword").value;
  const recovery = readStore(STORAGE_KEYS.recovery, {});

  if (!recovery[email] || recovery[email].code !== code) {
    showToast("Atkopšanas kods nav derīgs.");
    return;
  }

  const accounts = readStore(STORAGE_KEYS.auth, []);
  const account = accounts.find((item) => item.email === email);
  account.salt = crypto.randomUUID();
  account.passwordHash = await hashPassword(password, account.salt);
  writeStore(STORAGE_KEYS.auth, accounts);
  delete recovery[email];
  writeStore(STORAGE_KEYS.recovery, recovery);
  showToast("Parole nomainīta. Varat pieslēgties.");
  switchAuthPanel("login");
});

document.getElementById("fillDemoButton").addEventListener("click", () => {
  document.getElementById("loginEmail").value = "client@vizex.app";
  document.getElementById("loginPassword").value = "demo123";
  showToast("Demo dati aizpildīti");
});

document.getElementById("logoutButton").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEYS.session);
  activeUser = null;
  appShell.hidden = true;
  loginScreen.hidden = false;
  body.classList.remove("authenticated", "client-mode", "admin-mode");
  switchAuthPanel("login");
  showToast("Sesija aizvērta");
});

document.getElementById("profileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const profiles = readStore(STORAGE_KEYS.profiles, {});
  profiles[activeUser.email] = {
    company: document.getElementById("profileCompany").value.trim(),
    contact: document.getElementById("profileContact").value.trim(),
    address: document.getElementById("profileAddress").value.trim()
  };
  writeStore(STORAGE_KEYS.profiles, profiles);
  renderProfile();
  showToast("Profils saglabāts");
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
  await ensureDemoAccount();
  migrateAdminAccount();
  setCamera(activeCamera);
  renderEvents();
  renderRecordings();
  renderCameraTable();

  const session = readStore(STORAGE_KEYS.session, null);
  const account = readStore(STORAGE_KEYS.auth, []).find((item) => item.email === session?.email);
  if (account) enterApp({ email: account.email, role: account.role ?? getRoleForEmail(account.email) });
}

boot();
