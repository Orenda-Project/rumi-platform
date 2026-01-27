import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import rumiLogo from "@/assets/rumi-logo.png";
import { getWhatsAppUrl, trackCtaClick } from "@/lib/funnelTracking";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";

const Navigation = () => {
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const whatsappUrl = getWhatsAppUrl('https://wa.me/message/WCYNS4DTDB2MD1');

  const handleCtaClickTracking = () => {
    trackCtaClick('navigation');
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="container px-6 mx-auto max-w-7xl">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src={rumiLogo} alt="Rumi logo" className="w-8 h-8 object-contain" />
            <span className="text-xl font-normal tracking-tight">Rumi</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="#features"
              className="text-sm font-normal text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
            >
              {t('nav.features')}
            </a>
            <Button asChild variant="default" size="sm">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gap-2"
                onClick={handleCtaClickTracking}
              >
                <WhatsAppIcon size={16} />
                <span className="hidden sm:inline">{t('nav.meetRumi')}</span>
              </a>
            </Button>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
