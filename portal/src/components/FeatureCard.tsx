import { useState } from "react";
import { Card } from "@/components/ui/card";
import WhatsAppChat from "./WhatsAppChat";

interface ChatMessage {
  from: "teacher" | "rumi";
  message: string;
  type?: "text" | "voice" | "file";
  duration?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
}

interface FeatureCardProps {
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  chat: ChatMessage[];
  icon: React.ReactNode;
}

const FeatureCard = ({ title, subtitle, description, bullets, chat, icon }: FeatureCardProps) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleInteraction = () => {
    setIsFlipped(!isFlipped);
  };

  return (
    <div 
      className="group perspective-1000 h-[450px] md:h-[400px] cursor-pointer"
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onClick={handleInteraction}
    >
      <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
        {/* Front of card */}
        <Card className="absolute w-full h-full backface-hidden border-border/50 bg-card hover:shadow-lg transition-shadow p-4 md:p-6 flex flex-col overflow-hidden">
          <div className="mb-3 md:mb-4 opacity-60 flex-shrink-0">
            {icon}
          </div>
          <h3 className="text-xl md:text-2xl font-normal tracking-tight mb-2 flex-shrink-0 break-words">
            {title}
          </h3>
          <p className="text-xs md:text-sm text-muted-foreground font-light mb-3 md:mb-4 flex-shrink-0 break-words">
            {subtitle}
          </p>
          <p className="text-sm md:text-base text-foreground/80 leading-relaxed font-light mb-3 md:mb-4 flex-shrink-0 break-words">
            {description}
          </p>
          <ul className="space-y-1.5 md:space-y-2 text-xs md:text-sm text-muted-foreground font-light overflow-y-auto flex-grow">
            {bullets.map((bullet, index) => (
              <li key={index} className="flex items-start">
                <span className="mr-2 flex-shrink-0">•</span>
                <span className="break-words">{bullet}</span>
              </li>
            ))}
          </ul>
          
          {/* Mobile hint */}
          <div className="md:hidden mt-4 pt-3 border-t border-border/30 flex-shrink-0">
            <p className="text-xs text-muted-foreground text-center animate-pulse">
              👆 Tap to see demo
            </p>
          </div>
        </Card>

        {/* Back of card - WhatsApp Chat */}
        <div className="absolute w-full h-full backface-hidden rotate-y-180">
          <WhatsAppChat messages={chat} isVisible={isFlipped} />
        </div>
      </div>
    </div>
  );
};

export default FeatureCard;
