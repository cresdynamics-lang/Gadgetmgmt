import { brandAssets } from "@/lib/brand";

type BrandLogoProps = {
  variant?: "logo" | "mark" | "icon";
  on?: "dark" | "light";
  className?: string;
  alt?: string;
};

const sources = {
  logo: { dark: brandAssets.logoOnDark, light: brandAssets.logoOnLight },
  mark: { dark: brandAssets.markOnDark, light: brandAssets.markOnLight },
  icon: { dark: brandAssets.iconBlack, light: brandAssets.iconWhite },
} as const;

export function BrandLogo({ variant = "mark", on = "light", className, alt = "GadgetHub" }: BrandLogoProps) {
  return <img src={sources[variant][on]} alt={alt} className={`block select-none object-contain ${className ?? ""}`} />;
}
