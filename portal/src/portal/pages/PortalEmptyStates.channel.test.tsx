import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// A teacher with nothing yet is told where to start. That used to be "using
// the WhatsApp bot" with an "Open WhatsApp" button on every deployment; now it
// names WhatsApp only where the bot answers there, and shows a button only
// when there is a chat link (useChatChannel, from GET /api/portal/channels).

const channel = vi.hoisted(() => ({ current: { whatsapp: false, chatUrl: null as string | null } }));
vi.mock("@/hooks/useChatChannel", () => ({ useChatChannel: () => channel.current }));
// One toast function for every render: the pages refetch when it changes.
const toast = vi.hoisted(() => ({ toast: () => {} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => toast }));
vi.mock("../components/PortalLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../services/api", () => ({
  portal: {
    getCoachingSessions: vi.fn(async () => ({ sessions: [] })),
    getLessonPlans: vi.fn(async () => ({ lessonPlans: [] })),
  },
}));

import PortalCoaching from "./PortalCoaching";
import PortalLessonPlans from "./PortalLessonPlans";

const pages = [
  ["coaching", PortalCoaching, /Complete your first coaching session/],
  ["lesson plans", PortalLessonPlans, /Generate your first lesson plan/],
] as const;

describe("portal empty states on a deployment's own channel", () => {
  beforeEach(() => {
    channel.current = { whatsapp: false, chatUrl: null };
  });

  it.each(pages)("%s, no WhatsApp and no chat link: the chat with Rumi, no button", async (_name, Page, start) => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(await screen.findByText(start)).toHaveTextContent(/in your chat with Rumi/);
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(screen.queryByRole("link", { name: /WhatsApp|Chat with Rumi/ })).toBeNull();
  });

  it.each(pages)("%s, no WhatsApp with a chat link: a Chat with Rumi button to it", async (_name, Page) => {
    channel.current = { whatsapp: false, chatUrl: "https://chat.example.org/rumi" };
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Chat with Rumi" })).toHaveAttribute("href", "https://chat.example.org/rumi");
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });

  it.each(pages)("%s, WhatsApp deployment: unchanged WhatsApp copy and button", async (_name, Page, start) => {
    channel.current = { whatsapp: true, chatUrl: "https://wa.me/message/EXAMPLE" };
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(await screen.findByText(start)).toHaveTextContent(/using the WhatsApp bot/);
    expect(screen.getByRole("link", { name: "Open WhatsApp" })).toHaveAttribute("href", "https://wa.me/message/EXAMPLE");
  });
});
