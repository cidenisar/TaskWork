import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Un informe puede traer varias fotos ya procesadas (marca de agua + GPS) en la
      // misma request de la Server Action que crea el informe y genera el PDF.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
