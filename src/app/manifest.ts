import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "GadgetHub Operations", short_name: "GadgetHub", start_url: "/notifications", display: "standalone", background_color: "#f5f4ee", theme_color: "#183b2a", icons: [192, 512].map((size) => ({ src: `/notifications-icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) };
}
