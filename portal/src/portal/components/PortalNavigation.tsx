import { Link, useLocation } from 'react-router-dom';
import { Home, BookOpen, MessageSquare, TrendingUp, LogOut, FileText, Video } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { cn } from '@/lib/utils';
import rumiLogo from '@/assets/rumi-logo-header.png';

const PortalNavigation = () => {
  const location = useLocation();
  const { logout, user } = useAuth();
  const currentPath = location.pathname;

  const navItems = [
    { title: 'Dashboard', path: '/portal/dashboard', icon: Home },
    { title: 'Lesson Plans', path: '/portal/lesson-plans', icon: BookOpen },
    { title: 'Coaching', path: '/portal/coaching', icon: MessageSquare },
    { title: 'Reading', path: '/portal/reading-assessments', icon: FileText },
    { title: 'Videos', path: '/portal/videos', icon: Video },
    { title: 'Analytics', path: '/portal/coaching/analytics', icon: TrendingUp },
  ];

  const isActive = (path: string) => currentPath === path;

  return (
    <>
      {/* Desktop Navigation - Top */}
      <nav className="hidden md:block bg-primary text-primary-foreground border-b border-white/10">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img 
                src={rumiLogo} 
                alt="Rumi logo" 
                className="w-8 h-8 object-contain" 
              />
              <span className="font-semibold text-lg">Rumi</span>
            </div>

            <div className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md transition-colors",
                    isActive(item.path)
                      ? "bg-white/20 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.title}</span>
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-white/80">{user?.firstName}</span>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation - Bottom */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg z-50">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 flex-1 transition-colors",
                isActive(item.path)
                  ? "text-accent"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive(item.path) && "text-accent")} />
              <span className="text-xs">{item.title}</span>
            </Link>
          ))}
          <button
            onClick={logout}
            className="flex flex-col items-center justify-center gap-1 px-3 py-2 flex-1 text-muted-foreground transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-xs">Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default PortalNavigation;
