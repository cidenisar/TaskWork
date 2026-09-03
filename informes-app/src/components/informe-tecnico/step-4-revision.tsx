"use client";

import type { ImagenInforme, Tecnico, Vehiculo } from "@/lib/types";
import type { EmailDestinatario, InformeFormState } from "./types";
import { ErrorNote, SuccessNote } from "@/components/notes";

function fmtFecha(fecha: string) {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function Step4Revision({
  numeroGeneracion,
  form,
  tecnicos,
  vehiculos,
  imagenes,
  emails,
  selectedEmails,
  onToggleEmail,
  submitting,
  error,
  success,
}: {
  numeroGeneracion: string;
  form: InformeFormState;
  tecnicos: Tecnico[];
  vehiculos: Vehiculo[];
  imagenes: ImagenInforme[];
  emails: EmailDestinatario[];
  selectedEmails: Set<string>;
  onToggleEmail: (email: string) => void;
  submitting: boolean;
  error: string | null;
  success: { numeroGeneracion: string; pdfUrl: string | null; emailEnviado?: boolean } | null;
}) {
  const tipoLabel = form.tipoInforme === "__new" ? form.tipoInformeNuevo || "Nuevo tipo sin nombrar" : form.tipoInforme || "—";
  const tareas = form.tareasPendientes
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const vehText = vehiculos.length ? vehiculos.map((v) => (v.marcaModelo ? `${v.patente} (${v.marcaModelo})` : v.patente)).join(", ") : "—";
  const seguridad = tecnicos.filter((t) => t.esSeguridad);
  const conGeo = imagenes.filter((i) => i.lat != null && i.lon != null);
  const chosen = emails.filter((e) => selectedEmails.has(e.email));

  return (
    <>
      <div className="card">
        <div className="section-label">Cabecera del PDF generado</div>
        <table className="review-table">
          <tbody>
            <tr>
              <td className="k">N° de Generación</td>
              <td className="v">{numeroGeneracion}</td>
            </tr>
            <tr>
              <td className="k">Título</td>
              <td className="v">{form.titulo || "—"}</td>
            </tr>
            <tr>
              <td className="k">Fecha</td>
              <td className="v">{fmtFecha(form.fecha)}</td>
            </tr>
            <tr>
              <td className="k">Lugar</td>
              <td className="v">{form.ubicacion || "—"}</td>
            </tr>
          </tbody>
        </table>
        <div className="hint" style={{ marginTop: 10 }}>
          El N° de generación se asigna automáticamente y es único por informe.
        </div>
      </div>

      <div className="card">
        <div className="review-block-title">Datos generales</div>
        <table className="review-table">
          <tbody>
            <tr>
              <td className="k">Título</td>
              <td className="v">{form.titulo || "—"}</td>
            </tr>
            <tr>
              <td className="k">Fecha</td>
              <td className="v">{fmtFecha(form.fecha)}</td>
            </tr>
            <tr>
              <td className="k">Cliente</td>
              <td className="v">{form.cliente || "—"}</td>
            </tr>
            <tr>
              <td className="k">Proyecto</td>
              <td className="v">{form.proyecto || "—"}</td>
            </tr>
            <tr>
              <td className="k">Ticket / N° Incidente</td>
              <td className="v">{form.ticketNumero || "—"}</td>
            </tr>
            <tr>
              <td className="k">Tipo de Informe</td>
              <td className="v">{tipoLabel}</td>
            </tr>
            <tr>
              <td className="k">Permiso de Trabajo</td>
              <td className="v">{form.permisoTrabajo || "—"}</td>
            </tr>
            <tr>
              <td className="k">Provincia</td>
              <td className="v">{form.provincia || "—"}</td>
            </tr>
            <tr>
              <td className="k">Ubicación</td>
              <td className="v">{form.ubicacion || "—"}</td>
            </tr>
          </tbody>
        </table>

        <div className="review-block-title">Descripción del trabajo</div>
        <div className="desc-box">{form.descripcionTrabajo || "Sin descripción cargada."}</div>

        <div className="review-block-title">Tareas pendientes</div>
        <div className="desc-box">
          {tareas.length ? tareas.map((t, i) => <div key={i}>• {t}</div>) : "Sin tareas pendientes cargadas."}
        </div>

        <div className="review-block-title">Personal y recursos</div>
        <table className="review-table">
          <tbody>
            <tr>
              <td className="k">Cantidad de Técnicos</td>
              <td className="v">{tecnicos.length}</td>
            </tr>
            <tr>
              <td className="k">Personal Afectado</td>
              <td className="v">{tecnicos.length ? tecnicos.map((t) => t.nombre).join(", ") : "—"}</td>
            </tr>
            <tr>
              <td className="k">Técnico Higiene y Seguridad</td>
              <td className="v">{seguridad.length ? `Sí — ${seguridad.map((t) => t.nombre).join(", ")}` : "No"}</td>
            </tr>
            <tr>
              <td className="k">Vehículo(s) Utilizado(s)</td>
              <td className="v">{vehText}</td>
            </tr>
          </tbody>
        </table>

        <div className="review-block-title">Imágenes adjuntas</div>
        <div className="img-grid">
          {imagenes.map((img) => (
            <div className="img-thumb" key={img.clientId}>
              {/* eslint-disable-next-line @next/next/no-img-element -- miniaturas desde blob: URLs generadas en el cliente */}
              <img src={img.dataUrl} alt="" />
            </div>
          ))}
        </div>
        <div className="img-count">
          {imagenes.length} imagen{imagenes.length === 1 ? "" : "es"}
        </div>

        <div className="review-block-title">Ubicaciones registradas</div>
        {imagenes.length === 0 ? (
          <div className="empty-note">Sin fotos cargadas.</div>
        ) : conGeo.length === 0 ? (
          <div className="empty-note">Ninguna de las fotos tiene ubicación disponible.</div>
        ) : (
          <table className="review-table">
            <tbody>
              {conGeo.map((img) => (
                <tr key={img.clientId}>
                  <td className="v">
                    {img.lat!.toFixed(5)}, {img.lon!.toFixed(5)}{" "}
                    {img.accuracyM != null && `(±${Math.round(img.accuracyM)}m)`}
                  </td>
                  <td className="v" style={{ textAlign: "right" }}>
                    <a
                      href={`https://www.google.com/maps?q=${img.lat},${img.lon}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent)" }}
                    >
                      Ver en mapa →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="hint" style={{ marginTop: 8 }}>
          Estas coordenadas quedan guardadas junto con el informe.
        </div>

        <div className="review-block-title">Envío por email</div>
        <div className="hint" style={{ margin: "0 0 10px" }}>
          Elegí a cuáles de tus destinatarios configurados se les manda este informe.
        </div>
        {emails.length === 0 ? (
          <div className="empty-note">
            No hay destinatarios configurados todavía (Configuración → Envío automático por email).
          </div>
        ) : (
          <div className="item-list" style={{ marginTop: 0 }}>
            {emails.map((e) => (
              <label className="checkbox-row" key={e.email} style={{ marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedEmails.has(e.email)}
                  onChange={() => onToggleEmail(e.email)}
                  disabled={submitting}
                />
                <span className="txt">{e.email}</span>
              </label>
            ))}
          </div>
        )}
        <div className="hint" style={{ marginTop: 10 }}>
          {chosen.length ? `Se va a enviar a ${chosen.length} destinatario${chosen.length === 1 ? "" : "s"}.` : "No se va a enviar por email."}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        {success && (
          <SuccessNote>
            PDF generado ({success.numeroGeneracion}){success.pdfUrl ? " — " : ""}
            {success.pdfUrl && (
              <a href={success.pdfUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                ver PDF
              </a>
            )}
          </SuccessNote>
        )}
        {success && chosen.length > 0 && (
          <div className="hint" style={{ marginTop: 6, color: success.emailEnviado ? "var(--ok)" : "var(--warn)" }}>
            {success.emailEnviado
              ? `Se envió por email a ${chosen.length} destinatario${chosen.length === 1 ? "" : "s"}.`
              : "No se pudo enviar el email automáticamente — revisá en Configuración que el envío automático esté activado y el servicio de email configurado. El PDF se generó igual, lo podés descargar arriba."}
          </div>
        )}
      </div>
    </>
  );
}
