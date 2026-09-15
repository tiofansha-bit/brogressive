import { Link } from "react-router-dom";
import { useBrand } from "@/context/BrandContext";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dumbbell, MessageCircle, Instagram, Youtube, Mail, MapPin } from "lucide-react";

export default function Landing() {
  const { appearance: a } = useBrand();
  if (!a) return <div className="min-h-screen bg-background" />;
  const s = a.sections || {};

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="landing-page"
      style={a.bg_image
        ? { backgroundImage: `linear-gradient(rgba(5,5,5,0.82), rgba(5,5,5,0.82)), url('${a.bg_image}')`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }
        : a.bg_color ? { backgroundColor: a.bg_color } : undefined}>
      <header className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2" data-testid="landing-brand">
            {a.logo_url ? (
              <img src={a.logo_url} alt={a.brand_name} className="h-8 w-auto" />
            ) : (
              <Dumbbell className="w-6 h-6 text-primary" />
            )}
            <span className="font-display font-bold text-xl uppercase tracking-wide">{a.brand_name}</span>
          </div>
          <Link to="/login">
            <Button data-testid="landing-login-btn" className="font-semibold">{a.cta_login || "Masuk"}</Button>
          </Link>
        </div>
      </header>

      {s.hero && (
        <section className="relative min-h-[92vh] flex items-end" data-testid="landing-hero">
          {a.hero_image && (
            <img src={a.hero_image} alt="Hero" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: a.hero_position || "center" }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
          {(a.hero_overlay ?? 0) > 0 && (
            <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${(a.hero_overlay ?? 0) / 100})` }} />
          )}
          <div className="relative max-w-6xl mx-auto px-4 pb-24 pt-40 w-full flex flex-col-reverse md:flex-row md:items-end gap-8">
            <div className="flex-1 min-w-0">
              <p className="eyebrow mb-4">{a.tagline}</p>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-extrabold uppercase tracking-tight leading-none max-w-3xl" data-testid="landing-headline">
                {a.hero_headline}
              </h1>
              <p className="mt-5 text-base sm:text-lg text-zinc-300 max-w-xl">{a.hero_subheadline}</p>
              <Link to="/login">
                <Button data-testid="landing-hero-cta" size="lg" className="mt-8 h-14 px-8 text-base font-bold uppercase tracking-wider glow-primary">
                  {a.hero_cta}
                </Button>
              </Link>
            </div>
            {a.hero_thumb_enabled !== false && a.hero_thumb && (
              <div className="shrink-0 w-44 sm:w-60 md:w-72 lg:w-80" data-testid="landing-hero-thumb">
                <img src={a.hero_thumb} alt={a.hero_headline} className="w-full aspect-[4/5] object-cover rounded-lg border border-border shadow-2xl" />
              </div>
            )}
          </div>
        </section>
      )}

      {s.about && (
        <section className="max-w-6xl mx-auto px-4 py-24" data-testid="landing-about">
          <p className="eyebrow mb-3">{a.labels?.about_eyebrow || "Tentang Kami"}</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight max-w-2xl">{a.about_title}</h2>
          <p className="mt-5 text-zinc-300 max-w-2xl leading-relaxed">{a.about_text}</p>
        </section>
      )}

      {s.services && (a.services || []).length > 0 && (
        <section className="max-w-6xl mx-auto px-4 pb-24" data-testid="landing-services">
          <p className="eyebrow mb-3">{a.labels?.services_eyebrow || "Layanan"}</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight">{a.labels?.services_title || "Program Coaching"}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {a.services.map((sv, i) => (
              <div key={i} data-testid={`landing-service-${i}`} className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
                <h3 className="font-display text-xl font-bold uppercase">{sv.title}</h3>
                <p className="text-sm text-muted-foreground mt-2">{sv.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.testimonials && (a.testimonials || []).length > 0 && (
        <section className="bg-card/50 border-y border-border" data-testid="landing-testimonials">
          <div className="max-w-6xl mx-auto px-4 py-24">
            <p className="eyebrow mb-3">{a.labels?.testimonials_eyebrow || "Testimoni"}</p>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight">{a.labels?.testimonials_title || "Kata Mereka"}</h2>
            <div className="grid sm:grid-cols-2 gap-4 mt-8">
              {a.testimonials.map((t, i) => (
                <figure key={i} data-testid={`landing-testimonial-${i}`} className="bg-background border border-border rounded-lg p-6">
                  <blockquote className="text-zinc-300">“{t.text}”</blockquote>
                  <figcaption className="mt-4 text-sm font-semibold text-primary">{t.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {s.faq && (a.faq || []).length > 0 && (
        <section className="max-w-3xl mx-auto px-4 py-24" data-testid="landing-faq">
          <p className="eyebrow mb-3">{a.labels?.faq_eyebrow || "FAQ"}</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight mb-8">{a.labels?.faq_title || "Pertanyaan Umum"}</h2>
          <Accordion type="single" collapsible>
            {a.faq.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} data-testid={`landing-faq-${i}`}>
                <AccordionTrigger className="text-left font-semibold">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}

      {s.contact && (
        <section className="border-t border-border" data-testid="landing-contact">
          <div className="max-w-6xl mx-auto px-4 py-16 flex flex-col sm:flex-row gap-8 justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold uppercase">{a.brand_name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{a.tagline}</p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              {a.contact?.whatsapp && (
                <a data-testid="landing-whatsapp" href={`https://wa.me/${a.contact.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary transition-colors">
                  <MessageCircle className="w-4 h-4" /> WhatsApp: {a.contact.whatsapp}
                </a>
              )}
              {a.contact?.email && <span className="flex items-center gap-2"><Mail className="w-4 h-4" /> {a.contact.email}</span>}
              {a.contact?.address && <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {a.contact.address}</span>}
              <div className="flex gap-3 mt-2">
                {a.social?.instagram && <a href={a.social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram className="w-4 h-4 hover:text-primary" /></a>}
                {a.social?.youtube && <a href={a.social.youtube} target="_blank" rel="noreferrer" aria-label="YouTube"><Youtube className="w-4 h-4 hover:text-primary" /></a>}
              </div>
            </div>
          </div>
          <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">{a.footer_text}</div>
        </section>
      )}
    </div>
  );
}
