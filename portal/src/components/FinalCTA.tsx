import { Button } from "@/components/ui/button";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import { ArrowRight, MessageCircle } from "lucide-react";
import { trackCtaClick } from "@/lib/funnelTracking";
import { landingChatHref, useChatChannel } from "@/hooks/useChatChannel";
import { useTranslation } from "react-i18next";

const FinalCTA = () => {
  const { t } = useTranslation();
  const channel = useChatChannel();
  const chatHref = landingChatHref(channel);

  const handleCtaClickTracking = () => {
    trackCtaClick('footer');
  };

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[image:var(--gradient-hero)]" />

      <div className="container px-6 mx-auto max-w-4xl relative z-10">
        <div className="text-center space-y-12">
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-light text-primary-foreground tracking-tight">
            {t('finalCta.title')}
          </h2>

          <p className="text-2xl text-primary-foreground/90 leading-relaxed font-light">
            {t('finalCta.subtitle')}
            <span className="block mt-2">{t('finalCta.subtitleContinued')}</span>
          </p>

          {chatHref && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Button
                asChild
                size="xl"
                className="bg-accent hover:bg-accent/90 text-accent-foreground hover:scale-105 transition-all duration-300 shadow-2xl group"
              >
                <a
                  href={chatHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleCtaClickTracking}
                >
                  {channel.whatsapp ? (
                    <WhatsAppIcon className="transition-transform group-hover:scale-110" size={20} />
                  ) : (
                    <MessageCircle className="transition-transform group-hover:scale-110" size={20} />
                  )}
                  {channel.whatsapp ? t('finalCta.cta') : t('channel.chatWithRumi')}
                  <ArrowRight className="transition-transform group-hover:translate-x-1" />
                </a>
              </Button>
            </div>
          )}

          <p className="text-sm text-primary-foreground/70 pt-8">
            {t('finalCta.note')}
          </p>
        </div>
      </div>

      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary-foreground/10 rounded-full blur-3xl" />
    </section>
  );
};

export default FinalCTA;
