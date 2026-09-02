export default function NuevaRendicionPage() {
  return (
    <div>
      <div className="page-heading">
        <h1>Nueva Rendición</h1>
        <p>Viático recibido y gastos con comprobante</p>
      </div>
      <div className="card">
        <div className="section-label">Próximamente</div>
        <div className="hint">
          El wizard de Rendición de Gastos (datos generales, gastos con técnicos asociados,
          saldo, PDF y Excel) queda para la siguiente iteración. La base de datos y los
          permisos ya están listos (tablas rendiciones_gastos, gastos, gasto_tecnicos).
        </div>
      </div>
    </div>
  );
}
