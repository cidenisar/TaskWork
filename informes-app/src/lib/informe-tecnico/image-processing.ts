/**
 * Marca de agua + geolocalización sobre cada foto, portado del wireframe
 * (stampImage / getPosition) a TypeScript, devolviendo un Blob listo para subir
 * además del dataURL para la miniatura.
 *
 * La marca de agua diagonal muestra el nombre del cliente (si ya se cargó
 * en el paso 1 del wizard); si todavía no hay cliente cargado, cae a
 * "INFORME TÉCNICO" como texto genérico.
 *
 * Nunca falla la carga de la foto por falta de GPS: si no hay posición,
 * la franja dice explícitamente "Ubicación no disponible" (spec sección 6.3).
 */

export interface StampedImage {
  blob: Blob;
  dataUrl: string;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  tieneGeo: boolean;
  tomadaEn: string;
}

let cachedPosition: GeolocationPosition | null = null;

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (cachedPosition) {
      resolve(cachedPosition);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        cachedPosition = pos;
        resolve(pos);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 4500 },
    );
  });
}

function loadImageEl(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function stampImage(file: File, cliente?: string): Promise<StampedImage> {
  const imgEl = await loadImageEl(file);
  const maxW = 1280;
  const scale = Math.min(1, maxW / imgEl.width);
  const w = Math.round(imgEl.width * scale);
  const h = Math.round(imgEl.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(imgEl, 0, 0, w, h);

  // Marca de agua diagonal, tenue.
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 10);
  const marcaTexto = (cliente || "").trim().toUpperCase() || "INFORME TÉCNICO";
  ctx.font = `bold ${Math.round(w * 0.07)}px Inter, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.textAlign = "center";
  ctx.fillText(marcaTexto, 0, 0);
  ctx.restore();

  // Franja inferior con fecha/hora + coordenadas.
  const barH = Math.max(40, Math.round(h * 0.09));
  const grad = ctx.createLinearGradient(0, h - barH, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - barH, w, barH);

  const pos = await getPosition();
  const now = new Date();
  const dateStr =
    now.toLocaleDateString("es-AR") +
    " " +
    now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const geoStr = pos
    ? `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy)}m)`
    : "Ubicación no disponible";

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.max(11, Math.round(w * 0.028))}px Inter, sans-serif`;
  ctx.fillText(dateStr, 10, h - barH * 0.5);

  // Marcador de ubicación dibujado (en vez del emoji 📍 quemado como texto —
  // el render de emoji en <canvas> es inconsistente entre navegadores/SO).
  const geoFontSize = Math.max(10, Math.round(w * 0.024));
  const dotR = geoFontSize * 0.3;
  const dotX = 10 + dotR;
  const dotY = h - barH * 0.15 - geoFontSize * 0.32;
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, dotR * 0.4);
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotR * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.font = `500 ${geoFontSize}px Inter, sans-serif`;
  ctx.fillText(geoStr, dotX + dotR * 2.4, h - barH * 0.15);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.85),
  );

  return {
    blob,
    dataUrl: canvas.toDataURL("image/jpeg", 0.85),
    lat: pos ? pos.coords.latitude : null,
    lon: pos ? pos.coords.longitude : null,
    accuracyM: pos ? pos.coords.accuracy : null,
    tieneGeo: !!pos,
    tomadaEn: now.toISOString(),
  };
}
