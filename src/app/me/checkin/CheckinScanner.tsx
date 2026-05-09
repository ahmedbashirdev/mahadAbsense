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
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const stop = () => {
    stopRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  // Make sure we release the camera if the component unmounts mid-scan.
  useEffect(() => {
    return () => {
      stopRef.current = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleDetected = (raw: string) => {
    stop();
    try {
      const url = new URL(raw, window.location.origin);
      window.location.href = url.toString();
    } catch {
      setError("الـ QR لا يحتوي على رابط صالح.");
    }
  };

  const start = async () => {
    setError(null);
    setInfo(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("متصفحك لا يدعم الوصول للكاميرا. جرب من تليفونك أو استخدم متصفح أحدث.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("لم يتم السماح بالوصول للكاميرا. اسمح للموقع بالكاميرا من إعدادات المتصفح.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("لم يتم العثور على كاميرا في الجهاز.");
      } else {
        const msg = e instanceof Error ? e.message : "فشل في تشغيل الكاميرا.";
        setError(msg);
      }
      return;
    }

    streamRef.current = stream;
    stopRef.current = false;
    setScanning(true);

    // Wait for the next animation frame so React commits the new render and
    // the <video> element actually exists in the DOM. Otherwise videoRef.current
    // is still null right after setScanning(true).
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const video = videoRef.current;
    if (!video) {
      stop();
      setError("تعذّر تشغيل الكاميرا في الواجهة. حاول مرة أخرى.");
      return;
    }

    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // iOS sometimes rejects until the user taps; the user already tapped
      // so this is unlikely, but just in case we surface a friendly hint.
      setInfo("اضغط على الفيديو لو لم يبدأ تلقائيًا.");
    }

    // Pick the best detection backend.
    const useNativeDetector = typeof window !== "undefined" && !!window.BarcodeDetector;
    let nativeDetector: { detect: (img: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } | null = null;
    if (useNativeDetector && window.BarcodeDetector) {
      try {
        nativeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        nativeDetector = null;
      }
    }

    // Fallback: jsQR (pure-JS, works on iOS Safari < 17 and any browser
    // without BarcodeDetector). Loaded lazily so it doesn't bloat the
    // initial bundle.
    let jsQR: ((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;
    if (!nativeDetector) {
      try {
        const mod = await import("jsqr");
        jsQR = mod.default as unknown as (
          data: Uint8ClampedArray,
          w: number,
          h: number,
        ) => { data: string } | null;
      } catch {
        setError("فشل تحميل قارئ الـ QR. تقدر تستخدم تطبيق الكاميرا في تليفونك بدلاً من ذلك.");
        stop();
        return;
      }
    }

    const tick = async () => {
      if (stopRef.current) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2) {
        rafRef.current = requestAnimationFrame(() => { void tick(); });
        return;
      }

      try {
        if (nativeDetector) {
          const codes = await nativeDetector.detect(v);
          if (codes.length > 0 && codes[0].rawValue) {
            handleDetected(codes[0].rawValue);
            return;
          }
        } else if (jsQR) {
          const canvas = canvasRef.current;
          if (!canvas) {
            rafRef.current = requestAnimationFrame(() => { void tick(); });
            return;
          }
          const w = v.videoWidth;
          const h = v.videoHeight;
          if (w === 0 || h === 0) {
            rafRef.current = requestAnimationFrame(() => { void tick(); });
            return;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            rafRef.current = requestAnimationFrame(() => { void tick(); });
            return;
          }
          ctx.drawImage(v, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const result = jsQR(imageData.data, w, h);
          if (result && result.data) {
            handleDetected(result.data);
            return;
          }
        }
      } catch {
        // Ignore per-frame errors and keep scanning
      }

      rafRef.current = requestAnimationFrame(() => { void tick(); });
    };

    rafRef.current = requestAnimationFrame(() => { void tick(); });
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

      {info && (
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
          {info}
        </div>
      )}

      {/* Always render the video container — toggle visibility instead of mounting/unmounting,
          so videoRef.current is available the moment we try to attach the stream. */}
      <div
        style={{
          display: scanning ? "block" : "none",
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
          autoPlay
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div className="qr-frame" />
      </div>

      {/* Hidden helper canvas used only by the jsQR fallback path. */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

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
        <button
          type="button"
          className="btn btn-secondary"
          onClick={stop}
          style={{ marginTop: "1rem", width: "100%" }}
        >
          إيقاف الكاميرا
        </button>
      )}

      <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center" }}>
        وجّه كاميرتك ناحية شاشة المسؤول وثبّت الإطار. لو في مشكلة، تقدر تستخدم تطبيق الكاميرا في تليفونك مباشرةً.
      </p>
    </div>
  );
}
