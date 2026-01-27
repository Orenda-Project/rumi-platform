import illustrationLonely from "@/assets/illustration-lonely.png";
import { useTranslation } from "react-i18next";

const LonelyTruth = () => {
  const { t } = useTranslation();
  
  return (
    <section className="py-24 relative bg-gradient-to-b from-secondary/20 to-background">
      <div className="container px-6 mx-auto max-w-4xl text-center">
        <h2 className="text-5xl md:text-6xl font-light mb-16 leading-tight tracking-tight">
          {t('lonelyTruth.title')}
          <span className="block mt-4 text-muted-foreground">{t('lonelyTruth.titleContinued')}</span>
        </h2>
        
        <div className="mb-16 flex justify-center">
          <img 
            src={illustrationLonely} 
            alt="Teacher working alone late at night"
            className="w-full max-w-md opacity-60"
          />
        </div>
        
        <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-light max-w-3xl mx-auto">
          {t('lonelyTruth.description')}
        </p>
        
        <p className="text-xl md:text-2xl text-foreground leading-relaxed font-normal max-w-3xl mx-auto mt-12">
          {t('lonelyTruth.conclusion')}
        </p>
      </div>
    </section>
  );
};

export default LonelyTruth;
