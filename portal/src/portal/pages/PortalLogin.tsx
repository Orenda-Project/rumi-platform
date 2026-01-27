import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import rumiLogo from '@/assets/rumi-logo-white.jpg';

const PortalLogin = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { toast } = useToast();
  
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phoneNumber || !password) {
      toast({ title: "Missing Fields", description: "Please enter both phone number and password.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const result = await login(phoneNumber, password);
      if (result.success) {
        toast({ title: "Welcome back!", description: "Redirecting to dashboard..." });
        setTimeout(() => navigate('/portal/dashboard'), 1000);
      } else {
        toast({ title: "Login Failed", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={rumiLogo} alt="Rumi logo" className="w-10 h-10 object-contain" />
            <h1 className="text-3xl sm:text-4xl font-light text-primary-foreground">Rumi Teacher Portal</h1>
          </div>
          <p className="text-primary-foreground/80">Sign in to access your teaching resources</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-8 shadow-[var(--shadow-medium)]">
          <div className="space-y-6">
            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-foreground mb-2">
                Phone Number
              </label>
              <Input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="923001234567"
                className="w-full"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Enter without + or spaces</p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90"
              size="lg"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Log In'}
            </Button>

            <div className="text-center mt-6">
              <button
                type="button"
                className="text-sm text-accent hover:text-accent/80 transition-colors"
                onClick={() => navigate('/portal/reset-password')}
              >
                Forgot password?
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PortalLogin;
