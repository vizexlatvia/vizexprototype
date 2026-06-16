import { createHlsLive } from "./_client.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const deviceId = String(body.deviceId || "").trim();
    const channelId = String(body.channelId ?? "0").trim();
    const streamType = String(body.streamType ?? "1").trim();

    if (!deviceId) {
      res.status(400).json({ error: "deviceId is required" });
      return;
    }

    const stream = await createHlsLive({ deviceId, channelId, streamType });
    res.status(200).json(stream);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown DoLynk error"
    });
  }
}
