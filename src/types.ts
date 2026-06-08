export type UserRole = "client" | "admin";
export type ViewName = "overview" | "live" | "recordings" | "servers" | "configuration" | "profile" | "admin";
export type AuthPanel = "login" | "register" | "recover";

export type AppUser = {
  id: string;
  email: string;
  role: UserRole;
};

export type Site = {
  id: string;
  name: string;
  address: string;
  status: string;
  is_default?: boolean;
};

export type Camera = {
  id: string | number;
  sort_order?: number;
  code: string;
  name: string;
  location: string;
  model: string;
  status: string;
  quality: string;
};

export type Recording = {
  time: string;
  camera: string;
  detail: string;
  length: string;
};

export type EventItem = {
  time: string;
  message: string;
};

export type Profile = {
  company: string;
  contact: string;
  address: string;
};

export type EmailRegistryEntry = {
  email: string;
  role: UserRole;
  status: string;
  created_at: string;
  last_login_at?: string | null;
};
