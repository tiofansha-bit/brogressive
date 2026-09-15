import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { API } from "../lib/api";

const BrandContext = createContext(null);

export function hexToHsl(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyBrand(a) {
  if (!a) return;
  const hsl = hexToHsl(a.primary_color);
  if (hsl) {
    document.documentElement.style.setProperty("--primary", hsl);
    document.documentElement.style.setProperty("--ring", hsl);
  }
  const acc = hexToHsl(a.accent_color);
  if (acc) document.documentElement.style.setProperty("--neon", acc);
  if (a.seo?.title) document.title = a.seo.title;
  if (a.seo?.description) {
    let m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute("content", a.seo.description);
  }
}

export function BrandProvider({ children }) {
  const [appearance, setAppearance] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get("/appearance/published");
      setAppearance(data);
      applyBrand(data);
    } catch {
      setAppearance({});
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <BrandContext.Provider value={{ appearance, reloadBrand: load }}>
      {children}
    </BrandContext.Provider>
  );
}

export const useBrand = () => useContext(BrandContext);
