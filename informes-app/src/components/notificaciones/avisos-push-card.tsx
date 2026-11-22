"use client";

import { useEffect, useState } from "react";
import { guardarSuscripcionPushAction, eliminarSuscripcionPushAction } from "@/app/(app)/cuenta/actions-push";
import { Icon } from "@/components/icon";

type Estado = "sin_soporte" | "cargando" | "inactivo" | "activo" | "denegado";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Normal);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function AvisosPushCard() {
  const [estado, setEstado] = useState<Estado>(() => {
    if (typeof window === "undefined") return "cargando";
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "sin_soporte";
    if (Notification.permission === "denied") return "denegado";
    return "inactivo"; // se confirma con precisión en el primer click — alcanza para decidir qué botón mostrar
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (estado !== "inactivo") return;
    (async () => {
      const registro = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = await registro?.pushManager.getSubscription();
      if (sub) setEstado("activo");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar, para leer el estado real de la suscripción
  }, []);

  async function activar() {
    setBusy(true);
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegado" : "inactivo");
        return;
      }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setError("Los avisos push no están configurados todavía (falta la clave VAPID).");
        return;
      }
      const registro = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("No se pudo armar la suscripción.");
        return;
      }
      const res = await guardarSuscripcionPushAction({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, navigator.userAgent);
      if (!res.success) {
        setError(res.error || "No se pudo guardar la suscripción.");
        return;
      }
      setEstado("activo");
    } catch {
      setError("No se pudo activar los avisos en este navegador.");
    } finally {
      setBusy(false);
    }
  }

  async function desactivar() {
    setBusy(true);
    setError(null);
    try {
      const registro = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = await registro?.pushManager.getSubscription();
      if (sub) {
        await eliminarSuscripcionPushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } catch {
      setError("No se pudo desactivar.");
    } finally {
      setBusy(false);
    }
  }

  if (estado === "sin_soporte") {
    return (
      <div className="card">
        <div className="section-label">Avisos</div>
        <p className="empty-note">Este navegador no admite avisos push.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-label">Avisos</div>
      <p className="empty-note" style={{ marginBottom: 10 }}>
        Si hacés alguna guardia, acá se activan los avisos push de Guardia General (te activaron, te piden asumir un cambio...).
        WhatsApp sigue siendo un refuerzo manual — el aviso garantizado es este.
      </p>
      {estado === "denegado" && <p className="error-text">Bloqueaste las notificaciones para este sitio — activalas desde la configuración del navegador.</p>}
      {estado !== "denegado" && (
        <button type="button" className="btn btn-primary btn-sm" onClick={estado === "activo" ? desactivar : activar} disabled={busy}>
          <Icon name="bell" size={13} /> {busy ? "Un momento..." : estado === "activo" ? "Desactivar avisos" : "Activar avisos"}
        </button>
      )}
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
