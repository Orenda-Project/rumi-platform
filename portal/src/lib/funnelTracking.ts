/**
 * Funnel Tracking Utility
 * Tracks user journey from website visit → CTA click → WhatsApp chat
 */

const TRACKING_API_URL = 'https://digital-coach-dashboard-production.up.railway.app/api/track';

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or create session ID from localStorage
 */
export function getSessionId(): string {
  const STORAGE_KEY = 'rumi_session_id';

  // Check if session ID exists in localStorage
  let sessionId = localStorage.getItem(STORAGE_KEY);

  // If not, create new one
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(STORAGE_KEY, sessionId);
  }

  return sessionId;
}

/**
 * Track website visit
 */
export async function trackVisit(): Promise<void> {
  try {
    const sessionId = getSessionId();

    await fetch(`${TRACKING_API_URL}/visit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        landing_page: window.location.href,
        referrer: document.referrer || null,
      }),
    });

    console.log('✅ Visit tracked', { sessionId });
  } catch (error) {
    console.error('❌ Failed to track visit:', error);
    // Don't throw - tracking failures shouldn't break the website
  }
}

/**
 * Track CTA click
 */
export async function trackCtaClick(buttonLocation: string): Promise<void> {
  try {
    const sessionId = getSessionId();

    await fetch(`${TRACKING_API_URL}/cta-click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        button_location: buttonLocation,
        whatsapp_link: window.location.href,
      }),
    });

    console.log('✅ CTA click tracked', { sessionId, buttonLocation });
  } catch (error) {
    console.error('❌ Failed to track CTA click:', error);
    // Don't throw - tracking failures shouldn't break the website
  }
}

/**
 * Add session ID to WhatsApp link (safe to call during render)
 */
export function addSessionIdToWhatsAppLink(whatsappUrl: string): string {
  const sessionId = getSessionId();

  // WhatsApp URL format: https://wa.me/message/WCYNS4DTDB2MD1
  // We need to add text parameter with session ID
  // Final format: https://wa.me/message/WCYNS4DTDB2MD1?text=sessionId%3Dsession-xxx

  const separator = whatsappUrl.includes('?') ? '&' : '?';
  const sessionParam = `text=sessionId%3D${sessionId}`;

  return `${whatsappUrl}${separator}${sessionParam}`;
}

/**
 * Handle CTA click - track and redirect
 * @deprecated Use getWhatsAppUrl() during render and trackCtaClick() in onClick handler instead
 */
export function handleCtaClick(buttonLocation: string, whatsappUrl: string): string {
  // Track the click (async, don't wait)
  trackCtaClick(buttonLocation);

  // Return WhatsApp URL with session ID
  return addSessionIdToWhatsAppLink(whatsappUrl);
}

/**
 * Get WhatsApp URL with session ID (safe to call during render)
 */
export function getWhatsAppUrl(whatsappUrl: string): string {
  return addSessionIdToWhatsAppLink(whatsappUrl);
}
