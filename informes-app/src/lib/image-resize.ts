/**
 * Achica una imagen en el navegador antes de subirla — para no mandar fotos
 * de 12MB de la cámara del celular a la IA (más lento y más caro sin
 * necesidad; a este tamaño se sigue leyendo perfecto una etiqueta o un
 * amperaje impreso).
 */
export async function resizeImageToJpeg(file: File, maxW = 1600): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = URL.createObjectURL(file);
  });

  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.85),
  );
}
