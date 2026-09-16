import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La auditoría dejó de colgar de /garita: es del guardia y del admin por
  // igual. El guardia que la tenga marcada en el celular sigue llegando.
  async redirects() {
    return [{ source: '/garita/auditoria', destination: '/auditoria', permanent: true }]
  },
};

export default nextConfig;
