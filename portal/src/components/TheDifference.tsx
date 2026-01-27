import { useTranslation } from "react-i18next";

const TheDifference = () => {
  const { t } = useTranslation();
  
  return (
    <section className="py-24 bg-background">
      <div className="container px-6 mx-auto max-w-3xl text-center">
        <h2 className="text-4xl md:text-5xl font-light mb-16 tracking-tight">
          {t('theDifference.title')}
        </h2>
        
        <div className="space-y-8 text-xl md:text-2xl text-muted-foreground leading-relaxed font-light">
          <p>
            {t('theDifference.para1')}
          </p>
          
          <p>
            {t('theDifference.para2')}
          </p>
          
          <p>
            {t('theDifference.para3')}
          </p>
          
          <p className="text-foreground font-normal pt-4">
            {t('theDifference.conclusion')}
          </p>
        </div>
      </div>
    </section>
  );
};

export default TheDifference;
