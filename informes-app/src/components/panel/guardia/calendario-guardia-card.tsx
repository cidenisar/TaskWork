"use client";

import { useState } from "react";
import Link from "next/link";
import { marcarFeriadoAction, desmarcarFeriadoAction, marcarVariosFeriadosAction } from "@/app/panel/guardia/calendario/actions";
import { Icon } from "@/components/icon";
import type { AreaGuardia } from "@/lib/guardia/cronograma";

export interface DiaCalendario {
  fecha: string;
  diaNumero: number;
  diaSemana: number; // 0 = lunes ... 6 = domingo
  esFinDeSemana: boolean;
  esHoy: boolean;
  areas: { area: AreaGuardia; nombre: string | null; conCambio: boolean }[];
  feriadoMarcado: { nombre: string; origen: "NACIONAL" | "MANUAL" } | null;
  feriadoNacionalSinMarcar: string | null;
}

export interface FeriadoNacional {
  fecha: string;
  nombre: string;
  marcado: boolean;
}

const INICIALES: Record<AreaGuardia, string> = { General: "Gen", Infraestructura: "Inf", Datos: "Dat", Enlaces: "Enl" };

function DiaCelda({ dia }: { dia: DiaCalendario }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alternarFeriado() {
    setBusy(true);
    setError(null);
    const res = dia.feriadoMarcado ? await desmarcarFeriadoAction(dia.fecha) : await marcarFeriadoAction(dia.fecha, dia.feriadoNacionalSinMarcar ?? "Feriado", "MANUAL");
    setBusy(false);
    if (!res.success) setError(res.error || "No se pudo guardar.");
  }

  const label = `${dia.diaNumero}${dia.feriadoMarcado ? `, feriado: ${dia.feriadoMarcado.nombre}` : ""}${dia.feriadoNacionalSinMarcar ? ", feriado nacional sin marcar" : ""}`;

  return (
    <div
      className="card"
      aria-label={label}
      style={{
        padding: 8,
        opacity: dia.esFinDeSemana ? 0.7 : 1,
        border: dia.esHoy ? "1.5px solid var(--accent)" : undefined,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 118,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 13 }}>{dia.diaNumero}</b>
        <button
          type="button"
          onClick={alternarFeriado}
          disabled={busy}
          title={dia.feriadoMarcado ? "Quitar feriado" : "Marcar feriado"}
          style={{ background: "none", border: "none", cursor: "pointer", color: dia.feriadoMarcado ? "var(--accent-2)" : "var(--text-faint)", padding: 2 }}
        >
          <Icon name={dia.feriadoMarcado ? "x" : "calendar"} size={12} />
        </button>
      </div>
      {dia.feriadoMarcado && (
        <span className="badge" style={{ background: "var(--accent-2)", color: "#fff", fontSize: 10, alignSelf: "flex-start" }}>
          Feriado
        </span>
      )}
      {dia.feriadoNacionalSinMarcar && !dia.feriadoMarcado && (
        <span className="badge" style={{ background: "var(--warn)", color: "#1a1a1a", fontSize: 10, alignSelf: "flex-start" }}>
          Feriado nacional sin marcar
        </span>
      )}
      <div style={{ fontSize: 10.5, lineHeight: 1.5 }}>
        {dia.areas.map((a) => (
          <div key={a.area} title={a.area}>
            <span style={{ color: "var(--text-faint)" }}>{INICIALES[a.area]}:</span> {a.nombre ?? "sin asignar"}
            {a.conCambio && <span title="Hay un cambio de guardia aceptado"> ↔</span>}
          </div>
        ))}
      </div>
      {error && <div className="error-text" style={{ fontSize: 10 }}>{error}</div>}
    </div>
  );
}

export function CalendarioGuardiaCard({
  mesLabel,
  anio,
  hrefMesAnterior,
  hrefMesSiguiente,
  dias,
  anioNacionales,
  nacionales: nacionalesIniciales,
}: {
  anio: number;
  mes: number;
  mesLabel: string;
  hrefMesAnterior: string;
  hrefMesSiguiente: string;
  dias: DiaCalendario[];
  anioNacionales: number;
  nacionales: FeriadoNacional[];
}) {
  const [nacionales, setNacionales] = useState(nacionalesIniciales);
  const [busyNacionales, setBusyNacionales] = useState(false);
  const sinMarcar = nacionales.filter((f) => !f.marcado);

  async function marcarUno(f: FeriadoNacional) {
    setBusyNacionales(true);
    const res = await marcarFeriadoAction(f.fecha, f.nombre, "NACIONAL");
    setBusyNacionales(false);
    if (res.success) setNacionales((prev) => prev.map((x) => (x.fecha === f.fecha ? { ...x, marcado: true } : x)));
  }

  async function marcarTodos() {
    setBusyNacionales(true);
    const res = await marcarVariosFeriadosAction(sinMarcar.map((f) => ({ fecha: f.fecha, nombre: f.nombre })));
    setBusyNacionales(false);
    if (res.success) setNacionales((prev) => prev.map((x) => ({ ...x, marcado: true })));
  }

  // Lunes de la primera semana que toca este mes = tantas celdas vacías antes del día 1.
  const vacias = dias.length > 0 ? dias[0].diaSemana : 0;

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Link href={hrefMesAnterior} className="btn btn-secondary btn-sm" aria-label="Mes anterior">
            <Icon name="chevron-left" size={14} />
          </Link>
          <b>
            {mesLabel} {anio}
          </b>
          <Link href={hrefMesSiguiente} className="btn btn-secondary btn-sm" aria-label="Mes siguiente">
            <Icon name="chevron-right" size={14} />
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="item-sub" style={{ textAlign: "center" }}>
              {d}
            </div>
          ))}
          {Array.from({ length: vacias }).map((_, i) => <div key={`vacia-${i}`} />)}
          {dias.map((dia) => (
            <DiaCelda key={dia.fecha} dia={dia} />
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="section-label">Calendario nacional {anioNacionales}</div>
          {sinMarcar.length > 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={marcarTodos} disabled={busyNacionales}>
              Marcar los {sinMarcar.length} sin marcar
            </button>
          )}
        </div>
        <p className="empty-note" style={{ marginTop: 6 }}>
          Fuente: notas periodísticas, no un decreto oficial — validar contra el Boletín Oficial antes de liquidar. No incluye días no
          laborables con fines turísticos ni feriados provinciales/locales.
        </p>
        <div className="item-list">
          {nacionales.map((f) => (
            <div className="list-item" key={f.fecha}>
              <div className="info">
                <div>
                  <div className="item-name">{f.nombre}</div>
                  <div className="item-sub">{f.fecha}</div>
                </div>
              </div>
              {f.marcado ? (
                <span className="badge">Marcado</span>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => marcarUno(f)} disabled={busyNacionales}>
                  Marcar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
