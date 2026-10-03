import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/runtime";
import { getWhatsAppUrl } from "@/lib/funnelTracking";

/**
 * Which chat this deployment's teachers use, from GET /api/portal/channels.
 *
 * A deployment may run no WhatsApp at all (Slack, Discord, Matrix or Rumi
 * Messenger only), so the landing page and the portal name WhatsApp, and link
 * to a WhatsApp chat, only when the dashboard says the bot answers there.
 * Until the answer arrives, or if it never does, `whatsapp` is false: neutral
 * copy ("your chat with Rumi") is true on every deployment, WhatsApp copy is
 * not.
 */
export interface ChatChannel {
  /** The bot answers on WhatsApp here. */
  whatsapp: boolean;
  /** Where "chat with Rumi" goes; null = nowhere to send people, so show no button. */
  chatUrl: string | null;
}

// The WhatsApp chat the portal has always linked to. Used only on a WhatsApp
// deployment that sets no PORTAL_CHAT_URL, so those keep today's link.
const BUILT_IN_WHATSAPP_CHAT_URL = "https://wa.me/message/WCYNS4DTDB2MD1";

const NEUTRAL: ChatChannel = { whatsapp: false, chatUrl: null };

let answer: Promise<ChatChannel> | null = null;

/** Asked once per page load; every component shares the answer. */
function fetchChatChannel(): Promise<ChatChannel> {
  if (!answer) {
    answer = (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/channels`);
        if (!res.ok) return NEUTRAL;
        const body = await res.json();
        const whatsapp = body?.whatsapp === true;
        const configured = typeof body?.chatUrl === "string" && /^https?:\/\//i.test(body.chatUrl) ? body.chatUrl : null;
        return { whatsapp, chatUrl: configured ?? (whatsapp ? BUILT_IN_WHATSAPP_CHAT_URL : null) };
      } catch {
        return NEUTRAL;
      }
    })();
  }
  return answer;
}

export function useChatChannel(): ChatChannel {
  const [channel, setChannel] = useState<ChatChannel>(NEUTRAL);
  useEffect(() => {
    let live = true;
    fetchChatChannel().then((c) => {
      if (live) setChannel(c);
    });
    return () => {
      live = false;
    };
  }, []);
  return channel;
}

/**
 * The landing page's call-to-action link: on WhatsApp it carries the funnel
 * session id, as it always has; any other chat link is used as given.
 */
export function landingChatHref(channel: ChatChannel): string | null {
  if (!channel.chatUrl) return null;
  return channel.whatsapp ? getWhatsAppUrl(channel.chatUrl) : channel.chatUrl;
}
