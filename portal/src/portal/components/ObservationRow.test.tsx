import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ObservationRow from "./ObservationRow";
import type { CoachObservation } from "../types/portal";

// Section B under an observation: the moves and the coach's verdicts, folded
// away until opened. Never a percentage, a band or a zero.

const base: CoachObservation = {
  id: "cs-1",
  createdAt: "2026-03-02T09:00:00Z",
  stage: "completed",
  teacherUserId: "t-1",
  teacherName: "Sam Taylor",
  schoolName: "Hillside Primary",
  reportStatus: "sent",
  reportSentAt: "2026-03-02T12:00:00Z",
};

const renderRow = (o: CoachObservation) => render(<ul><ObservationRow observation={o} /></ul>);

describe("ObservationRow — Section B", () => {
  it("shows no Section B block when the observation has none", () => {
    renderRow({ ...base, sectionB: null });
    expect(screen.queryByText(/Section B/)).not.toBeInTheDocument();
  });

  it("lists the moves in order with a verdict chip each, and marks the ones the coach changed", () => {
    renderRow({
      ...base,
      sectionB: {
        status: "assessed",
        mismatch: false,
        editedByCoach: true,
        moves: [
          { n: 1, phase: "warm_up", phaseLabel: "Warm-up", text: "Sing the counting song together.", verdict: "executed", verdictLabel: "As planned", coachChanged: false },
          { n: 2, phase: "guided", phaseLabel: "Guided practice", text: "Model two sums on the board.", verdict: "substituted_better", verdictLabel: "Better swap", coachChanged: true },
        ],
      },
    });
    const toggle = screen.getByRole("button", { name: /Lesson plan \(Section B\)/ });
    expect(screen.queryByText("Sing the counting song together.")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    const items = screen.getAllByRole("listitem").slice(1);
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^1.*Warm-up.*Sing the counting song together\..*As planned$/),
      expect.stringMatching(/^2.*Guided practice.*Model two sums on the board\..*Better swap.*changed by you/),
    ]);
    expect(screen.queryByText(/does not look like/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/%/);
  });

  it("warns when the recording did not match the plan", () => {
    renderRow({ ...base, sectionB: { status: "assessed", mismatch: true, editedByCoach: false, moves: [] } });
    fireEvent.click(screen.getByRole("button", { name: /Lesson plan \(Section B\)/ }));
    expect(screen.getByText(/does not look like this plan's lesson/)).toBeInTheDocument();
  });

  it("says why it was not assessed — never a zero", () => {
    renderRow({
      ...base,
      sectionB: { status: "not_assessed", reason: "no_timings", detail: null, message: "The plan was linked, but the transcript of this recording has no timings." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Lesson plan \(Section B\)/ }));
    expect(screen.getByText("Not assessed — The plan was linked, but the transcript of this recording has no timings.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b0\b|%/);
  });
});
