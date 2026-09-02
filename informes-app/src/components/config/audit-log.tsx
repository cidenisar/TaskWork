export interface AuditLogRow {
  id: string;
  actorNombre: string;
  actorRol: string;
  accion: string;
  createdAt: string;
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AuditLogCard({ rows }: { rows: AuditLogRow[] }) {
  return (
    <div className="card">
      <div className="section-label">📝 Registro de Cambios</div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Quién modificó qué en Configuración — útil cuando hay más de un Administrador.
      </div>
      {rows.length === 0 ? (
        <div className="empty-note">Todavía no hay cambios registrados.</div>
      ) : (
        <div className="item-list" style={{ marginTop: 0 }}>
          {rows.map((r) => (
            <div className="list-item" key={r.id} style={{ alignItems: "flex-start" }}>
              <div>
                <div className="item-name">{r.accion}</div>
                <div className="item-sub">
                  {r.actorNombre} · {r.actorRol}
                </div>
                <div className="audit-meta">{fmtFechaHora(r.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
