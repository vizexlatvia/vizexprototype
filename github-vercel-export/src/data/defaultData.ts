import type { Camera, EventItem, Recording, Site } from "../types";

export const defaultSite: Site = {
  id: "local-demo",
  name: "Brīvības 118",
  address: "Rīga, Brīvības 118",
  status: "online",
  is_default: true
};

export const defaultCameras: Camera[] = [
  { id: 1, code: "CAM-01", name: "Ieeja", location: "Galvenā ieeja", model: "VZX-4K Dome", status: "Online", quality: "1080p" },
  { id: 2, code: "CAM-02", name: "Recepcija", location: "Klientu zona", model: "VZX-4K Dome", status: "Online", quality: "1080p" },
  { id: 3, code: "CAM-03", name: "Noliktava", location: "Aizmugures noliktava", model: "VZX Bullet AI", status: "Online", quality: "4K" },
  { id: 4, code: "CAM-04", name: "Stāvvieta", location: "Āra perimetrs", model: "VZX Bullet AI", status: "Online", quality: "4K" },
  { id: 5, code: "CAM-05", name: "Birojs", location: "2. stāva birojs", model: "VZX Mini", status: "Online", quality: "720p" },
  { id: 6, code: "CAM-06", name: "Tehniskā telpa", location: "Serveru zona", model: "VZX Mini", status: "Uzmanību", quality: "720p" },
  { id: 7, code: "CAM-07", name: "Rampa", location: "Piegādes rampa", model: "VZX PTZ", status: "Online", quality: "1080p" },
  { id: 8, code: "CAM-08", name: "Kase", location: "Norēķinu zona", model: "VZX-4K Dome", status: "Online", quality: "1080p" }
];

export const defaultRecordings: Recording[] = [
  { time: "08:42", camera: "CAM-01 Ieeja", detail: "Kustība pie galvenās ieejas", length: "00:46" },
  { time: "10:18", camera: "CAM-04 Stāvvieta", detail: "Transporta aktivitāte", length: "02:14" },
  { time: "12:05", camera: "CAM-03 Noliktava", detail: "Darbinieku kustība zonā", length: "01:08" },
  { time: "14:31", camera: "CAM-06 Tehniskā telpa", detail: "Īslaicīgs signāla kritums", length: "00:19" },
  { time: "16:20", camera: "CAM-08 Kase", detail: "AI atzīmēta ikdienas aktivitāte", length: "03:02" }
];

export const defaultEvents: EventItem[] = [
  { time: "16:42", message: "CAM-01: tiešraide stabila" },
  { time: "16:43", message: "AI pārbaude pabeigta" },
  { time: "16:44", message: "Arhīvs sinhronizēts" },
  { time: "16:45", message: "Klienta piekļuve aktīva" }
];
