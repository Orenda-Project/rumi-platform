import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import rumiLogo from '@/assets/rumi-logo-white.jpg';

const PortalSetup = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [userInfo, setUserInfo] = useState<{ firstName: string; lastName: string; phoneNumber: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      toast({ title: "Invalid Link", description: "Setup link is invalid.", variant: "destructive" });
      navigate('/portal/login');
      return;
    }

    try {
      const response = await auth.validateToken(token);
      if (response.success && response.user) {
        setUserInfo(response.user);
      } else {
        throw new Error('Invalid token');
      }
    } catch (error: any) {
      toast({ 
        title: "Setup Link Invalid", 
        description: error.response?.data?.error || "This link has expired or already been used.",
        variant: "destructive" 
      });
      navigate('/portal/login');
    } finally {
      setValidating(false);
    }
  };

  const validatePassword = () => {
    if (password.length < 8) {
      return "Password must be at least 8 characters";
    }
    if (!/\d/.test(password)) {
      return "Password must contain at least one number";
    }
    if (password !== confirmPassword) {
      return "Passwords do not match";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const error = validatePassword();
    if (error) {
      toast({ title: "Invalid Password", description: error, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const response = await auth.setup(token!, password);
      if (response.success) {
        toast({ title: "Success!", description: "Portal setup complete. Redirecting..." });
        setTimeout(() => navigate('/portal/dashboard'), 1500);
      } else {
        throw new Error(response.error || 'Setup failed');
      }
    } catch (error: any) {
      toast({ 
        title: "Setup Failed", 
        description: error.response?.data?.error || "Please try again.",
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center p-6">
        <div className="text-primary-foreground text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Validating setup link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={rumiLogo} alt="Rumi logo" className="w-10 h-10 object-contain" />
            <h1 className="text-3xl sm:text-4xl font-light text-primary-foreground">Welcome to Rumi</h1>
          </div>
          <p className="text-primary-foreground/80">Set up your password to access your portal</p>
        </div>

        {userInfo && (
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6 text-primary-foreground">
            <p className="mb-2"><span className="font-semibold">Name:</span> {userInfo.firstName} {userInfo.lastName}</p>
            <p><span className="font-semibold">Phone:</span> +{userInfo.phoneNumber}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-8 shadow-[var(--shadow-medium)]">
          <div className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create password"
                className="w-full"
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-2">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full"
                required
              />
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium">Requirements:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>At least 8 characters</li>
                <li>Contains at least one number</li>
              </ul>
            </div>

            <Button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90"
              size="lg"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Portal Account'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PortalSetup;
