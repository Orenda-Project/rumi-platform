import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import rumiLogo from "@/assets/rumi-logo.png";
import { getWhatsAppUrl, trackCtaClick } from "@/lib/funnelTracking";

const HowItWorks = () => {
  const whatsappUrl = getWhatsAppUrl('https://wa.me/message/WCYNS4DTDB2MD1');

  const handleCtaClickTracking = () => {
    trackCtaClick('how-it-works');
  };

  return (
    <div className="min-h-screen">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="relative min-h-[60vh] flex items-center justify-center pt-16">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/20" />

          <div className="container relative z-10 px-6 py-32 mx-auto max-w-4xl text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-light leading-[1.05] tracking-tight mb-8">
              How Rumi Works
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-light max-w-3xl mx-auto">
              Rumi lives in WhatsApp. No app to download. No new platform to learn.
              Just open WhatsApp and start talking to someone who understands teaching.
            </p>
          </div>
        </section>

        {/* Start a Conversation */}
        <section className="py-24 bg-background">
          <div className="container px-6 mx-auto max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-light mb-8 tracking-tight">
              Start a Conversation
            </h2>
            <div className="space-y-6 text-xl text-muted-foreground leading-relaxed font-light">
              <p>
                Say hi in your language. Ask anything about teaching.
              </p>
              <p>
                Text: "How do I handle a student who constantly disrupts class?"
              </p>
              <p>
                Voice: Record your question while driving home.
              </p>
              <p>
                Rumi responds in seconds. In the same format you sent.
                In English, Urdu, Arabic, or Spanish.
              </p>
            </div>
          </div>
        </section>

        {/* Use Your Voice */}
        <section className="py-24 bg-secondary/20">
          <div className="container px-6 mx-auto max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-light mb-8 tracking-tight">
              Use Your Voice When Your Hands Are Busy
            </h2>
            <div className="space-y-6 text-xl text-muted-foreground leading-relaxed font-light">
              <p>
                Record a voice message. Speak naturally. Process your thoughts
                while walking, driving, or lying in bed.
              </p>
              <p>
                Rumi transcribes, understands, and responds with a voice message back.
                In your language. With understanding and warmth.
              </p>
              <p className="text-foreground font-normal">
                Say "speak in Urdu" or "تحدث بالعربية" to switch languages anytime.
              </p>
            </div>
          </div>
        </section>

        {/* Request Lesson Plans */}
        <section className="py-24 bg-background">
          <div className="container px-6 mx-auto max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-light mb-8 tracking-tight">
              Request Full Lesson Plans
            </h2>
            <div className="space-y-6 text-xl text-muted-foreground leading-relaxed font-light">
              <p>
                Need structured materials? Just ask.
              </p>
              <p className="text-foreground font-normal">
                Type: "Generate lesson plan: Photosynthesis for Grade 5"
              </p>
              <p>
                Wait 60-90 seconds.
              </p>
              <p>
                Get: A complete PDF with learning objectives, activities, timing,
                materials list, and differentiation strategies.
              </p>
              <p>
                Use as-is or adapt for your classroom.
              </p>
            </div>
          </div>
        </section>

        {/* Coaching */}
        <section className="py-24 bg-secondary/20">
          <div className="container px-6 mx-auto max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-light mb-8 tracking-tight">
              Get Personalized Coaching on Your Teaching
            </h2>
            <div className="space-y-6 text-xl text-muted-foreground leading-relaxed font-light">
              <p>
                Want to grow as a teacher? Send Rumi a classroom recording.
              </p>

              <div className="space-y-3 pl-6">
                <p className="text-lg">
                  <span className="font-normal text-foreground">1.</span> Record 20 minutes of your teaching (audio only, from your phone)
                </p>
                <p className="text-lg">
                  <span className="font-normal text-foreground">2.</span> Send it to Rumi as a voice message
                </p>
                <p className="text-lg">
                  <span className="font-normal text-foreground">3.</span> Answer 3 reflective questions about your lesson
                </p>
                <p className="text-lg">
                  <span className="font-normal text-foreground">4.</span> Get detailed pedagogical analysis in ~30 minutes
                </p>
                <p className="text-lg">
                  <span className="font-normal text-foreground">5.</span> Receive a voice debrief + PDF report
                </p>
              </div>

              <p className="pt-4">
                Rumi analyzes your questioning techniques, student engagement,
                clarity of explanation, and more. Not to judge. To help you grow.
              </p>
            </div>
          </div>
        </section>

        {/* Context Memory */}
        <section className="py-24 bg-background">
          <div className="container px-6 mx-auto max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-light mb-8 tracking-tight">
              Rumi Remembers Your Journey
            </h2>
            <div className="space-y-6 text-xl text-muted-foreground leading-relaxed font-light">
              <p>
                Unlike searching ChatGPT every time, Rumi remembers your conversations.
                Your students. Your challenges. Your context.
              </p>
              <p>
                Pick up where you left off. No need to re-explain.
              </p>
              <p className="text-base italic pt-2">
                *Conversations reset after 30 minutes of inactivity to keep things private.
              </p>
            </div>
          </div>
        </section>

        {/* Always There */}
        <section className="py-24 bg-secondary/20">
          <div className="container px-6 mx-auto max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-light mb-8 tracking-tight">
              Always There, Never Judging
            </h2>
            <div className="space-y-6 text-xl text-muted-foreground leading-relaxed font-light">
              <p>
                11 PM lesson planning? Rumi's awake.
              </p>
              <p>
                6 AM morning anxiety? Rumi listens.
              </p>
              <p>
                Tough day in the classroom? Rumi understands.
              </p>
              <p className="text-foreground font-normal pt-4">
                No "stupid questions." No judgment. Ever.
              </p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-32 bg-primary text-primary-foreground relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/90" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

          <div className="container relative z-10 px-6 mx-auto max-w-4xl text-center">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-light mb-8 tracking-tight">
              Ready to Stop Teaching Alone?
            </h2>

            <p className="text-xl md:text-2xl mb-12 font-light opacity-90 max-w-2xl mx-auto">
              Teaching is lonely. It doesn't have to be.
            </p>

            <Button
              asChild
              variant="secondary"
              size="xl"
              className="group text-lg px-8 py-6 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleCtaClickTracking}
              >
                <WhatsAppIcon className="transition-transform group-hover:scale-110" size={24} />
                Meet Rumi
              </a>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-16 border-t border-border/50 bg-background">
        <div className="container px-6 mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <img src={rumiLogo} alt="Rumi logo" className="w-8 h-8 object-contain" />
              <span className="text-lg font-normal tracking-tight">Rumi</span>
            </div>
            <p className="text-sm text-muted-foreground font-light">
              © 2025 Rumi. Supporting teachers everywhere.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HowItWorks;
