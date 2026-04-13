import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { BiasInsights } from "../BiasInsights";
import type { BiasAnalysis } from "@/types";

afterEach(cleanup);

const mockBiasAnalysis: BiasAnalysis = {
  signals: [
    {
      bias_type: "negativity_bias",
      label: "Negativity Bias",
      detected: true,
      strength: "high",
      evidence: "80% of reviews express negative sentiment.",
      adjustment_note: "Positive experiences are under-represented.",
    },
    {
      bias_type: "one_star_dominance",
      label: "One-Star Dominance",
      detected: true,
      strength: "medium",
      evidence: "72% of all reviews are 1-star.",
      adjustment_note: "Rage-reviewing compresses the average.",
    },
    {
      bias_type: "expectation_gap",
      label: "Expectation Gap",
      detected: false,
      strength: null,
      evidence: "5% of mid-range reviews mention expectations.",
      adjustment_note: "",
    },
    {
      bias_type: "scale_effect",
      label: "Scale Effect",
      detected: false,
      strength: null,
      evidence: "50 total reviews.",
      adjustment_note: "",
    },
  ],
  overall_bias_level: "moderate",
  summary: "This review set shows moderate bias patterns.",
  raw_rating: 1.6,
  adjusted_rating: 3.2,
  rating_adjustment: 1.6,
  adjustment_reasons: [
    { label: "Negativity Bias", adjustment: 0.8, explanation: "Self-selection bias." },
    { label: "Platform Context", adjustment: 0.8, explanation: "Trustpilot skews negative." },
  ],
};

describe("BiasInsights", () => {
  it("renders the card title and bias level badge", () => {
    const { container } = render(<BiasInsights biasAnalysis={mockBiasAnalysis} />);
    expect(container.textContent).toContain("Review Bias Intelligence");
    expect(container.textContent).toContain("moderate");
  });

  it("shows detected signal count", () => {
    const { container } = render(<BiasInsights biasAnalysis={mockBiasAnalysis} />);
    expect(container.textContent).toContain("2/4 signals detected");
  });

  it("displays raw and adjusted ratings", () => {
    const { container } = render(<BiasInsights biasAnalysis={mockBiasAnalysis} />);
    expect(container.textContent).toContain("1.6");
    expect(container.textContent).toContain("3.2");
    expect(container.textContent).toContain("+1.6");
  });

  it("shows detected signals with evidence", () => {
    const { container } = render(<BiasInsights biasAnalysis={mockBiasAnalysis} />);
    expect(container.textContent).toContain("Negativity Bias");
    expect(container.textContent).toContain("80% of reviews express negative sentiment.");
    expect(container.textContent).toContain("One-Star Dominance");
  });

  it("hides undetected signals by default", () => {
    const { container } = render(<BiasInsights biasAnalysis={mockBiasAnalysis} />);
    expect(container.textContent).not.toContain("Expectation Gap");
    expect(container.textContent).not.toContain("Scale Effect");
  });

  it("reveals undetected signals on toggle click", () => {
    const { container } = render(<BiasInsights biasAnalysis={mockBiasAnalysis} />);
    const toggle = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("undetected")
    )!;
    fireEvent.click(toggle);
    expect(container.textContent).toContain("Expectation Gap");
    expect(container.textContent).toContain("Scale Effect");
  });

  it("shows adjustment breakdown on toggle", () => {
    const { container } = render(<BiasInsights biasAnalysis={mockBiasAnalysis} />);
    const toggle = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("adjustment breakdown")
    )!;
    fireEvent.click(toggle);
    expect(container.textContent).toContain("Self-selection bias.");
    expect(container.textContent).toContain("Trustpilot skews negative.");
  });

  it("renders summary text", () => {
    const { container } = render(<BiasInsights biasAnalysis={mockBiasAnalysis} />);
    expect(container.textContent).toContain("This review set shows moderate bias patterns.");
  });

  it("handles no adjustment gracefully", () => {
    const noAdjustment: BiasAnalysis = {
      ...mockBiasAnalysis,
      rating_adjustment: 0,
      adjusted_rating: 4.0,
      raw_rating: 4.0,
      adjustment_reasons: [],
      signals: mockBiasAnalysis.signals.map((s) => ({ ...s, detected: false })),
      overall_bias_level: "minimal",
      summary: "No significant review biases detected.",
    };
    const { container } = render(<BiasInsights biasAnalysis={noAdjustment} />);
    expect(container.textContent).toContain("minimal");
    expect(container.textContent).not.toContain("adjustment breakdown");
  });
});
