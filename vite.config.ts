import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createHlsLive } from "./api/dolynk/_client.js";

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function parseDigestHeader(header: string) {
  const values: Record<string, string> = {};
  const source = header.replace(/^Digest\s+/i, "");
  const matches = source.matchAll(/([a-z0-9_-]+)=("([^"]*)"|([^,]*))/gi);

  for (const match of matches) {
    values[match[1]] = match[3] ?? match[4] ?? "";
  }

  return values;
}

function buildDigestAuthHeader(wwwAuthenticate: string, targetUrl: URL, username: string, password: string) {
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

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const [first, second] = parts;
  return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function requestCamera(targetUrl: URL, authHeader?: string) {
  return new Promise<IncomingMessage>((resolve, reject) => {
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

    request.on("timeout", () => request.destroy(new Error("Kameras pieprasījums pārsniedza laika limitu.")));
    request.on("error", reject);
    request.end();
  });
}

function pipeCameraResponse(cameraResponse: IncomingMessage, browserRequest: IncomingMessage, browserResponse: ServerResponse) {
  browserRequest.on("close", () => {
    cameraResponse.destroy();
  });

  const statusCode = cameraResponse.statusCode ?? 502;
  browserResponse.statusCode = statusCode >= 400 ? statusCode : 200;
  browserResponse.setHeader("Content-Type", cameraResponse.headers["content-type"] ?? "multipart/x-mixed-replace");
  browserResponse.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  browserResponse.setHeader("Pragma", "no-cache");
  browserResponse.setHeader("X-Accel-Buffering", "no");
  cameraResponse.pipe(browserResponse);
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(text) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function dahuaLocalGatewayPlugin(): Plugin {
  return {
    name: "vizex-dahua-local-gateway",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

        if (requestUrl.pathname === "/api/dolynk/hls") {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          try {
            const body = await readJsonBody(request);
            const deviceId = String(body.deviceId ?? "").trim();
            const channelId = String(body.channelId ?? "0").trim();
            const streamType = String(body.streamType ?? "1").trim();

            if (!deviceId) {
              response.statusCode = 400;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ error: "deviceId is required" }));
              return;
            }

            const stream = await createHlsLive({ deviceId, channelId, streamType });
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify(stream));
          } catch (error) {
            response.statusCode = 500;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown DoLynk error"
            }));
          }

          return;
        }

        if (requestUrl.pathname !== "/api/dahua/mjpeg") {
          next();
          return;
        }

        const ip = (requestUrl.searchParams.get("ip") ?? "").trim();
        const port = Number(requestUrl.searchParams.get("port") ?? "80");
        const username = requestUrl.searchParams.get("user") ?? "";
        const password = requestUrl.searchParams.get("pass") ?? "";
        const channel = requestUrl.searchParams.get("channel")?.replace(/\D/g, "") || "1";
        const subtype = requestUrl.searchParams.get("subtype")?.replace(/\D/g, "") || "1";

        if (!isPrivateIpv4(ip) || !Number.isInteger(port) || port < 1 || port > 65535) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end("Nederīga lokālās kameras IP adrese vai ports.");
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
          response.statusCode = 502;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(error instanceof Error ? error.message : "Neizdevās pieslēgties Dahua kamerai.");
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), dahuaLocalGatewayPlugin()],
  build: {
    outDir: "dist"
  }
});
