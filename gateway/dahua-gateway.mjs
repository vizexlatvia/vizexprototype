import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const GATEWAY_TOKEN = (process.env.GATEWAY_TOKEN || "").trim();

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function parseDigestHeader(header) {
  const values = {};
  const source = header.replace(/^Digest\s+/i, "");
  const matches = source.matchAll(/([a-z0-9_-]+)=("([^"]*)"|([^,]*))/gi);

  for (const match of matches) {
    values[match[1]] = match[3] ?? match[4] ?? "";
  }

  return values;
}

function buildDigestAuthHeader(wwwAuthenticate, targetUrl, username, password) {
  const challenge = parseDigestHeader(wwwAuthenticate);
  const realm = challenge.realm ?? "";
  const nonce = challenge.nonce ?? "";
  const opaque = challenge.opaque;
  const method = "GET";
  const uri = `${targetUrl.pathname}${targetUrl.search}`;
  const qop = (challenge.qop ?? "").split(",").map((value) => value.trim()).find((value) => value === "auth");
  const algorithm = (challenge.algorithm || "MD5").toUpperCase();
  const cnonce = randomBytes(8).toString("hex");
  const nc = "00000001";

  const baseHa1 = md5(`${username}:${realm}:${password}`);
  const ha1 = algorithm === "MD5-SESS" ? md5(`${baseHa1}:${nonce}:${cnonce}`) : baseHa1;
  const ha2 = md5(`${method}:${uri}`);
  const response = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username.replace(/"/g, '\\"')}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`
  ];

  if (opaque) parts.push(`opaque="${opaque}"`);
  if (qop) {
    parts.push(`qop=${qop}`);
    parts.push(`nc=${nc}`);
    parts.push(`cnonce="${cnonce}"`);
  }

  return `Digest ${parts.join(", ")}`;
}

function isPrivateIpv4(value) {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const [first, second] = parts;
  return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function sendText(response, statusCode, message) {
  response.statusCode = statusCode;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(message);
}

function decodeStreamPayload(payload) {
  if (!payload) return {};

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function decodeV1StreamPath(pathname) {
  const parts = pathname.replace("/stream/v1/", "").split("/");

  return {
    token: decodePathSegment(parts[0] ?? ""),
    ip: decodePathSegment(parts[1] ?? ""),
    port: decodePathSegment(parts[2] ?? "80"),
    channel: decodePathSegment(parts[3] ?? "1"),
    subtype: decodePathSegment(parts[4] ?? "1"),
    user: decodePathSegment(parts[5] ?? ""),
    pass: decodePathSegment(parts.slice(6).join("/") ?? "")
  };
}

function getRequestValue(requestUrl, payload, key, fallback = "") {
  const payloadValue = payload[key];
  if (payloadValue !== undefined && payloadValue !== null) return String(payloadValue);
  return requestUrl.searchParams.get(key) ?? fallback;
}

function requestCamera(targetUrl, authHeader) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.protocol === "https:" ? https : http;
    const request = client.request(
      targetUrl,
      {
        method: "GET",
        headers: authHeader ? { Authorization: authHeader } : undefined,
        timeout: 10000
      },
      resolve
    );

    request.on("timeout", () => request.destroy(new Error("Camera request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

function pipeCameraResponse(cameraResponse, browserRequest, browserResponse) {
  browserRequest.on("close", () => {
    cameraResponse.destroy();
  });

  const statusCode = cameraResponse.statusCode ?? 502;
  browserResponse.statusCode = statusCode >= 400 ? statusCode : 200;
  browserResponse.setHeader("Access-Control-Allow-Origin", "*");
  browserResponse.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  browserResponse.setHeader("Content-Type", cameraResponse.headers["content-type"] ?? "multipart/x-mixed-replace");
  browserResponse.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  browserResponse.setHeader("Pragma", "no-cache");
  browserResponse.setHeader("X-Accel-Buffering", "no");
  cameraResponse.pipe(browserResponse);
}

function handleHealth(response) {
  response.statusCode = 200;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({
    status: "ok",
    service: "vizex-dahua-gateway",
    tokenRequired: Boolean(GATEWAY_TOKEN)
  }));
}

async function handleMjpeg(request, response, requestUrl, payload = {}) {
  const token = getRequestValue(requestUrl, payload, "token");
  if (GATEWAY_TOKEN && token !== GATEWAY_TOKEN) {
    sendText(response, 401, "Gateway token is missing or invalid.");
    return;
  }

  const ip = getRequestValue(requestUrl, payload, "ip").trim();
  const port = Number(getRequestValue(requestUrl, payload, "port", "80"));
  const username = getRequestValue(requestUrl, payload, "user");
  const password = getRequestValue(requestUrl, payload, "pass");
  const channel = getRequestValue(requestUrl, payload, "channel", "1").replace(/\D/g, "") || "1";
  const subtype = getRequestValue(requestUrl, payload, "subtype", "1").replace(/\D/g, "") || "1";

  if (!isPrivateIpv4(ip) || !Number.isInteger(port) || port < 1 || port > 65535) {
    sendText(response, 400, "Invalid local camera IP address or port.");
    return;
  }

  const targetUrl = new URL(`http://${ip}:${port}/cgi-bin/mjpg/video.cgi`);
  targetUrl.searchParams.set("channel", channel);
  targetUrl.searchParams.set("subtype", subtype);

  try {
    const firstResponse = await requestCamera(targetUrl);
    const challenge = firstResponse.headers["www-authenticate"];
    const challengeText = Array.isArray(challenge) ? challenge[0] : challenge;

    if (firstResponse.statusCode === 401 && challengeText && username) {
      firstResponse.resume();
      const authHeader = /^Digest/i.test(challengeText)
        ? buildDigestAuthHeader(challengeText, targetUrl, username, password)
        : `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
      const authenticatedResponse = await requestCamera(targetUrl, authHeader);
      pipeCameraResponse(authenticatedResponse, request, response);
      return;
    }

    pipeCameraResponse(firstResponse, request, response);
  } catch (error) {
    sendText(response, 502, error instanceof Error ? error.message : "Failed to connect to Dahua camera.");
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${PORT}`}`);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.end();
    return;
  }

  if (requestUrl.pathname === "/health") {
    handleHealth(response);
    return;
  }

  if (requestUrl.pathname === "/api/dahua/mjpeg") {
    void handleMjpeg(request, response, requestUrl);
    return;
  }

  if (requestUrl.pathname.startsWith("/api/dahua/mjpeg/")) {
    const payload = decodeStreamPayload(requestUrl.pathname.replace("/api/dahua/mjpeg/", ""));
    void handleMjpeg(request, response, requestUrl, payload);
    return;
  }

  if (requestUrl.pathname.startsWith("/stream/v1/")) {
    const payload = decodeV1StreamPath(requestUrl.pathname);
    void handleMjpeg(request, response, requestUrl, payload);
    return;
  }

  if (requestUrl.pathname.startsWith("/stream/")) {
    const payload = decodeStreamPayload(requestUrl.pathname.replace("/stream/", ""));
    void handleMjpeg(request, response, requestUrl, payload);
    return;
  }

  sendText(response, 404, "Not found.");
});

server.listen(PORT, HOST, () => {
  console.log(`VIZEX Dahua gateway running on http://${HOST}:${PORT}`);
  console.log(GATEWAY_TOKEN ? "Gateway token protection is enabled." : "Gateway token protection is disabled.");
});
