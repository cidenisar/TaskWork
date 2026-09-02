"use client";

import type { RendicionFormState, GastoItem } from "./types";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}
function fmtMonto(monto: number, moneda: string) {
  return `${moneda} ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Step3Resumen({
  numeroGeneracion,
  form,
  gastos,
  submitting,
  error,
  success,
  onGenerarPdf,
  onExportarExcel,
}: {
  numeroGeneracion: string;
  form: RendicionFormState;
  gastos: GastoItem[];
  submitting: boolean;
  error: string | null;
  success: { numeroGeneracion: string; pdfUrl: string | null } | null;
  onGenerarPdf: () => void;
  onExportarExcel: () => void;
}) {
  const total = gastos.reduce((sum, g) => sum + g.monto, 0);
  const viatico = Number(form.viaticoRecibido.replace(",", ".")) || 0;
  const saldo = viatico - total;
  const aFavor = saldo >= 0;
  const tecnicosUnicos = Array.from(new Set(gastos.flatMap((g) => g.tecnicos.map((t) => t.nombre))));

  return (
    <>
      <div className="card">
        <div className="review-block-title">Resumen de la rendición</div>
        <table className="review-table">
          <tbody>
            <tr>
              <td className="k">N° de Rendición</td>
              <td className="v">{numeroGeneracion}</td>
            </tr>
            <tr>
              <td className="k">Motivo</td>
              <td className="v">{form.motivo || "—"}</td>
            </tr>
            <tr>
              <td className="k">Fecha</td>
              <td className="v">{fmtFecha(form.fecha)}</td>
            </tr>
            <tr>
              <td className="k">Proyecto/Cliente</td>
              <td className="v">{form.proyectoCliente || "—"}</td>
            </tr>
            <tr>
              <td className="k">Técnicos Involucrados</td>
              <td className="v">{tecnicosUnicos.length ? tecnicosUnicos.join(", ") : "—"}</td>
            </tr>
            <tr>
              <td className="k">Provincia</td>
              <td className="v">{form.provincia || "—"}</td>
            </tr>
            <tr>
              <td className="k">Viático Recibido</td>
              <td className="v">{fmtMonto(viatico, form.moneda)}</td>
            </tr>
            <tr>
              <td className="k">Total Gastado</td>
              <td className="v">{fmtMonto(total, form.moneda)}</td>
            </tr>
            <tr>
              <td className="k">Cantidad de Gastos</td>
              <td className="v">{gastos.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="review-block-title">Detalle de gastos</div>
        {gastos.length === 0 ? (
          <div className="empty-note">No cargaste gastos.</div>
        ) : (
          <div className="item-list" style={{ marginTop: 0 }}>
            {gastos.map((g) => (
              <div className="list-item" key={g.clientId}>
                <div className="info">
                  {g.comprobantePreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura desde blob: URL generada en el cliente
                    <img className="gasto-thumb" src={g.comprobantePreviewUrl} alt="" />
                  ) : (
                    <div className="avatar">$</div>
                  )}
                  <div>
                    <div className="item-name">
                      {g.categoria} — {fmtMonto(g.monto, form.moneda)}
                    </div>
                    <div className="item-sub">
                      {fmtFecha(g.fecha)} {g.descripcion ? `· ${g.descripcion}` : ""}
                      {g.tecnicos.length ? ` · ${g.tecnicos.map((t) => t.nombre).join(", ")}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="saldo-box">
          <div className="label">{aFavor ? "Saldo a favor de la empresa" : "Saldo a favor del empleado (a reintegrar)"}</div>
          <div className={`amount ${aFavor ? "positive" : "negative"}`}>{fmtMonto(Math.abs(saldo), form.moneda)}</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onGenerarPdf}
            disabled={submitting}
          >
            {submitting ? "Generando..." : "📄 Generar PDF"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onExportarExcel}
            disabled={submitting}
          >
            📊 Exportar Excel
          </button>
        </div>
        {error && <div className="error-note">⚠️ {error}</div>}
        {success && (
          <div className="success-note">
            ✓ Rendición generada ({success.numeroGeneracion}){success.pdfUrl ? " — " : ""}
            {success.pdfUrl && (
              <a href={success.pdfUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                ver PDF
              </a>
            )}
          </div>
        )}
      </div>
    </>
  );
}
