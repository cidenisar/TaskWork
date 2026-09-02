"use client";

import { useState } from "react";
import { SimpleCatalogTab, type SimpleCatalogItem } from "./catalogos/simple-catalog-tab";
import { TecnicosTab, type TecnicoItem } from "./catalogos/tecnicos-tab";
import { VehiculosTab, type VehiculoItem } from "./catalogos/vehiculos-tab";
import { ServiceTab, type ServiceItem } from "./catalogos/service-tab";
import { VencimientosTab } from "./catalogos/vencimientos-tab";

type TabId = "tecnicos" | "torres" | "vehiculos" | "vehservice" | "vehalertas" | "provincias" | "tipos" | "gastocat";

const TABS: { id: TabId; label: string }[] = [
  { id: "tecnicos", label: "Técnicos" },
  { id: "torres", label: "Torres" },
  { id: "vehiculos", label: "Vehículos" },
  { id: "vehservice", label: "Service" },
  { id: "vehalertas", label: "Vencimientos 🤖" },
  { id: "provincias", label: "Provincias" },
  { id: "tipos", label: "Tipos de Informe" },
  { id: "gastocat", label: "Categorías de Gasto" },
];

export interface CatalogosData {
  tecnicos: TecnicoItem[];
  torres: SimpleCatalogItem[];
  provincias: SimpleCatalogItem[];
  tiposInforme: SimpleCatalogItem[];
  categoriasGasto: SimpleCatalogItem[];
  vehiculos: VehiculoItem[];
  services: ServiceItem[];
}

export function CatalogosCard({ data }: { data: CatalogosData }) {
  const [tab, setTab] = useState<TabId>("tecnicos");
  const [vehiculos, setVehiculos] = useState(data.vehiculos);
  const [services, setServices] = useState(data.services);

  return (
    <div className="card">
      <div className="section-label">Catálogos (para no volver a tipear)</div>
      <div className="subnav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)} type="button">
            {t.label}
          </button>
        ))}
      </div>

      {tab === "tecnicos" && <TecnicosTab tecnicos={data.tecnicos} torres={data.torres.map((t) => t.nombre)} />}
      {tab === "torres" && (
        <SimpleCatalogTab
          tabla="catalogo_torres"
          items={data.torres}
          placeholder="Ej: Torre Norte"
          hint="Estas torres son las que aparecen sugeridas en el campo 'Torre' al cargar un técnico."
        />
      )}
      {tab === "vehiculos" && <VehiculosTab vehiculos={vehiculos} setVehiculos={setVehiculos} />}
      {tab === "vehservice" && (
        <ServiceTab services={services} setServices={setServices} vehiculos={vehiculos.map((v) => ({ id: v.id, patente: v.patente }))} />
      )}
      {tab === "vehalertas" && <VencimientosTab vehiculos={vehiculos} services={services} />}
      {tab === "provincias" && (
        <SimpleCatalogTab
          tabla="catalogo_provincias"
          items={data.provincias}
          placeholder="Ej: Mendoza"
          hint="Vienen precargadas con las provincias de Argentina — podés sacar o agregar las que uses."
        />
      )}
      {tab === "tipos" && <SimpleCatalogTab tabla="catalogo_tipos_informe" items={data.tiposInforme} placeholder="Ej: Reparación de emergencia" />}
      {tab === "gastocat" && <SimpleCatalogTab tabla="catalogo_categorias_gasto" items={data.categoriasGasto} placeholder="Ej: Peaje" />}
    </div>
  );
}
