import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", scope: "/", description: "Retail operations, messages and alerts across your devices.", name: "GadgetHub Operations", short_name: "GadgetHub", start_url: "/notifications", display: "standalone", background_color: "#f4f4f2", theme_color: "#0a0a0a", icons: [192, 512].map((size) => ({ src: `/notifications-icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) };
}
