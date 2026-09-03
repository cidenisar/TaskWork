"use client";

import { useRef, useState } from "react";
import type { ImagenInforme } from "@/lib/types";
import { stampImage } from "@/lib/informe-tecnico/image-processing";
import { Icon } from "@/components/icon";

export function Step3Imagenes({
  imagenes,
  setImagenes,
}: {
  imagenes: ImagenInforme[];
  setImagenes: (imgs: ImagenInforme[]) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus("Obteniendo ubicación y marcando fotos...");
    let anyMissingGeo = false;
    const nuevas: ImagenInforme[] = [];
    for (const file of Array.from(files)) {
      try {
        const stamped = await stampImage(file);
        if (!stamped.tieneGeo) anyMissingGeo = true;
        nuevas.push({
          clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          dataUrl: stamped.dataUrl,
          blob: stamped.blob,
          lat: stamped.lat,
          lon: stamped.lon,
          accuracyM: stamped.accuracyM,
          tomadaEn: stamped.tomadaEn,
          tieneGeo: stamped.tieneGeo,
        });
      } catch {
        // No debe bloquear la carga del informe por una foto que falló al procesar.
      }
    }
    setImagenes([...imagenes, ...nuevas]);
    setStatus(
      anyMissingGeo
        ? "Algunas fotos no pudieron marcarse con ubicación — revisá el permiso de GPS del navegador."
        : "Fotos marcadas con fecha, hora y ubicación.",
    );
  }

  function removeImage(clientId: string) {
    setImagenes(imagenes.filter((i) => i.clientId !== clientId));
  }

  return (
    <div className="card">
      <div className="upload-grid">
        <div className="upload-box">
          <div className="label">Subir Archivos</div>
          <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            Seleccionar Imágenes
          </button>
        </div>
        <div className="upload-box">
          <div className="label">Capturar con Cámara</div>
          <button type="button" className="btn btn-primary" onClick={() => cameraInputRef.current?.click()}>
            Abrir Cámara
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          void addImages(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          void addImages(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="hint" style={{ marginTop: 14 }}>
        <Icon name="map" size={13} /> Cada foto se marca automáticamente con fecha, hora y ubicación GPS al agregarla.
      </div>
      {status && <div className="hint">{status}</div>}

      <div className="img-grid">
        {imagenes.map((img) => (
          <div className="img-thumb" key={img.clientId}>
            {/* eslint-disable-next-line @next/next/no-img-element -- miniaturas desde blob: URLs generadas en el cliente */}
            <img src={img.dataUrl} alt="" />
            <button type="button" className="del" onClick={() => removeImage(img.clientId)}>
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="img-count">
        {imagenes.length} imagen{imagenes.length === 1 ? "" : "es"} agregada{imagenes.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
