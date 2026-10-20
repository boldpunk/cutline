import type { SalonTheme } from "@/lib/db/schema";

/** Style presets a business can pick for its page. CSS lives in globals.css. */
export const THEMES: Record<SalonTheme, { label: string; note: string; swatch: [string, string, string] }> = {
  pole: { label: "Полосатый столб", note: "Синий, красный, белый — классика барбершопа", swatch: ["#141A2E", "#C8261F", "#F2F1ED"] },
  night: { label: "Ночной неон", note: "Тёплый чёрный и лимонный", swatch: ["#161614", "#D9F05A", "#F3F0E8"] },
  mint: { label: "Мята", note: "Глубокий зелёный и свежий акцент", swatch: ["#0F2A24", "#177556", "#EEF3EF"] },
  brass: { label: "Латунь", note: "Эспрессо, кожа, латунь", swatch: ["#1E1913", "#D9A441", "#F4EFE7"] },
};
