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

const FONT_RE = /^[A-Za-z0-9 ]+$/;

export function loadGoogleFont(name) {
  const clean = (name || "").trim();
  if (!clean || !FONT_RE.test(clean)) return;
  const id = `gf-${clean.replace(/ /g, "-")}`;
  if (document.getElementById(id)) return;
  const fam = clean.replace(/ /g, "+");
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@400;500;600;700&display=swap`;
  link.onerror = () => { link.onerror = null; link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`; };
  document.head.appendChild(link);
}

export function injectFontFace(name, url) {
  const clean = (name || "").trim();
  if (!clean || !FONT_RE.test(clean) || !url) return;
  const id = `gff-${clean.replace(/ /g, "-")}`;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `@font-face { font-family: '${clean}'; src: url('${url}'); font-display: swap; }`;
  document.head.appendChild(style);
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
  const fileFonts = a.font_files || [];
  fileFonts.forEach((f) => injectFontFace(f.name, f.url));
  const fileNames = new Set(fileFonts.map((f) => f.name));
  if (a.font_heading && FONT_RE.test(a.font_heading)) {
    document.documentElement.style.setProperty("--font-heading", `'${a.font_heading}'`);
    if (!fileNames.has(a.font_heading)) loadGoogleFont(a.font_heading);
  }
  if (a.font_body && FONT_RE.test(a.font_body)) {
    document.documentElement.style.setProperty("--font-body", `'${a.font_body}'`);
    if (!fileNames.has(a.font_body)) loadGoogleFont(a.font_body);
  }
  (a.custom_fonts || []).forEach((f) => { if (!fileNames.has(f)) loadGoogleFont(f); });
  if (a.bg_color) document.body.style.backgroundColor = a.bg_color;
  if (a.bg_image) {
    document.body.style.backgroundImage = `linear-gradient(rgba(5,5,5,0.88), rgba(5,5,5,0.88)), url('${a.bg_image}')`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundAttachment = "fixed";
  } else {
    document.body.style.backgroundImage = "";
  }
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
