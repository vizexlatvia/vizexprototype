import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type DolynkVideoPlayerProps = {
  deviceId: string;
  channelId: string;
  streamType: string;
  className?: string;
  muted?: boolean;
};

type StreamState =
  | { status: "loading"; message: string }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

export function DolynkVideoPlayer({
  deviceId,
  channelId,
  streamType,
  className = "",
  muted = true
}: DolynkVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamState, setStreamState] = useState<StreamState>({
    status: "loading",
    message: "Savienojas ar DoLynk..."
  });

  useEffect(() => {
    const currentVideo = videoRef.current;
    if (!currentVideo || !deviceId) return;
    const videoElement: HTMLVideoElement = currentVideo;

    let cancelled = false;
    let hls: Hls | null = null;

    setStreamState({
      status: "loading",
      message: "Savienojas ar DoLynk..."
    });

    async function loadStream() {
      try {
        const response = await fetch("/api/dolynk/hls", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            deviceId,
            channelId,
            streamType
          })
        });

        const responseText = await response.text();
        let payload: Record<string, unknown> = {};

        try {
          payload = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
        } catch {
          throw new Error(responseText || "DoLynk endpoint neatgrieza derigu JSON atbildi.");
        }

        if (!response.ok) {
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : "Neizdevas sanemt DoLynk streamu."
          );
        }

        const playlistUrl = String(payload.playlistUrl || "");
        if (!playlistUrl) {
          throw new Error("DoLynk neatgrieza HLS adresi.");
        }

        if (cancelled) return;

        if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
          videoElement.src = playlistUrl;
          await videoElement.play().catch(() => undefined);
        } else if (Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true
          });
          hls.loadSource(playlistUrl);
          hls.attachMedia(videoElement);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal && !cancelled) {
              setStreamState({
                status: "error",
                message: "DoLynk video atskanosana neizdevas."
              });
            }
          });
        } else {
          throw new Error("Si parlukprogramma neatbalsta HLS atskanosanu.");
        }

        setStreamState({
          status: "ready",
          message: "DoLynk plūsma aktīva"
        });
      } catch (error) {
        if (cancelled) return;
        setStreamState({
          status: "error",
          message: error instanceof Error ? error.message : "Nezinama DoLynk kluda"
        });
      }
    }

    void loadStream();

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
      videoElement.pause();
      videoElement.removeAttribute("src");
      videoElement.load();
    };
  }, [channelId, deviceId, streamType]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        className={className}
        muted={muted}
        playsInline
      />
      {streamState.status !== "ready" && (
        <div className={`stream-placeholder ${streamState.status === "error" ? "error" : ""}`}>
          <strong>{streamState.status === "error" ? "DoLynk kluda" : "Ielade plūsmu"}</strong>
          <span>{streamState.message}</span>
        </div>
      )}
    </>
  );
}
