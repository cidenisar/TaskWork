/**
 * Achica una imagen en el navegador antes de subirla — para no mandar fotos
 * de 12MB de la cámara del celular a la IA (más lento y más caro sin
 * necesidad; a este tamaño se sigue leyendo perfecto una etiqueta o un
 * amperaje impreso).
 */
export async function resizeImageToJpeg(file: File, maxW = 1600): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    // <img>.onerror entrega un Event del navegador, no un Error — si se
    // propaga tal cual, "err instanceof Error" da false en el catch de
    // quien llama y se pierde el motivo real. La causa más común es que el
    // navegador no puede decodificar el formato del archivo (ej. HEIC de
    // iPhone), así que lo distinguimos acá para dar un mensaje accionable.
    el.onerror = () => {
      const formatoNoEstandar = !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type);
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          formatoNoEstandar
            ? `No se pudo leer "${file.name || "la foto"}" — puede estar en un formato que el navegador no reconoce (ej. HEIC). Activá "Más compatible" en Ajustes → Cámara → Formatos del celular, o elegí una foto guardada como JPG/PNG.`
            : `No se pudo leer "${file.name || "la foto"}" — probá con otra foto.`,
        ),
      );
    };
    el.src = objectUrl;
  });

  URL.revokeObjectURL(objectUrl);

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
