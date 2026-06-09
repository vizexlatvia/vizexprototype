import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";

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
  const authResponse = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username.replace(/"/g, '\\"')}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${authResponse}"`,
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

    request.on("timeout", () => request.destroy(new Error("Kameras pieprasījums pārsniedza laika limitu.")));
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
  browserResponse.setHeader("Content-Type", cameraResponse.headers["content-type"] ?? "multipart/x-mixed-replace");
  browserResponse.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  browserResponse.setHeader("Pragma", "no-cache");
  browserResponse.setHeader("X-Accel-Buffering", "no");
  cameraResponse.pipe(browserResponse);
}

function dahuaLocalGatewayPlugin() {
  return {
    name: "vizex-dahua-local-gateway",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

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
