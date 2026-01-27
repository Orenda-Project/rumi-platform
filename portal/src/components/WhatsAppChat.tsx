import { useEffect, useState } from "react";
import rumiLogo from "@/assets/rumi-logo.png";

interface ChatMessage {
  from: "teacher" | "rumi";
  message: string;
  type?: "text" | "voice" | "file";
  duration?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
}

interface WhatsAppChatProps {
  messages: ChatMessage[];
  isVisible: boolean;
}

const WhatsAppChat = ({ messages, isVisible }: WhatsAppChatProps) => {
  const [visibleMessages, setVisibleMessages] = useState<number>(0);

  useEffect(() => {
    if (isVisible) {
      setVisibleMessages(0);
      messages.forEach((_, index) => {
        setTimeout(() => {
          setVisibleMessages(index + 1);
        }, index * 800);
      });
    } else {
      setVisibleMessages(0);
    }
  }, [isVisible, messages]);

  return (
    <div className="w-full h-full bg-background border border-border/50 rounded-lg flex flex-col overflow-hidden">
      {/* WhatsApp Header */}
      <div className="bg-secondary/10 border-b border-border/30 p-3 flex items-center gap-3">
        <img 
          src={rumiLogo} 
          alt="Rumi" 
          className="w-10 h-10 rounded-full object-contain bg-background p-1.5 border border-border/20"
        />
        <div>
          <h4 className="font-normal text-sm tracking-tight">Rumi</h4>
          <p className="text-xs text-muted-foreground font-light">Always here for you</p>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto bg-secondary/5">
        {messages.slice(0, visibleMessages).map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.from === "teacher" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                msg.from === "teacher"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.type === "voice" ? (
                <div className="flex items-center gap-2 min-w-[180px]">
                  <button className="w-8 h-8 rounded-full bg-background/20 flex items-center justify-center flex-shrink-0 hover:bg-background/30 transition-colors">
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                      <path d="M0 0L12 7L0 14V0Z" />
                    </svg>
                  </button>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-0.5 h-6">
                      {[...Array(30)].map((_, i) => (
                        <div
                          key={i}
                          className="w-0.5 rounded-full bg-current opacity-70"
                          style={{
                            height: `${Math.random() * 60 + 40}%`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] opacity-70">{msg.duration || "0:10"}</span>
                  </div>
                </div>
              ) : msg.type === "file" ? (
                <div className="flex items-start gap-3 min-w-[200px]">
                  <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-normal leading-tight truncate">{msg.fileName || "document.pdf"}</p>
                    <p className="text-xs opacity-70 mt-0.5">{msg.fileSize || "1.4 MB"} • {msg.fileType || "pdf"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-light leading-relaxed">{msg.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* WhatsApp Input (static for visual) */}
      <div className="border-t border-border/30 p-3 bg-background">
        <div className="bg-secondary/20 rounded-full px-4 py-2 text-sm text-muted-foreground font-light">
          Message Rumi...
        </div>
      </div>
    </div>
  );
};

export default WhatsAppChat;
