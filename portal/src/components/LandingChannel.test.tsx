import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The landing page promised "through WhatsApp" and linked to one WhatsApp
// chat on every deployment, including those that run no WhatsApp at all. It
// now asks the dashboard (GET /api/portal/channels) and names WhatsApp only
// when the answer says so; until the answer arrives, or if it never does, the
// copy is channel-neutral ("your chat with Rumi"), as on the password reset
// pages. The fetch is the faked boundary; i18n is the real English copy.

type Channels = { whatsapp: boolean; chatUrl: string | null };

function serve(body: Channels | "pending") {
  const fetchMock = vi.fn(() =>
    body === "pending"
      ? new Promise<Response>(() => {})
      : Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Fresh modules per test: the channel answer is fetched once per page load.
async function renderLanding() {
  vi.resetModules();
  const i18n = (await import("@/i18n/config")).default;
  await i18n.changeLanguage("en");
  const { default: Navigation } = await import("./Navigation");
  const { default: Hero } = await import("./Hero");
  const { default: FinalCTA } = await import("./FinalCTA");
  return render(
    <MemoryRouter>
      <Navigation />
      <Hero />
      <FinalCTA />
    </MemoryRouter>,
  );
}

const hrefs = (container: HTMLElement) => Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") || "");

// The CTA links carry a funnel session id kept in localStorage. Node 25 puts a
// localStorage on globalThis that throws unless started with a storage file,
// and it shadows jsdom's; a plain in-memory one stands in.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => Array.from(data.keys())[i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

describe("landing page on a deployment's own channel", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("no WhatsApp (CHANNEL_DRIVER=none): neutral copy, no WhatsApp text or link", async () => {
    const fetchMock = serve({ whatsapp: false, chatUrl: null });
    const { container } = await renderLanding();
    expect(await screen.findByText(/anytime, in your chat with Rumi\./)).toBeInTheDocument();
    // Once the answer is in, still nothing about WhatsApp.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/channels$/)));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(hrefs(container).filter((h) => /wa\.me|whatsapp/i.test(h))).toEqual([]);
    // Nowhere to send people: no chat button rather than a dead one.
    expect(screen.queryByRole("link", { name: /Chat with Rumi/ })).toBeNull();
  });

  it("no WhatsApp, with a chat link: the buttons say Chat with Rumi and go there", async () => {
    serve({ whatsapp: false, chatUrl: "https://chat.example.org/rumi" });
    const { container } = await renderLanding();
    const links = await screen.findAllByRole("link", { name: /Chat with Rumi/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link).toHaveAttribute("href", "https://chat.example.org/rumi");
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(hrefs(container).filter((h) => /wa\.me/i.test(h))).toEqual([]);
  });

  it("WhatsApp deployment: still says WhatsApp and links to the WhatsApp chat", async () => {
    serve({ whatsapp: true, chatUrl: null });
    const { container } = await renderLanding();
    expect(await screen.findByText(/anytime, through WhatsApp\./)).toBeInTheDocument();
    await waitFor(() => expect(hrefs(container).filter((h) => /^https:\/\/wa\.me\//.test(h)).length).toBeGreaterThanOrEqual(2));
  });

  it("while the answer is pending: neutral copy, no WhatsApp", async () => {
    serve("pending");
    await renderLanding();
    expect(screen.getByText(/anytime, in your chat with Rumi\./)).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });
});
