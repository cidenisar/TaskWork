import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./routes/Login";
import { SelectorSitio } from "./routes/SelectorSitio";
import { Operadores } from "./routes/Operadores";
import { Pendientes } from "./routes/Pendientes";
import { Historial } from "./routes/Historial";
import { Codigos } from "./routes/Codigos";
import { Accountability } from "./routes/Accountability";
import { Panorama } from "./routes/Panorama";
import { Puntos } from "./routes/Puntos";

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
            path="/personas/pendientes"
            element={
              <ProtectedRoute>
                <Pendientes />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
