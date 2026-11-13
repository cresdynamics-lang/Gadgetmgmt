import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", scope: "/", name: "GadgetHub Operations", short_name: "GadgetHub",
    description: "Your shop workspace for sales, devices, customers and operations.",
    start_url: "/", display: "standalone", background_color: "#f4f4f2", theme_color: "#0a0a0a",
    categories: ["business", "productivity"], lang: "en-KE",
    icons: [192, 512].map(size => ({ src: `/notifications-icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
  };
}
