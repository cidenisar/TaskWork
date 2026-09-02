"use client";

import { useState } from "react";
import type { Tecnico, Vehiculo } from "@/lib/types";
import type { CatalogosInforme } from "./types";

export function Step2Equipo({
  tecnicos,
  setTecnicos,
  vehiculos,
  setVehiculos,
  catalogos,
}: {
  tecnicos: Tecnico[];
  setTecnicos: (t: Tecnico[]) => void;
  vehiculos: Vehiculo[];
  setVehiculos: (v: Vehiculo[]) => void;
  catalogos: CatalogosInforme;
}) {
  const [nombre, setNombre] = useState("");
  const [torre, setTorre] = useState("");
  const [seguridad, setSeguridad] = useState(false);
  const [patente, setPatente] = useState("");
  const [modelo, setModelo] = useState("");

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
  function removeVehicle(i: number) {
    setVehiculos(vehiculos.filter((_, idx) => idx !== i));
  }

  return (
    <>
      <div className="card">
        <div className="section-label">Agregar Técnico</div>
        <div className="tech-form-grid">
          <input
            type="text"
            list="tech-catalog-list"
            placeholder="Nombre completo (autocompleta desde tu catálogo)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <input
            type="text"
            list="torre-catalog-list"
            placeholder="Torre"
            value={torre}
            onChange={(e) => setTorre(e.target.value)}
          />
        </div>
        <datalist id="tech-catalog-list">
          {catalogos.tecnicos.map((t) => (
            <option key={t.nombre} value={t.nombre} />
          ))}
        </datalist>
        <datalist id="torre-catalog-list">
          {catalogos.torres.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
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
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-label">Agregar Vehículo</div>
        <div className="tech-form-grid">
          <input
            type="text"
            list="veh-catalog-list"
            placeholder="Patente / Identificación"
            value={patente}
            onChange={(e) => setPatente(e.target.value)}
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
                  <div className="avatar">🚐</div>
                  <div>
                    <div className="item-name">{v.patente}</div>
                    <div className="item-sub">{v.marcaModelo || "Sin marca/modelo"}</div>
                  </div>
                </div>
                <button type="button" className="remove-btn" onClick={() => removeVehicle(i)}>
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
