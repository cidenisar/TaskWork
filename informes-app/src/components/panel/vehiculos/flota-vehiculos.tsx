"use client";

import { useState } from "react";
import Link from "next/link";
import { VehiculosTab, type VehiculoItem } from "./vehiculos-tab";
import { ServiceTab, type ServiceItem } from "./service-tab";
import { VencimientosTab } from "./vencimientos-tab";
import { calcularProximoService, type PanelVehiculoUltimoService } from "@/lib/panel/vehiculos";
import { VencBadge } from "@/components/venc-badge";
import { Icon, StatusDot } from "@/components/icon";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

type Tab = "flota" | "gestion" | "service" | "vencimientos";

/**
 * Gestión de la flota, trasladada entera a Panel de Supervisión — antes
 * vivía repartida entre Configuración → Catálogos (alta/service/
 * vencimientos, solo Admin) y esta pantalla (vista de lectura). Ahora todo
 * vive acá: "Flota" es la vista general (visible para Admin y Supervisor,
 * igual que el resto del Panel), "Gestión" y "Service" son admin-only
 * (mismo gate que antes, reforzado además por RLS en cada action).
 */
export function FlotaVehiculos({
  vehiculos: vehiculosIniciales,
  services: servicesIniciales,
  esAdmin,
}: {
  vehiculos: VehiculoItem[];
  services: ServiceItem[];
  esAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("flota");
  const [vehiculos, setVehiculos] = useState(vehiculosIniciales);
  const [services, setServices] = useState(servicesIniciales);

  const ultimoServicePorVehiculo = new Map<string, PanelVehiculoUltimoService>();
  for (const s of [...services].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))) {
    if (!ultimoServicePorVehiculo.has(s.vehiculoId)) {
      ultimoServicePorVehiculo.set(s.vehiculoId, { fecha: s.fecha, kilometraje: s.kilometraje });
    }
  }

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Vehículos</h1>
          <p>Documentación, estado y service de la flota</p>
        </div>
      </div>

      <div className="subnav" style={{ margin: "0 0 14px" }}>
        <button type="button" className={tab === "flota" ? "active" : ""} onClick={() => setTab("flota")}>
          Flota
        </button>
        {esAdmin && (
          <button type="button" className={tab === "gestion" ? "active" : ""} onClick={() => setTab("gestion")}>
            Gestión
          </button>
        )}
        {esAdmin && (
          <button type="button" className={tab === "service" ? "active" : ""} onClick={() => setTab("service")}>
            Service
          </button>
        )}
        <button type="button" className={tab === "vencimientos" ? "active" : ""} onClick={() => setTab("vencimientos")}>
          Vencimientos <Icon name="ai" size={13} />
        </button>
      </div>

      {tab === "flota" && (
        <div className="card">
          <div className="panel-card-title">
            <h2>Flota</h2>
            <span className="panel-card-count">
              {vehiculos.length} vehículo{vehiculos.length === 1 ? "" : "s"}
            </span>
          </div>
          {esAdmin && (
            <div style={{ marginBottom: 12 }}>
              <Link href="/panel/vehiculos/nuevo" className="btn btn-primary btn-sm">
                <Icon name="camera" size={13} /> Alta con fotos (IA)
              </Link>
            </div>
          )}
          {vehiculos.length === 0 ? (
            <div className="empty-note">Todavía no hay vehículos en la flota.</div>
          ) : (
            <div className="item-list">
              {vehiculos.map((v) => {
                const ultimoService = ultimoServicePorVehiculo.get(v.id) ?? null;
                const proximoService = calcularProximoService(v.kilometrajeActual, ultimoService);
                return (
                  <div className="list-item" key={v.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                    <div className="info">
                      <div className="avatar">
                        <Icon name="truck" size={16} />
                      </div>
                      <div>
                        <div className="item-name">{v.patente}</div>
                        <div className="item-sub">{v.marcaModelo || "Sin marca/modelo"}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <VencBadge label="Tarjeta Verde" fecha={v.vencimientoTarjetaVerde} />
                      <VencBadge label="RTO" fecha={v.vencimientoRto} />
                      {proximoService.estado ? (
                        <span className={`venc-badge ${proximoService.estado}`}>
                          <StatusDot tone={proximoService.estado} /> Service: {proximoService.mensaje}
                        </span>
                      ) : (
                        <span className="venc-badge">Service: {proximoService.mensaje}</span>
                      )}
                      {v.tieneDaniosAlta && (
                        <span className="venc-badge warn">
                          <Icon name="warning" size={11} /> Con daños al alta
                        </span>
                      )}
                    </div>
                    {v.estadoAlta && <div className="item-sub">Estado al alta: {v.estadoAlta}</div>}
                    <div className="item-sub">
                      Km actual: {v.kilometrajeActual != null ? v.kilometrajeActual.toLocaleString("es-AR") : "—"}
                      {ultimoService && (
                        <>
                          {" "}
                          · Último service: {ultimoService.kilometraje.toLocaleString("es-AR")} km ({fmtFecha(ultimoService.fecha)})
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "gestion" && esAdmin && (
        <div className="card">
          <div className="section-label">Alta manual, baja y kilometraje</div>
          <VehiculosTab vehiculos={vehiculos} setVehiculos={setVehiculos} />
        </div>
      )}

      {tab === "service" && esAdmin && (
        <div className="card">
          <div className="section-label">Service</div>
          <ServiceTab services={services} setServices={setServices} vehiculos={vehiculos.map((v) => ({ id: v.id, patente: v.patente }))} />
        </div>
      )}

      {tab === "vencimientos" && (
        <div className="card">
          <div className="section-label">Vencimientos</div>
          <VencimientosTab vehiculos={vehiculos} services={services} />
        </div>
      )}
    </div>
  );
}
