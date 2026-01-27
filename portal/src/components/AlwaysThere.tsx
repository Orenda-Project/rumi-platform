import illustrationChat from "@/assets/illustration-chat.png";
import illustrationVoice from "@/assets/illustration-voice.png";
import illustrationSupport from "@/assets/illustration-support.png";
import { useTranslation } from "react-i18next";

const illustrations = [illustrationChat, illustrationVoice, illustrationSupport];

const AlwaysThere = () => {
  const { t } = useTranslation();
  const moments = t('alwaysThere.moments', { returnObjects: true }) as Array<{ title: string; description: string }>;
  
  return (
    <section className="py-24 bg-background">
      <div className="container px-6 mx-auto max-w-7xl">
        <h2 className="text-5xl md:text-6xl font-light text-center mb-24 tracking-tight">
          {t('alwaysThere.title')}
        </h2>
        
        <div className="grid md:grid-cols-3 gap-16">
          {moments.map((moment, index) => (
            <div key={index} className="text-center space-y-8">
              <div className="flex justify-center mb-8">
                <img 
                  src={illustrations[index]} 
                  alt={moment.title}
                  className="w-32 h-32 object-contain opacity-70"
                />
              </div>
              
              <h3 className="text-2xl font-normal tracking-tight">
                {moment.title}
              </h3>
              
              <p className="text-lg text-muted-foreground leading-relaxed font-light">
                {moment.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AlwaysThere;
