// Configuración de la organización — hoy un único toggle (ver Cowork,
// charla 2026-08-30): habilitar/deshabilitar el despacho por SMS para
// TODA la organización, pensado para cortar el costo de mandar SMS
// masivo (~USD 0,064 por mensaje) cuando no hace falta. El push nunca
// se ve afectado por este toggle — sigue siendo gratis y sigue andando
// igual, apagado o no.
//
// Escritura directa contra Supabase (ver lib/organizacion.ts,
// `org_isolation` en `organizaciones` ya se lo permite a un admin para
// su propia organización) — mismo criterio que Puntos/Códigos de
// acceso, sin endpoint nuevo en backend-server.

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { getOrganizacion, setSmsHabilitado, setCodigoAccesoApp, type Organizacion } from "../lib/organizacion";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import "./Configuracion.css";

export function Configuracion() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [org, setOrg] = useState<Organizacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [codigoDraft, setCodigoDraft] = useState("");
  const [guardandoCodigo, setGuardandoCodigo] = useState(false);

  useEffect(() => {
    if (!operador) return;
    (async () => {
      try {
        const o = await getOrganizacion(operador.organizacionId);
        setOrg(o);
        setCodigoDraft(o.codigoAccesoApp ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  if (!operador) return null;

  async function cambiarSms(habilitado: boolean) {
    if (!org || org.smsHabilitado === habilitado) return;
    setGuardando(true);
    try {
      await setSmsHabilitado(org.id, habilitado);
      setOrg({ ...org, smsHabilitado: habilitado });
      mostrar(habilitado ? "SMS habilitado de nuevo." : "SMS deshabilitado — no se va a mandar ninguno hasta que se reactive acá.");
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando el cambio.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarCodigo() {
    if (!org) return;
    const nuevo = codigoDraft.trim() ? codigoDraft.trim().toUpperCase() : null;
    if (nuevo === org.codigoAccesoApp) return;
    setGuardandoCodigo(true);
    try {
      await setCodigoAccesoApp(org.id, nuevo);
      setOrg({ ...org, codigoAccesoApp: nuevo });
      setCodigoDraft(nuevo ?? "");
      mostrar(nuevo ? `Código actualizado a "${nuevo}".` : "Código borrado — el autoregistro en Mobile queda deshabilitado hasta que se configure uno.");
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando el código.");
    } finally {
      setGuardandoCodigo(false);
    }
  }

  return (
    <div className="app">
      <Topbar titulo="Configuración" />
      <main>
        <div className="intro">
          <div className="eyebrow">Administración · configuración de organización</div>
          <p>
            Ajustes que aplican a <b>toda la organización</b>, no a un sitio en particular. Por ahora es solo el despacho de SMS — más
            configuración se va a ir sumando acá con el tiempo.
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar: {error}</div>}

        {!error && org === null && <div className="empty">Cargando configuración…</div>}

        {!error && org !== null && (
          <div className="cfg-card">
            <div className="cfg-card-head">
              <div>
                <h2>Despacho por SMS</h2>
                <p>
                  A quien no tiene la app de Mobile instalada (sin push token) se le avisa por SMS. Es el canal que tiene costo real —
                  aprox. <b>USD 0,064 por mensaje</b> — así que a veces conviene poder cortarlo sin tocar código ni el <code>.env</code>.
                </p>
              </div>
              <span className={org.smsHabilitado ? "status-pill active" : "status-pill inactive"}>
                {org.smsHabilitado ? "Habilitado" : "Deshabilitado"}
              </span>
            </div>

            <div className="seg-toggle cfg-seg">
              <button type="button" className={org.smsHabilitado ? "on" : ""} disabled={guardando} onClick={() => void cambiarSms(true)}>
                Habilitado
              </button>
              <button type="button" className={!org.smsHabilitado ? "on" : ""} disabled={guardando} onClick={() => void cambiarSms(false)}>
                Deshabilitado
              </button>
            </div>

            <div className="info-box">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
              <div>
                {org.smsHabilitado ? (
                  <>
                    Con esto habilitado, cada evento le manda SMS a todo el personal sin push token — <b>ese</b> es el gasto. El personal
                    con la app instalada (push) nunca cuesta nada y no se ve afectado por este toggle.
                  </>
                ) : (
                  <>
                    Con esto deshabilitado, el personal sin push token <b>no recibe ninguna notificación</b> durante un evento — no hay
                    reintento ni aviso alternativo todavía. Push sigue funcionando normal. Pensado para usar a propósito (ej. mientras se
                    define el proveedor de SMS), no como default permanente si hay personal que depende del SMS.
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {!error && org !== null && (
          <div className="cfg-card">
            <div className="cfg-card-head">
              <div>
                <h2>Código de autoregistro en Mobile</h2>
                <p>
                  Personal fijo que todavía no está en el padrón usa este código, desde la app, para registrarse solo (queda pendiente de
                  que un admin lo apruebe). Compartilo por cartelera o en el onboarding — no es secreto, pero conviene que no sea obvio.
                </p>
              </div>
              <span className={org.codigoAccesoApp ? "status-pill active" : "status-pill inactive"}>
                {org.codigoAccesoApp ? "Configurado" : "Sin configurar"}
              </span>
            </div>

            <div className="dfield">
              <label htmlFor="fCodigoOrg">Código</label>
              <input
                id="fCodigoOrg"
                type="text"
                value={codigoDraft}
                placeholder="ej. REFIMODELO"
                autoCapitalize="characters"
                onChange={(e) => setCodigoDraft(e.target.value)}
              />
              <div className="hint">Se guarda siempre en mayúsculas, sin espacios — mismo formato que va a pedir la app.</div>
            </div>

            <button
              className="btn-secondary"
              type="button"
              disabled={guardandoCodigo || codigoDraft.trim().toUpperCase() === (org.codigoAccesoApp ?? "")}
              onClick={() => void guardarCodigo()}
              style={{ alignSelf: "flex-start" }}
            >
              {guardandoCodigo ? "Guardando…" : "Guardar código"}
            </button>

            {!org.codigoAccesoApp && (
              <div className="info-box">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" />
                </svg>
                <div>Sin un código configurado, nadie puede autoregistrarse desde Mobile — van a tener que darse de alta a mano en el Padrón.</div>
              </div>
            )}
          </div>
        )}
      </main>
      <Toast mensaje={mensaje} />
    </div>
  );
}
