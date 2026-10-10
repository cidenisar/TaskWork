"use client";

import { useState } from "react";
import { SimpleCatalogTab, type SimpleCatalogItem } from "./catalogos/simple-catalog-tab";
import { TorreTramosTab, type TramoTorreItem } from "./catalogos/torre-tramos-tab";
import { RecursoAlturaTab, type RecursoAlturaItem } from "./catalogos/recurso-altura-tab";

type TabId = "torres" | "clientes" | "torrecomtramos" | "recursoaltura" | "provincias" | "tipos" | "gastocat";

const TABS: { id: TabId; label: React.ReactNode }[] = [
  { id: "torres", label: "Torres (cuadrillas)" },
  { id: "clientes", label: "Clientes" },
  { id: "torrecomtramos", label: "Torres Comunic. (tramos)" },
  { id: "recursoaltura", label: "Recurso por altura" },
  { id: "provincias", label: "Provincias" },
  { id: "tipos", label: "Tipos de Informe" },
  { id: "gastocat", label: "Categorías de Gasto" },
];

export interface CatalogosData {
  torres: SimpleCatalogItem[];
  clientes: SimpleCatalogItem[];
  provincias: SimpleCatalogItem[];
  tiposInforme: SimpleCatalogItem[];
  categoriasGasto: SimpleCatalogItem[];
  tramosTorre: TramoTorreItem[];
  recursoAltura: RecursoAlturaItem[];
}

/** Vehículos (alta, service, vencimientos) se trasladó a Panel de Supervisión → Vehículos — ver src/components/panel/vehiculos/. */
export function CatalogosCard({ data }: { data: CatalogosData }) {
  const [tab, setTab] = useState<TabId>("torres");
  const [tramosTorre, setTramosTorre] = useState(data.tramosTorre);
  const [recursoAltura, setRecursoAltura] = useState(data.recursoAltura);

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

      {tab === "torres" && (
        <SimpleCatalogTab
          tabla="catalogo_torres"
          items={data.torres}
          placeholder="Ej: Torre Norte"
          hint="Estas torres son las que aparecen sugeridas en el campo 'Torre' al cargar un técnico."
        />
      )}
      {tab === "clientes" && (
        <SimpleCatalogTab
          tabla="catalogo_clientes"
          items={data.clientes}
          placeholder="Ej: YPF"
          hint="Estos clientes son los que aparecen sugeridos en el campo 'Cliente' de Informe Técnico."
        />
      )}
      {tab === "torrecomtramos" && <TorreTramosTab tramos={tramosTorre} setTramos={setTramosTorre} />}
      {tab === "recursoaltura" && <RecursoAlturaTab items={recursoAltura} setItems={setRecursoAltura} />}
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
