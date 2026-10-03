import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The reset code goes to the person's own chat with Rumi: WhatsApp on some
// deployments, Rumi Messenger on others (a deployment may run no WhatsApp at
// all). The reset pages say where it went without naming one channel, and use
// a fictional example number.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../services/api", () => ({ auth: { requestReset: vi.fn(), verifyResetCode: vi.fn(), resetPassword: vi.fn() } }));

import PortalPasswordReset from "./PortalPasswordReset";
import PortalPasswordResetVerify from "./PortalPasswordResetVerify";

describe("password reset pages on any channel", () => {
  it("the request page names the chat with Rumi, not WhatsApp", () => {
    render(<MemoryRouter><PortalPasswordReset /></MemoryRouter>);
    expect(screen.getByText(/receive a reset code in your chat with Rumi/)).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(screen.getByLabelText("Phone Number")).toHaveAttribute("placeholder", "15551234567");
  });

  it("the verify page names the chat with Rumi, not WhatsApp", () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/portal/reset-password/verify", state: { phoneNumber: "15551000001" } }]}>
        <PortalPasswordResetVerify />
      </MemoryRouter>
    );
    expect(screen.getByText(/code sent to your chat with Rumi/)).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });
});
