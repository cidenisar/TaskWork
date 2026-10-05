"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { Tecnico, Vehiculo } from "@/lib/types";
import type { CatalogosInforme } from "./types";
import { Icon } from "@/components/icon";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { MaterialesSection } from "./materiales-section";
import type { MaterialInformeItem, RemitoItem } from "./materiales-types";

export interface MaterialesStepProps {
  tieneUbicacion: boolean;
  materiales: MaterialInformeItem[];
  setMateriales: Dispatch<SetStateAction<MaterialInformeItem[]>>;
  remitoFoto: File | null;
  setRemitoFoto: Dispatch<SetStateAction<File | null>>;
  remitoNumero: string;
  setRemitoNumero: Dispatch<SetStateAction<string>>;
  remitoItems: RemitoItem[];
  setRemitoItems: Dispatch<SetStateAction<RemitoItem[]>>;
}

export function Step2Equipo({
  tecnicos,
  setTecnicos,
  vehiculos,
  setVehiculos,
  catalogos,
  materialesProps,
}: {
  tecnicos: Tecnico[];
  setTecnicos: (t: Tecnico[]) => void;
  vehiculos: Vehiculo[];
  setVehiculos: (v: Vehiculo[]) => void;
  catalogos: CatalogosInforme;
  /** null = edición de un informe existente, donde los materiales no se tocan (igual criterio que las fotos). */
  materialesProps: MaterialesStepProps | null;
}) {
  const [mostrarMateriales, setMostrarMateriales] = useState(
    Boolean(materialesProps && (materialesProps.materiales.length > 0 || materialesProps.remitoItems.length > 0)),
  );
  const [nombre, setNombre] = useState("");
  const [torre, setTorre] = useState("");
  const [seguridad, setSeguridad] = useState(false);
  const [patente, setPatente] = useState("");
  const [modelo, setModelo] = useState("");

  function onNombreChange(value: string) {
    setNombre(value);
    const match = catalogos.tecnicos.find((t) => t.nombre.toLowerCase() === value.trim().toLowerCase());
    if (match?.torre) setTorre(match.torre);
  }
  function addTech() {
    if (!nombre.trim()) return;
    setTecnicos([...tecnicos, { nombre: nombre.trim(), torre: torre.trim(), esSeguridad: seguridad }]);
    setNombre("");
    setTorre("");
    setSeguridad(false);
  }
  function removeTech(i: number) {
    setTecnicos(tecnicos.filter((_, idx) => idx !== i));
  }
  function addVehicle() {
    if (!patente.trim()) return;
    setVehiculos([...vehiculos, { patente: patente.trim(), marcaModelo: modelo.trim() }]);
    setPatente("");
    setModelo("");
  }
  function onPatenteChange(value: string) {
    setPatente(value);
    const match = catalogos.vehiculos.find((v) => v.patente.toLowerCase() === value.trim().toLowerCase());
    if (match?.marcaModelo) setModelo(match.marcaModelo);
  }
  function removeVehicle(i: number) {
    setVehiculos(vehiculos.filter((_, idx) => idx !== i));
  }

  return (
    <>
      <div className="card">
        <div className="section-label">Agregar Técnico</div>
        <div className="tech-form-grid">
          <AutocompleteInput
            value={nombre}
            onChange={onNombreChange}
            suggestions={catalogos.tecnicos.map((t) => t.nombre)}
            placeholder="Nombre completo (autocompleta desde tu catálogo)"
          />
          <AutocompleteInput value={torre} onChange={setTorre} suggestions={catalogos.torres} placeholder="Torre" />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={seguridad} onChange={(e) => setSeguridad(e.target.checked)} />
          <span className="txt">
            <b>Técnico de Higiene y Seguridad</b>
            <span>Marcar si esta persona cumple ese rol en la tarea</span>
          </span>
        </label>
        <button type="button" className="btn btn-primary" onClick={addTech}>
          + Agregar Técnico
        </button>

        <div className="item-list">
          {tecnicos.length === 0 ? (
            <div className="empty-note">Todavía no agregaste técnicos.</div>
          ) : (
            tecnicos.map((t, i) => (
              <div className="list-item" key={`${t.nombre}-${i}`}>
                <div className="info">
                  <div className="avatar">{(t.nombre[0] || "?").toUpperCase()}</div>
                  <div>
                    <div className="item-name">
                      {t.nombre}
                      {t.esSeguridad && <span className="badge">SEGURIDAD</span>}
                    </div>
                    <div className="item-sub">{t.torre || "Sin torre asignada"}</div>
                  </div>
                </div>
                <button type="button" className="remove-btn" onClick={() => removeTech(i)}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-label">Agregar Vehículo</div>
        <div className="tech-form-grid">
          <AutocompleteInput
            value={patente}
            onChange={onPatenteChange}
            suggestions={catalogos.vehiculos.map((v) => v.patente)}
            placeholder="Patente / Identificación (autocompleta desde tu catálogo)"
          />
          <input
            type="text"
            placeholder="Marca / Modelo (opcional)"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={addVehicle}>
          + Agregar Vehículo
        </button>

        <div className="item-list">
          {vehiculos.length === 0 ? (
            <div className="empty-note">Todavía no agregaste vehículos.</div>
          ) : (
            vehiculos.map((v, i) => (
              <div className="list-item" key={`${v.patente}-${i}`}>
                <div className="info">
                  <div className="avatar">
                    <Icon name="truck" size={16} />
                  </div>
                  <div>
                    <div className="item-name">{v.patente}</div>
                    <div className="item-sub">{v.marcaModelo || "Sin marca/modelo"}</div>
                  </div>
                </div>
                <button type="button" className="remove-btn" onClick={() => removeVehicle(i)}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {materialesProps &&
        (materialesProps.tieneUbicacion ? (
          mostrarMateriales ? (
            <>
              <MaterialesSection
                materiales={materialesProps.materiales}
                setMateriales={materialesProps.setMateriales}
                remitoFoto={materialesProps.remitoFoto}
                setRemitoFoto={materialesProps.setRemitoFoto}
                remitoNumero={materialesProps.remitoNumero}
                setRemitoNumero={materialesProps.setRemitoNumero}
                remitoItems={materialesProps.remitoItems}
                setRemitoItems={materialesProps.setRemitoItems}
                disabled={false}
              />
              {materialesProps.materiales.length === 0 && materialesProps.remitoItems.length === 0 && (
                <div className="card">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMostrarMateriales(false)}>
                    <Icon name="x" size={13} /> Este trabajo no usó materiales/equipos
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="card">
              <button type="button" className="btn btn-secondary" onClick={() => setMostrarMateriales(true)}>
                + Agregar materiales/equipos
              </button>
              <div className="hint" style={{ margin: "8px 0 0" }}>
                Si este trabajo instaló o usó materiales/equipos (una instalación, una reparación con repuestos, lo que sea), agregalos
                acá — quedan dados de alta en el Sitio y, si tenés el remito de depósito, se devuelve solo lo que sobró.
              </div>
            </div>
          )
        ) : (
          <div className="card">
            <div className="hint" style={{ margin: 0 }}>
              Elegí una ubicación en el paso anterior para poder agregar materiales/equipos.
            </div>
          </div>
        ))}
    </>
  );
}
