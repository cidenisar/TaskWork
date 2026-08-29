import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./routes/Login";
import { SelectorSitio } from "./routes/SelectorSitio";
import { Placeholder } from "./routes/Placeholder";

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
            path="/panorama"
            element={
              <ProtectedRoute>
                <Placeholder
                  titulo="Panorama de Sitios"
                  nota="Todavía no construida — ver ROADMAP.md. El login y el selector de sitio ya llevan hasta acá."
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sitio/:id"
            element={
              <ProtectedRoute>
                <Placeholder
                  titulo="Accountability en vivo"
                  nota="Todavía no construida — ver ROADMAP.md. El login y el selector de sitio ya llevan hasta acá."
                />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
