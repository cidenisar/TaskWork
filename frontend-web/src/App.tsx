import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./routes/Login";
import { SelectorSitio } from "./routes/SelectorSitio";
import { Operadores } from "./routes/Operadores";
import { Padron } from "./routes/Padron";
import { Pendientes } from "./routes/Pendientes";
import { Importar } from "./routes/Importar";
import { Historial } from "./routes/Historial";
import { Programador } from "./routes/Programador";
import { Codigos } from "./routes/Codigos";
import { Accountability } from "./routes/Accountability";
import { Panorama } from "./routes/Panorama";
import { Puntos } from "./routes/Puntos";
import { Configuracion } from "./routes/Configuracion";
import { Sitios } from "./routes/Sitios";
import { Consolas } from "./routes/Consolas";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <SelectorSitio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operadores"
            element={
              <ProtectedRoute>
                <Operadores />
              </ProtectedRoute>
            }
          />
          <Route
            path="/personas/padron"
            element={
              <ProtectedRoute>
                <Padron />
              </ProtectedRoute>
            }
          />
          <Route
            path="/personas/pendientes"
            element={
              <ProtectedRoute>
                <Pendientes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/personas/importar"
            element={
              <ProtectedRoute>
                <Importar />
              </ProtectedRoute>
            }
          />
          <Route
            path="/simulacros/historial"
            element={
              <ProtectedRoute>
                <Historial />
              </ProtectedRoute>
            }
          />
          <Route
            path="/simulacros/programador"
            element={
              <ProtectedRoute>
                <Programador />
              </ProtectedRoute>
            }
          />
          <Route
            path="/personas/codigos"
            element={
              <ProtectedRoute>
                <Codigos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/panorama"
            element={
              <ProtectedRoute>
                <Panorama />
              </ProtectedRoute>
            }
          />
          <Route
            path="/puntos-encuentro"
            element={
              <ProtectedRoute>
                <Puntos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sitio/:id"
            element={
              <ProtectedRoute>
                <Accountability />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracion"
            element={
              <ProtectedRoute>
                <Configuracion />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sitios"
            element={
              <ProtectedRoute>
                <Sitios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consolas"
            element={
              <ProtectedRoute>
                <Consolas />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
