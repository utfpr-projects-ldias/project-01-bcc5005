import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/contratos/:id/entregaveis/:entregavelId', destination: '/contratos', permanent: false },
      { source: '/contratos/:id/editar', destination: '/contratos', permanent: false },
      { source: '/contratos/:id', destination: '/contratos', permanent: false },
    ];
  },
};

export default nextConfig;
