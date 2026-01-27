import illustrationGlobal from "@/assets/illustration-global.png";
import { useTranslation } from "react-i18next";

const GlobalTeachers = () => {
  const { t } = useTranslation();
  
  return (
    <section className="py-24 bg-secondary/10">
      <div className="container px-6 mx-auto max-w-4xl">
        <div className="text-center space-y-12">
          <h2 className="text-5xl md:text-6xl font-light tracking-tight">
            {t('globalTeachers.title')}
          </h2>
          
          <div className="flex justify-center my-16">
            <img 
              src={illustrationGlobal} 
              alt="Global teaching community"
              className="w-full max-w-lg opacity-60"
            />
          </div>
          
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-light">
            {t('globalTeachers.para1')}
          </p>
          
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-light">
            {t('globalTeachers.para2')}
          </p>
          
          <p className="text-2xl text-foreground font-normal pt-8">
            {t('globalTeachers.conclusion')}
          </p>
        </div>
      </div>
    </section>
  );
};

export default GlobalTeachers;
