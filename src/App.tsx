import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./components/Dashboard";
import { Toast } from "./components/Toast";
import { defaultCameras, defaultEvents, defaultRecordings, defaultSite } from "./data/defaultData";
import { adminEmail, localProfileCacheKey } from "./lib/config";
import { formatTime, getSiteUrl, normalizeEmail } from "./lib/format";
import { supabase } from "./lib/supabase";
import { readStore, writeStore } from "./lib/storage";
import type { AppUser, AuthPanel, Camera, EmailRegistryEntry, EventItem, Profile, Recording, Site, ViewName } from "./types";

type ProfileCache = Record<string, Profile>;

function getRoleForEmail(email: string): AppUser["role"] {
  return normalizeEmail(email) === adminEmail ? "admin" : "client";
}

function toAppUser(user: User): AppUser {
  const email = normalizeEmail(user.email ?? "");
  return { id: user.id, email, role: getRoleForEmail(email) };
}

function emptyProfile(): Profile {
  return { company: "", contact: "", address: "" };
}

function mapRecordings(rows: Array<{ camera_code: string; camera_name: string | null; detail: string; recorded_at: string; length_label: string }>): Recording[] {
  return rows.map((item) => ({
    time: formatTime(item.recorded_at),
    camera: `${item.camera_code} ${item.camera_name ?? ""}`.trim(),
    detail: item.detail,
    length: item.length_label
  }));
}

function mapEvents(rows: Array<{ camera_code: string | null; message: string; event_time: string }>): EventItem[] {
  return rows.map((item) => ({
    time: formatTime(item.event_time),
    message: item.camera_code ? `${item.camera_code}: ${item.message}` : item.message
  }));
}

