import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import rumiLogo from "@/assets/rumi-logo.png";
import LonelyTruth from "@/components/LonelyTruth";
import AlwaysThere from "@/components/AlwaysThere";
import RealSupport from "@/components/RealSupport";
import TheDifference from "@/components/TheDifference";
import GlobalTeachers from "@/components/GlobalTeachers";
import FinalCTA from "@/components/FinalCTA";
import { useTrackPageVisit } from "@/hooks/useFunnelTracking";
import { useTranslation } from "react-i18next";

const Index = () => {
  const { t } = useTranslation();
  // Track page visit for funnel analytics
  useTrackPageVisit();

  return (
    <div className="min-h-screen">
      <Navigation />
      <main>
        <Hero />
        <LonelyTruth />
        <AlwaysThere />
        <div id="features">
          <RealSupport />
        </div>
        <TheDifference />
        <GlobalTeachers />
        <FinalCTA />
      </main>
      <footer className="py-16 border-t border-border/50 bg-background">
        <div className="container px-6 mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <img src={rumiLogo} alt="Rumi logo" className="w-8 h-8 object-contain" />
              <span className="text-lg font-normal tracking-tight">Rumi</span>
            </div>
            <p className="text-sm text-muted-foreground font-light">
              {t('footer.copyright')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
