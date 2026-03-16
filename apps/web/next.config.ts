import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@outboundai/shared",
    "@outboundai/supabase",
    "@outboundai/ai-sdr",
    "@outboundai/enrichment",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