export default function App() {
  const [authPanel, setAuthPanel] = useState<AuthPanel>("login");
  const [resetVisible, setResetVisible] = useState(false);
  const [activeUser, setActiveUser] = useState<AppUser | null>(null);
  const [activeView, setActiveView] = useState<ViewName>("overview");
  const [site, setSite] = useState<Site>(defaultSite);
  const [cameras, setCameras] = useState<Camera[]>(defaultCameras);
  const [recordings, setRecordings] = useState<Recording[]>(defaultRecordings);
  const [events, setEvents] = useState<EventItem[]>(defaultEvents);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [emailRegistry, setEmailRegistry] = useState<EmailRegistryEntry[]>([]);
  const [activeCameraCode, setActiveCameraCode] = useState(defaultCameras[0].code);
  const [toast, setToast] = useState("");

  const activeCamera = useMemo(
    () => cameras.find((camera) => camera.code === activeCameraCode) ?? cameras[0] ?? defaultCameras[0],
    [activeCameraCode, cameras]
  );

  function showToast(message: string) {
    setToast(message);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const syncEmailRegistry = useCallback(async (user: User, status = "active") => {
    const appUser = toAppUser(user);
    const { error } = await supabase
      .from("client_email_registry")
      .upsert({
        user_id: appUser.id,
        email: appUser.email,
        role: appUser.role,
        status,
        last_login_at: new Date().toISOString()
      }, { onConflict: "email" });

    if (error) console.warn("Email registry sync failed:", error.message);
  }, []);

  const fetchEmailRegistry = useCallback(async () => {
    const { data, error } = await supabase
      .from("client_email_registry")
      .select("email, role, status, created_at, last_login_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setEmailRegistry((data ?? []) as EmailRegistryEntry[]);
  }, []);

  const fetchProfile = useCallback(async (user: AppUser) => {
    const localProfiles = readStore<ProfileCache>(localProfileCacheKey, {});
    let nextProfile = localProfiles[user.email] ?? emptyProfile();

    const { data, error } = await supabase
      .from("client_profiles")
      .select("company, contact, address")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      nextProfile = {
        company: data.company ?? "",
        contact: data.contact ?? "",
        address: data.address ?? ""
      };
      localProfiles[user.email] = nextProfile;
      writeStore(localProfileCacheKey, localProfiles);
    }

    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const loadCloudProjectData = useCallback(async () => {
    const { data: siteRows, error: siteError } = await supabase
      .from("sites")
      .select("id, name, address, status, is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (siteError) throw siteError;
    if (!siteRows?.length) return;

    const nextSite = siteRows[0] as Site;
    setSite(nextSite);

    const [
      { data: cameraRows, error: cameraError },
      { data: recordingRows, error: recordingError },
      { data: eventRows, error: eventError }
    ] = await Promise.all([
      supabase.from("cameras").select("id, sort_order, code, name, location, model, status, quality").eq("site_id", nextSite.id).order("sort_order"),
      supabase.from("recordings").select("camera_code, camera_name, detail, recorded_at, length_label").eq("site_id", nextSite.id).order("recorded_at", { ascending: false }).limit(12),
      supabase.from("events").select("camera_code, message, event_time").eq("site_id", nextSite.id).order("event_time", { ascending: false }).limit(8)
    ]);

    if (cameraError) throw cameraError;
    if (recordingError) throw recordingError;
    if (eventError) throw eventError;

    if (cameraRows?.length) {
      const nextCameras = cameraRows as Camera[];
      setCameras(nextCameras);
      setActiveCameraCode(nextCameras[0].code);
    }
    if (recordingRows?.length) setRecordings(mapRecordings(recordingRows));
    if (eventRows?.length) setEvents(mapEvents(eventRows));
  }, []);

  const enterApp = useCallback(async (user: AppUser) => {
    setActiveUser(user);
    setActiveView(user.role === "admin" ? "admin" : "overview");

    try {
      await loadCloudProjectData();
      showToast("Projekta dati ielādēti no Supabase");
    } catch (error) {
      showToast("Supabase dati vēl nav pilnībā gatavi, rādu lokālo demo skatu");
    }

    try {
      await fetchProfile(user);
      if (user.role === "admin") await fetchEmailRegistry();
    } catch (error) {
      console.warn("Profile bootstrap failed:", error);
    }
  }, [fetchEmailRegistry, fetchProfile, loadCloudProjectData]);

  async function createAccount(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    const role = getRoleForEmail(normalizedEmail);
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: getSiteUrl(),
        data: { role }
      }
    });

    if (error) throw error;
    if (data.session?.user) {
      await syncEmailRegistry(data.session.user);
      await enterApp(toAppUser(data.session.user));
      showToast("Konts izveidots un pieslēgts Supabase.");
      return;
    }
    showToast("Konts izveidots. Pārbaudiet e-pastu apstiprināšanas saitei.");
  }

  async function resendSignupConfirmation(email: string) {
    if (!email) {
      showToast("Ievadiet e-pastu, kam nosūtīt apstiprinājumu.");
      return;
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalizeEmail(email),
      options: { emailRedirectTo: getSiteUrl() }
    });

    if (error) throw error;
    showToast("Apstiprinājuma e-pasts nosūtīts vēlreiz.");
  }

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password
    });

    if (error) throw error;
    await syncEmailRegistry(data.user);
    await enterApp(toAppUser(data.user));
  }

  async function recover(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: getSiteUrl()
    });
    if (error) throw error;
    showToast("Paroles atjaunošanas saite nosūtīta uz e-pastu.");
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setResetVisible(false);
    setAuthPanel("login");
    showToast("Parole nomainīta. Varat pieslēgties.");
  }

  async function logout() {
    await supabase.auth.signOut();
    setActiveUser(null);
    setAuthPanel("login");
    showToast("Sesija aizvērta");
  }

  async function saveProfile(nextProfile: Profile) {
    if (!activeUser) return;
    const { error } = await supabase
      .from("client_profiles")
      .upsert({
        user_id: activeUser.id,
        email: activeUser.email,
        company: nextProfile.company,
        contact: nextProfile.contact,
        address: nextProfile.address,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });

    if (error) throw error;
    const cache = readStore<ProfileCache>(localProfileCacheKey, {});
    cache[activeUser.email] = nextProfile;
    writeStore(localProfileCacheKey, cache);
    setProfile(nextProfile);
    showToast("Profils saglabāts Supabase mākonī");
  }

  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    async function reloadProjectFromCloud() {
      try {
        await loadCloudProjectData();
        if (activeUser?.role === "admin") await fetchEmailRegistry();
        showToast("Supabase izmaiņas atjauninātas");
      } catch (error) {
        console.warn("Realtime refresh failed:", error);
      }
    }

    if (activeUser) {
      channel = supabase
        .channel("vizex-project-cloud-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "sites" }, reloadProjectFromCloud)
        .on("postgres_changes", { event: "*", schema: "public", table: "cameras" }, reloadProjectFromCloud)
        .on("postgres_changes", { event: "*", schema: "public", table: "recordings" }, reloadProjectFromCloud)
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, reloadProjectFromCloud)
        .on("postgres_changes", { event: "*", schema: "public", table: "client_profiles" }, reloadProjectFromCloud)
        .subscribe();
    }

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [activeUser, fetchEmailRegistry, loadCloudProjectData]);

  useEffect(() => {
    const { data: authSubscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setActiveUser(null);
        setAuthPanel("recover");
        setResetVisible(true);
        showToast("Ievadiet jauno paroli.");
        return;
      }

      if (session?.user && event === "SIGNED_IN") {
        await syncEmailRegistry(session.user);
        await enterApp(toAppUser(session.user));
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        await syncEmailRegistry(data.session.user);
        await enterApp(toAppUser(data.session.user));
      }
    });

    return () => authSubscription.subscription.unsubscribe();
  }, [enterApp, syncEmailRegistry]);

  return (
    <>
      {activeUser ? (
        <Dashboard
          user={activeUser}
          site={site}
          cameras={cameras}
          recordings={recordings}
          events={events}
          profile={profile}
          emailRegistry={emailRegistry}
          activeView={activeView}
          activeCamera={activeCamera}
          onViewChange={setActiveView}
          onCameraChange={(camera) => setActiveCameraCode(camera.code)}
          onLogout={logout}
          onSaveProfile={saveProfile}
          onToast={showToast}
        />
      ) : (
        <AuthScreen
          activePanel={authPanel}
          resetVisible={resetVisible}
          onPanelChange={setAuthPanel}
          onLogin={login}
          onRegister={createAccount}
          onRecover={recover}
          onUpdatePassword={updatePassword}
          onResendConfirmation={resendSignupConfirmation}
          onToast={showToast}
        />
      )}
      <Toast message={toast} />
    </>
  );
}
