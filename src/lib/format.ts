export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function formatTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit" });
}

export function getSiteUrl() {
  return `${window.location.origin}${window.location.pathname}`.replace(/\/?$/, "/");
}
