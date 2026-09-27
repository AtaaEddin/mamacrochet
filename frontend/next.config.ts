import type { NextConfig } from "next";
import withNextIntl from "next-intl/plugin";

// "standalone" = self-contained server bundle for the production Docker
// image (plan 10); the frontend Dockerfile copies .next/standalone.
const nextConfig: NextConfig = {
  output: "standalone",
};

export default withNextIntl("./src/i18n/request.ts")(nextConfig);
