import { describe, it, expect } from "vitest";
import { welcomeBack } from "./greeting";

// Someone who reaches Rumi only on the messenger may sign in before Rumi has
// learned their name; the dashboard must not greet them with "Welcome back, !".
describe("welcomeBack", () => {
  it("greets by first name when there is one", () => {
    expect(welcomeBack("Sam")).toBe("Welcome back, Sam!");
  });
  it("drops the name, not just the value, when there is none", () => {
    expect(welcomeBack(null)).toBe("Welcome back!");
    expect(welcomeBack(undefined)).toBe("Welcome back!");
    expect(welcomeBack("  ")).toBe("Welcome back!");
  });
});
