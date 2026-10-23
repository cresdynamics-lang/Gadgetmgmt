import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GadgetHub Operations",
    short_name: "GadgetHub",
    description: "Gadget Hub retail operations, POS, and Lipa collections.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#111111",
    theme_color: "#111111",
    orientation: "any",
    icons: [
      { src: "/brand/icon-black.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/brand/icon-white.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    ],
  };
}
