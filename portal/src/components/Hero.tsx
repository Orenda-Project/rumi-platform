import { Button } from "@/components/ui/button";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import heroImage from "@/assets/hero-sketch-2.png";
import { getWhatsAppUrl, trackCtaClick } from "@/lib/funnelTracking";
import { useTranslation } from "react-i18next";

const Hero = () => {
  const { t } = useTranslation();
  const whatsappUrl = getWhatsAppUrl('https://wa.me/message/WCYNS4DTDB2MD1');

  const handleCtaClickTracking = () => {
    trackCtaClick('hero');
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />

      <div className="container relative z-10 px-6 py-32 mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center max-w-7xl mx-auto">
          <div className="space-y-10 max-w-2xl">
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-light leading-[1.05] tracking-tight">
              {t('hero.title')}
              <span className="block">{t('hero.titleContinued')}</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-light">
              {t('hero.subtitle')}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button asChild variant="default" size="xl" className="group">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleCtaClickTracking}
                >
                  <WhatsAppIcon className="transition-transform group-hover:scale-110" size={20} />
                  {t('hero.meetRumi')}
                </a>
              </Button>
              <Button
                variant="outline"
                size="xl"
                onClick={() => document.getElementById('real-support')?.scrollIntoView({ behavior: 'smooth' })}
              >
                {t('hero.seeHowItWorks')}
              </Button>
            </div>
          </div>

          <div className="relative lg:block hidden">
            <div className="relative rounded-2xl overflow-hidden">
              <img
                src={heroImage}
                alt="Teacher working late at night - you're not alone"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
