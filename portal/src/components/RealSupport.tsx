import { useTranslation } from "react-i18next";
import FeatureCard from "./FeatureCard";
import { MessageCircle, Globe, Users, Lightbulb, Mic, Brain, Clock } from "lucide-react";

const RealSupport = () => {
  const { t } = useTranslation();
  const features = t('realSupport.features', { returnObjects: true }) as Array<{ 
    title: string; 
    subtitle: string;
    description: string;
    bullets: string[];
    chat: Array<{ from: "teacher" | "rumi"; message: string }>;
  }>;

  const icons = [
    <MessageCircle className="w-12 h-12" />,
    <Globe className="w-12 h-12" />,
    <Users className="w-12 h-12" />,
    <Lightbulb className="w-12 h-12" />,
    <Mic className="w-12 h-12" />,
    <Brain className="w-12 h-12" />,
  ];
  
  return (
    <section id="real-support" className="py-12 md:py-24 bg-secondary/20">
      <div className="container px-4 md:px-6 mx-auto max-w-7xl">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-center mb-12 md:mb-16 tracking-tight">
          {t('realSupport.title')}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              title={feature.title}
              subtitle={feature.subtitle}
              description={feature.description}
              bullets={feature.bullets}
              chat={feature.chat}
              icon={icons[index]}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default RealSupport;
