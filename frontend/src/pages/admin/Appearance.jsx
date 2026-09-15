import { useEffect, useState, useCallback } from "react";
import { API, fmtErr, fmtDate, uploadFile } from "@/lib/api";
import { useBrand } from "@/context/BrandContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Monitor, Smartphone, Save, Rocket, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";

const SECTION_LABELS = { hero: "Hero", about: "Tentang", services: "Layanan", testimonials: "Testimoni", faq: "FAQ", contact: "Kontak" };

function MiniLanding({ a, mobile }) {
  const primary = a.primary_color || "#FFFFFF";
  return (
    <div className={`border border-border rounded-lg overflow-hidden bg-[#0A0A0C] ${mobile ? "max-w-[280px]" : "w-full"} mx-auto`}>
      <div className="relative h-48">
        {a.hero_image && <img src={a.hero_image} alt="hero" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-[9px] uppercase tracking-widest text-zinc-400">{a.tagline}</p>
          <h3 className="font-extrabold uppercase text-lg leading-tight text-white" style={{ fontFamily: `'${a.font_heading || "Anton"}', sans-serif` }}>{a.hero_headline}</h3>
          <span className="inline-block mt-2 px-3 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: primary, color: "#0A0A0C" }}>{a.hero_cta}</span>
        </div>
      </div>
      {a.sections?.about && <div className="p-3"><p className="text-[10px] font-bold uppercase text-white">{a.about_title}</p><p className="text-[9px] text-zinc-400 line-clamp-2">{a.about_text}</p></div>}
      {a.sections?.services && <div className="p-3 pt-0 flex gap-1 flex-wrap">{(a.services || []).map((s, i) => <span key={i} className="text-[8px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300">{s.title}</span>)}</div>}
      <div className="p-2 text-center text-[8px] text-zinc-500 border-t border-zinc-800">{a.footer_text}</div>
    </div>
  );
}

export default function AdminAppearance() {
  const [draft, setDraft] = useState(null);
  const [published, setPublished] = useState(null);
  const [versions, setVersions] = useState([]);
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const { reloadBrand } = useBrand();

  const load = useCallback(async () => {
    const { data } = await API.get("/appearance");
    setDraft(data.draft);
    setPublished(data.published);
    setVersions(data.versions || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!draft) return <p className="text-muted-foreground">Memuat...</p>;

  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const setNested = (parent, k, v) => setDraft({ ...draft, [parent]: { ...(draft[parent] || {}), [k]: v } });
  const setJson = (k) => (e) => {
    try { set(k, JSON.parse(e.target.value)); e.target.setCustomValidity(""); }
    catch { e.target.setCustomValidity("JSON tidak valid"); }
  };

  const saveDraft = async () => {
    setBusy(true);
    try { await API.put("/appearance", draft); toast.success("Draft tersimpan"); }
    catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const publish = async () => {
    setBusy(true);
    try {
      await API.put("/appearance", draft);
      await API.post("/appearance/publish");
      toast.success("Appearance dipublish — perubahan langsung terlihat");
      await reloadBrand();
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const reset = async () => {
    setBusy(true);
    try { const { data } = await API.post("/appearance/reset"); setDraft(data); toast.success("Direset ke default"); }
    catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const uploadLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await uploadFile(f);
      set("logo_url", `${process.env.REACT_APP_BACKEND_URL}${url}`);
      toast.success("Logo terunggah");
    } catch (err) { toast.error(fmtErr(err)); }
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(published);

  return (
    <div data-testid="admin-appearance-page" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="font-display text-3xl font-extrabold uppercase">Appearance & Website</h1>
          {dirty && <p className="text-xs text-amber-500 mt-1" data-testid="appearance-dirty-flag">Ada perubahan draft yang belum dipublish</p>}
        </div>
        <div className="flex gap-2">
          <Button data-testid="appearance-save-draft" variant="outline" onClick={saveDraft} disabled={busy}><Save className="w-4 h-4" /> Simpan Draft</Button>
          <Button data-testid="appearance-publish" onClick={publish} disabled={busy} className="glow-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Rocket className="w-4 h-4" /> Publish</>}
          </Button>
          <Button data-testid="appearance-reset" variant="ghost" onClick={reset} disabled={busy}><RotateCcw className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          <section className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h2 className="font-display text-lg font-bold uppercase">Identitas Brand</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nama Brand</Label><Input data-testid="ap-brand-name" className="mt-1 bg-background" value={draft.brand_name || ""} onChange={(e) => set("brand_name", e.target.value)} /></div>
              <div><Label>Tagline</Label><Input data-testid="ap-tagline" className="mt-1 bg-background" value={draft.tagline || ""} onChange={(e) => set("tagline", e.target.value)} /></div>
              <div>
                <Label>Warna Utama</Label>
                <div className="flex gap-2 mt-1">
                  <input data-testid="ap-primary-color" type="color" value={draft.primary_color || "#FF2E00"} onChange={(e) => set("primary_color", e.target.value)} className="w-12 h-10 rounded cursor-pointer bg-background border border-border" />
                  <Input value={draft.primary_color || ""} onChange={(e) => set("primary_color", e.target.value)} className="bg-background font-num text-xs" />
                </div>
              </div>
              <div>
                <Label>Warna Aksen</Label>
                <div className="flex gap-2 mt-1">
                  <input data-testid="ap-accent-color" type="color" value={draft.accent_color || "#00F0FF"} onChange={(e) => set("accent_color", e.target.value)} className="w-12 h-10 rounded cursor-pointer bg-background border border-border" />
                  <Input value={draft.accent_color || ""} onChange={(e) => set("accent_color", e.target.value)} className="bg-background font-num text-xs" />
                </div>
              </div>
            </div>
            <div>
              <Label>Logo</Label>
              <div className="flex gap-2 mt-1 items-center">
                <Input data-testid="ap-logo-url" className="bg-background text-xs" value={draft.logo_url || ""} onChange={(e) => set("logo_url", e.target.value)} placeholder="URL logo atau unggah" />
                <label className="shrink-0">
                  <input type="file" accept="image/*" className="hidden" data-testid="ap-logo-upload" onChange={uploadLogo} />
                  <span className="inline-flex items-center gap-1 px-3 h-9 rounded-md border border-border text-xs cursor-pointer hover:bg-accent"><Upload className="w-3 h-3" /> Upload</span>
                </label>
              </div>
            </div>
            <div><Label>Sambutan di halaman login</Label><Input data-testid="ap-login-welcome" className="mt-1 bg-background" value={draft.login_welcome || ""} onChange={(e) => set("login_welcome", e.target.value)} /></div>
            <div><Label>Teks tombol login / header</Label><Input data-testid="ap-cta-login" className="mt-1 bg-background" value={draft.cta_login || ""} onChange={(e) => set("cta_login", e.target.value)} /></div>
          </section>

          <section className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h2 className="font-display text-lg font-bold uppercase">Tipografi</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Font Heading</Label>
                <Select value={draft.font_heading || "Anton"} onValueChange={(v) => set("font_heading", v)}>
                  <SelectTrigger data-testid="ap-font-heading" className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Anton", "Bebas Neue", "Barlow Condensed", "Archivo Black", "Oswald"].map((f) => (
                      <SelectItem key={f} value={f}><span style={{ fontFamily: `'${f}', sans-serif` }}>{f}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Font Body</Label>
                <Select value={draft.font_body || "Space Grotesk"} onValueChange={(v) => set("font_body", v)}>
                  <SelectTrigger data-testid="ap-font-body" className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Space Grotesk", "Inter", "DM Sans", "Archivo"].map((f) => (
                      <SelectItem key={f} value={f}><span style={{ fontFamily: `'${f}', sans-serif` }}>{f}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Perubahan font berlaku di landing page dan seluruh aplikasi setelah Publish.</p>
          </section>

          <section className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h2 className="font-display text-lg font-bold uppercase">Hero & Konten</h2>
            <div><Label>Headline</Label><Input data-testid="ap-hero-headline" className="mt-1 bg-background" value={draft.hero_headline || ""} onChange={(e) => set("hero_headline", e.target.value)} /></div>
            <div><Label>Sub-headline</Label><Textarea data-testid="ap-hero-sub" rows={2} className="mt-1 bg-background" value={draft.hero_subheadline || ""} onChange={(e) => set("hero_subheadline", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Teks CTA</Label><Input data-testid="ap-hero-cta" className="mt-1 bg-background" value={draft.hero_cta || ""} onChange={(e) => set("hero_cta", e.target.value)} /></div>
              <div><Label>Hero Image URL</Label><Input data-testid="ap-hero-image" className="mt-1 bg-background text-xs" value={draft.hero_image || ""} onChange={(e) => set("hero_image", e.target.value)} /></div>
            </div>
            <div><Label>Judul Tentang</Label><Input data-testid="ap-about-title" className="mt-1 bg-background" value={draft.about_title || ""} onChange={(e) => set("about_title", e.target.value)} /></div>
            <div><Label>Teks Tentang</Label><Textarea data-testid="ap-about-text" rows={3} className="mt-1 bg-background" value={draft.about_text || ""} onChange={(e) => set("about_text", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Label kecil "Tentang"</Label><Input data-testid="ap-label-about" className="mt-1 bg-background" value={draft.labels?.about_eyebrow || ""} onChange={(e) => setNested("labels", "about_eyebrow", e.target.value)} /></div>
              <div><Label>Label kecil "Layanan"</Label><Input data-testid="ap-label-services-eyebrow" className="mt-1 bg-background" value={draft.labels?.services_eyebrow || ""} onChange={(e) => setNested("labels", "services_eyebrow", e.target.value)} /></div>
              <div><Label>Judul section Layanan</Label><Input data-testid="ap-label-services-title" className="mt-1 bg-background" value={draft.labels?.services_title || ""} onChange={(e) => setNested("labels", "services_title", e.target.value)} /></div>
              <div><Label>Label kecil "Testimoni"</Label><Input data-testid="ap-label-testi-eyebrow" className="mt-1 bg-background" value={draft.labels?.testimonials_eyebrow || ""} onChange={(e) => setNested("labels", "testimonials_eyebrow", e.target.value)} /></div>
              <div><Label>Judul section Testimoni</Label><Input data-testid="ap-label-testi-title" className="mt-1 bg-background" value={draft.labels?.testimonials_title || ""} onChange={(e) => setNested("labels", "testimonials_title", e.target.value)} /></div>
              <div><Label>Label kecil "FAQ"</Label><Input data-testid="ap-label-faq-eyebrow" className="mt-1 bg-background" value={draft.labels?.faq_eyebrow || ""} onChange={(e) => setNested("labels", "faq_eyebrow", e.target.value)} /></div>
              <div><Label>Judul section FAQ</Label><Input data-testid="ap-label-faq-title" className="mt-1 bg-background" value={draft.labels?.faq_title || ""} onChange={(e) => setNested("labels", "faq_title", e.target.value)} /></div>
            </div>
            <div>
              <Label>Layanan (JSON array: {"[{\"title\": \"...\", \"desc\": \"...\"}]"})</Label>
              <Textarea data-testid="ap-services-json" rows={4} className="mt-1 bg-background font-num text-xs" defaultValue={JSON.stringify(draft.services || [], null, 1)} onBlur={setJson("services")} />
            </div>
            <div>
              <Label>Testimoni (JSON array: {"[{\"name\": \"...\", \"text\": \"...\"}]"})</Label>
              <Textarea data-testid="ap-testimonials-json" rows={3} className="mt-1 bg-background font-num text-xs" defaultValue={JSON.stringify(draft.testimonials || [], null, 1)} onBlur={setJson("testimonials")} />
            </div>
            <div>
              <Label>FAQ (JSON array: {"[{\"q\": \"...\", \"a\": \"...\"}]"})</Label>
              <Textarea data-testid="ap-faq-json" rows={3} className="mt-1 bg-background font-num text-xs" defaultValue={JSON.stringify(draft.faq || [], null, 1)} onBlur={setJson("faq")} />
            </div>
          </section>

          <section className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h2 className="font-display text-lg font-bold uppercase">Kontak, Sosial & SEO</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>WhatsApp</Label><Input data-testid="ap-whatsapp" className="mt-1 bg-background" value={draft.contact?.whatsapp || ""} onChange={(e) => setNested("contact", "whatsapp", e.target.value)} placeholder="628xxxxxxxxxx" /></div>
              <div><Label>Email</Label><Input data-testid="ap-contact-email" className="mt-1 bg-background" value={draft.contact?.email || ""} onChange={(e) => setNested("contact", "email", e.target.value)} /></div>
            </div>
            <div><Label>Alamat</Label><Input data-testid="ap-address" className="mt-1 bg-background" value={draft.contact?.address || ""} onChange={(e) => setNested("contact", "address", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Instagram URL</Label><Input data-testid="ap-instagram" className="mt-1 bg-background" value={draft.social?.instagram || ""} onChange={(e) => setNested("social", "instagram", e.target.value)} /></div>
              <div><Label>YouTube URL</Label><Input data-testid="ap-youtube" className="mt-1 bg-background" value={draft.social?.youtube || ""} onChange={(e) => setNested("social", "youtube", e.target.value)} /></div>
            </div>
            <div><Label>SEO Title</Label><Input data-testid="ap-seo-title" className="mt-1 bg-background" value={draft.seo?.title || ""} onChange={(e) => setNested("seo", "title", e.target.value)} /></div>
            <div><Label>SEO Description</Label><Textarea data-testid="ap-seo-desc" rows={2} className="mt-1 bg-background" value={draft.seo?.description || ""} onChange={(e) => setNested("seo", "description", e.target.value)} /></div>
            <div><Label>Footer</Label><Input data-testid="ap-footer" className="mt-1 bg-background" value={draft.footer_text || ""} onChange={(e) => set("footer_text", e.target.value)} /></div>
          </section>

          <section className="bg-card border border-border rounded-lg p-4">
            <h2 className="font-display text-lg font-bold uppercase mb-3">Tampilkan Section</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(SECTION_LABELS).map(([k, label]) => (
                <label key={k} className="flex items-center justify-between bg-background rounded-md px-3 py-2">
                  <span className="text-sm">{label}</span>
                  <Switch data-testid={`ap-section-${k}`} checked={draft.sections?.[k] !== false} onCheckedChange={(v) => setNested("sections", k, v)} />
                </label>
              ))}
            </div>
          </section>

          {versions.length > 0 && (
            <section className="bg-card border border-border rounded-lg p-4">
              <h2 className="font-display text-lg font-bold uppercase mb-2">Riwayat Versi</h2>
              <div className="space-y-1">
                {versions.map((v, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground border-b border-border/40 py-1.5">
                    <span>Versi {versions.length - i}</span><span>{fmtDate(v.published_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="lg:sticky lg:top-20 self-start">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold uppercase">Live Preview</h2>
            <div className="flex gap-1">
              <button data-testid="preview-desktop" onClick={() => setMobile(false)} className={`p-2 rounded ${!mobile ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}><Monitor className="w-4 h-4" /></button>
              <button data-testid="preview-mobile" onClick={() => setMobile(true)} className={`p-2 rounded ${mobile ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}><Smartphone className="w-4 h-4" /></button>
            </div>
          </div>
          <MiniLanding a={draft} mobile={mobile} />
          <p className="text-[11px] text-muted-foreground mt-2">Preview menampilkan draft. Klik Publish agar tampil di landing page & aplikasi.</p>
        </div>
      </div>
    </div>
  );
}
