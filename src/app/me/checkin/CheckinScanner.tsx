"use client"
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): {
        detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
      };
      getSupportedFormats?(): Promise<string[]>;
    };
  }
}

export default function CheckinScanner() {
  const [supported, setSupported] = useState<null | boolean>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    // Deferred so we don't trip react-hooks/set-state-in-effect.
    Promise.resolve().then(() => {
      setSupported(typeof window !== "undefined" && !!window.BarcodeDetector);
    });
  }, []);

  const stop = () => {
    stopRef.current = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const start = async () => {
    setError(null);
    if (!window.BarcodeDetector) {
      setError("متصفحك لا يدعم قراءة QR. استخدم تطبيق الكاميرا في تليفونك بدلاً من ذلك.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      stopRef.current = false;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => {
        if (stopRef.current) return;
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const value = codes[0].rawValue;
            stop();
            // The token we encode is a full URL — navigate to it.
            try {
              const url = new URL(value);
              // Same-origin redirect is safe; cross-origin we just navigate too,
              // since the user explicitly scanned it.
              window.location.href = url.toString();
            } catch {
              setError("الـ QR لا يحتوي على رابط صالح.");
            }
            return;
          }
        } catch {
          // ignore per-frame errors and keep scanning
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "فشل في تشغيل الكاميرا.";
      setError(msg);
      stop();
    }
  };

  return (
    <div className="card animate-fade-in" style={{ maxWidth: 560, marginInline: "auto" }}>
      {error && (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            color: "var(--danger)",
            padding: "0.75rem",
            borderRadius: "var(--border-radius-sm)",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {supported === false && (
        <div
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.08)",
            color: "var(--warning)",
            padding: "0.75rem",
            borderRadius: "var(--border-radius-sm)",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          متصفحك لا يدعم القراءة المباشرة للـ QR. تقدر تفتح تطبيق الكاميرا في تليفونك (أي تطبيق كاميرا حديث بيقرأ QR تلقائيًا) ويوجهك للرابط.
        </div>
      )}

      {!scanning ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={start}
          style={{ width: "100%", padding: "0.9rem", fontSize: "1.05rem" }}
        >
          📷 افتح الكاميرا وامسح QR
        </button>
      ) : (
        <>
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "1 / 1",
              backgroundColor: "#000",
              borderRadius: "var(--border-radius-md)",
              overflow: "hidden",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div className="qr-frame" />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={stop}
            style={{ marginTop: "1rem", width: "100%" }}
          >
            إيقاف الكاميرا
          </button>
        </>
      )}

      <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center" }}>
        وجّه كاميرتك ناحية شاشة المسؤول وحافظ على الإطار ثابتاً.
      </p>
    </div>
  );
}
