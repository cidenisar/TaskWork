// Service worker propio solo para Web Push (no cachea nada de la app —
// esta app no es una PWA offline, este SW existe únicamente para poder
// recibir avisos push en segundo plano). Ver CRITERIOS_Y_IDEAS.md §6/§7.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Se dispara cuando el navegador recibe el push del servidor — incluso si
// la app no está abierta. Confirmamos "entregada" ACÁ (no al mostrarla ni
// al tocarla): es el único momento en que sabemos que de verdad llegó al
// dispositivo, antes de que la persona haga nada.
self.addEventListener("push", (event) => {
  let datos = { title: "TaskWork", body: "Tenés una novedad.", url: "/", notificacionId: null };
  try {
    datos = { ...datos, ...event.data.json() };
  } catch {
    // Si el payload no es JSON (no debería pasar, pero nunca reventar el push por esto).
  }

  event.waitUntil(
    (async () => {
      if (datos.notificacionId) {
        try {
          await fetch("/api/push/confirmar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: datos.notificacionId, estado: "entregada" }),
          });
        } catch {
          // Sin conexión o lo que sea — la notificación se muestra igual, el cron de reintentos no depende de esto.
        }
      }
      await self.registration.showNotification(datos.title, {
        body: datos.body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        data: { url: datos.url, notificacionId: datos.notificacionId },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  const notificacionId = event.notification.data?.notificacionId;

  event.waitUntil(
    (async () => {
      if (notificacionId) {
        try {
          await fetch("/api/push/confirmar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: notificacionId, estado: "leida" }),
          });
        } catch {
          // No bloquear la navegación si esto falla.
        }
      }
      const clientes = await self.clients.matchAll({ type: "window" });
      for (const c of clientes) {
        if (c.url.endsWith(url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
