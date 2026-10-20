"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Icon } from "@/components/icon";

/**
 * Lector de QR integrado a la app — hasta ahora el QR de un tablero/sala
 * (ver /api/tableros/[id]/qr) solo se podía leer con la cámara nativa del
 * teléfono, que abre el link en el navegador pero no ofrece volver a
 * escanear sin salir de ahí. Decodifica cuadro a cuadro con jsQR sobre un
 * canvas oculto (no depende de BarcodeDetector, que no anda en todos los
 * navegadores) — apenas detecta algo, corta la cámara y muestra el
 * resultado antes de navegar, así el técnico ve qué escaneó.
 */
export function EscanearQr() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectado, setDetectado] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);

  const detener = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setEscaneando(false);
  }, []);

  const iniciar = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setEscaneando(true);

      function tick() {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const resultado = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (resultado?.data) {
          detener();
          setDetectado(resultado.data);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      }
      tick();
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "No se pudo acceder a la cámara — revisá los permisos del navegador para este sitio."
          : "No se encontró ninguna cámara disponible en este dispositivo.",
      );
    }
  }, [detener]);

  useEffect(() => {
    // iniciar() es async — el setState que contiene corre en el callback
    // de la promesa de getUserMedia, no de forma sincrónica acá, que es
    // justo el patrón recomendado ("llamar setState en un callback cuando
    // cambia el estado externo"); el lint no distingue eso de un setState
    // realmente sincrónico, de ahí el disable puntual.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    iniciar();
    return () => detener();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar/desmontar
  }, []);

  const esLinkPropio = detectado && (detectado.startsWith("/") || detectado.includes("/planos/"));

  return (
    <div>
      <div className="page-heading">
        <h1>Escanear QR</h1>
        <p>Apuntá la cámara al QR pegado en el tablero o la sala</p>
      </div>

      <div className="card">
        {error && (
          <div className="hint" style={{ color: "var(--accent-2)", marginBottom: 10 }}>
            {error}
          </div>
        )}

        {!detectado && !error && (
          <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "3 / 4", maxWidth: 420 }}>
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {escaneando && (
              <div
                style={{
                  position: "absolute",
                  inset: "18%",
                  border: "2px solid var(--accent)",
                  borderRadius: 12,
                  boxShadow: "0 0 0 999px rgba(0,0,0,0.35)",
                }}
              />
            )}
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {error && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setError(null);
              void iniciar();
            }}
            style={{ marginTop: 10 }}
          >
            Reintentar
          </button>
        )}

        {detectado && (
          <div style={{ marginTop: error ? 0 : 10 }}>
            <div className="hint" style={{ marginBottom: 8 }}>
              Se leyó:
            </div>
            <div style={{ wordBreak: "break-all", fontSize: 13, marginBottom: 12 }}>{detectado}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {esLinkPropio ? (
                <a className="btn btn-primary" href={detectado}>
                  <Icon name="eye" size={14} /> Abrir
                </a>
              ) : (
                <div className="hint" style={{ color: "var(--warn)" }}>
                  Esto no parece un QR de Informes — no se abre automáticamente.
                </div>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setDetectado(null);
                  void iniciar();
                }}
              >
                Escanear de nuevo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
