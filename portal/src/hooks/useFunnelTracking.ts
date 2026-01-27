/**
 * React hook for funnel tracking
 */

import { useEffect } from 'react';
import { trackVisit } from '@/lib/funnelTracking';

/**
 * Track page visit on component mount
 */
export function useTrackPageVisit() {
  useEffect(() => {
    // Track visit when page loads
    trackVisit();
  }, []); // Empty dependency array = run once on mount
}
