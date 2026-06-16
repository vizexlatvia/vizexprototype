import crypto from "node:crypto";

const API_BASE = (process.env.DOLYNK_API_BASE || "https://open-api-fk.dolynkcloud.com/open-api").replace(/\/+$/, "");
const ACCESS_KEY = process.env.DOLYNK_ACCESS_KEY || "";
const SECRET_KEY = process.env.DOLYNK_SECRET_KEY || "";
const PRODUCT_ID = process.env.DOLYNK_PRODUCT_ID || "";
const API_VERSION = process.env.DOLYNK_API_VERSION || "1.0";

let cachedToken = null;

function assertConfig() {
  if (!ACCESS_KEY || !SECRET_KEY || !PRODUCT_ID) {
    throw new Error("DoLynk environment variables are missing.");
  }
}

function createNonce() {
  return crypto.randomUUID().replace(/-/g, "");
}

function createTraceId() {
  return crypto.randomUUID();
}

function createSign(raw) {
  return crypto.createHmac("sha512", SECRET_KEY).update(raw).digest("hex").toUpperCase();
}

function createHeaders(appAccessToken = "") {
  const timestamp = Date.now().toString();
  const nonce = createNonce();
  const signSeed = appAccessToken
    ? `${ACCESS_KEY}${appAccessToken}${timestamp}${nonce}`
    : `${ACCESS_KEY}${timestamp}${nonce}`;

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Version: API_VERSION,
    AccessKey: ACCESS_KEY,
    Timestamp: timestamp,
    Nonce: nonce,
    Sign: createSign(signSeed),
    "Sign-Type": "simple",
    "X-TraceId-Header": createTraceId(),
    ProductId: PRODUCT_ID,
    ...(appAccessToken ? { AppAccessToken: appAccessToken } : {})
  };
}

async function callOpenApi(path, { body, appAccessToken = "", method = "POST" } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: createHeaders(appAccessToken),
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.msg || payload?.message || payload?.raw || `HTTP ${response.status}`;
    throw new Error(`DoLynk API error: ${message}`);
  }

  const success = payload?.code === "0" || payload?.code === 0 || payload?.success === true;
  if (!success) {
    const message = payload?.msg || payload?.message || "Unknown DoLynk error";
    throw new Error(`DoLynk API error: ${message}`);
  }

  return payload;
}

export async function getAppAccessToken() {
  assertConfig();

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const payload = await callOpenApi("/api-base/auth/getAppAccessToken");
  const token = payload?.data?.appAccessToken;
  const validitySeconds = Number(payload?.data?.validitySeconds || 300);

  if (!token) {
    throw new Error("DoLynk did not return appAccessToken.");
  }

  cachedToken = {
    token,
    expiresAt: Date.now() + Math.max(validitySeconds - 60, 60) * 1000
  };

  return token;
}

export async function createHlsLive({ deviceId, channelId, streamType }) {
  const appAccessToken = await getAppAccessToken();
  const payload = await callOpenApi("/api-iot/device/createDeviceHlsLive", {
    appAccessToken,
    body: {
      deviceId,
      channelId,
      streamType
    }
  });

  const streams = Array.isArray(payload?.data?.streamList) ? payload.data.streamList : [];
  const selected = streams.find((item) => String(item?.streamType) === String(streamType)) || streams[0];
  const playlistUrl = selected?.hls || payload?.data?.hls || "";

  if (!playlistUrl) {
    throw new Error("DoLynk did not return an HLS playlist URL.");
  }

  return {
    deviceId,
    channelId,
    streamType: String(selected?.streamType ?? streamType),
    liveToken: payload?.data?.liveToken || "",
    liveStatus: payload?.data?.liveStatus || "",
    coverUrl: selected?.coverUrl || "",
    playlistUrl
  };
}
