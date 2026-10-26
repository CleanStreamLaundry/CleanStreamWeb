import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import WasherRatesPanel from "./WasherRatesPanel";
import type { LocationService, WasherSizeRate } from "../interfaces/LocationService";

const { getRates, saveRate } = vi.hoisted(() => ({
  getRates: vi.fn<LocationService["getWasherSizeRates"]>(),
  saveRate: vi.fn<LocationService["saveWasherSizeRate"]>(),
}));
vi.mock("../di/container", () => ({ useLocations: () => ({ getWasherSizeRates: getRates, saveWasherSizeRate: saveRate }) }));

const rate: WasherSizeRate = {
  id: 7, location_id: 1, size_label: "Large", capacity_kg: 12,
  price_cents: 425, is_active: true, review_required: true,
};
const draftRow = () => within(screen.getByRole("button", { name: "Add washer rate" }).closest(".rate-row") as HTMLElement);
const fillDraft = () => {
  const row = draftRow();
  fireEvent.change(row.getByLabelText("Size label"), { target: { value: "Small" } });
  fireEvent.change(row.getByLabelText("Capacity kg"), { target: { value: "8" } });
  fireEvent.change(row.getByLabelText("Price"), { target: { value: "3.125" } });
};

describe("WasherRatesPanel", () => {
  beforeEach(() => {
    getRates.mockReset().mockResolvedValue([]);
    saveRate.mockReset().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it("preserves blank defaults, cents conversion, validation, and successful refresh order", async () => {
    const onChanged = vi.fn();
    render(<WasherRatesPanel locationId={1} onChanged={onChanged} />);
    await act(async () => {});
    expect(getRates).toHaveBeenCalledWith(1);
    expect(draftRow().getByLabelText("Size label")).toHaveValue("");
    expect(draftRow().getByLabelText("Capacity kg")).toHaveValue(null);
    expect(draftRow().getByLabelText("Price")).toHaveValue(null);
    expect(draftRow().getByLabelText("Active")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Add washer rate" }));
    expect(screen.getByText("Enter a size label, capacity, and price.")).toBeInTheDocument();
    expect(saveRate).not.toHaveBeenCalled();
    fillDraft();
    let finish!: (data: WasherSizeRate[]) => void;
    getRates.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Add washer rate" }));
    await waitFor(() => expect(getRates).toHaveBeenCalledTimes(2));
    expect(saveRate).toHaveBeenCalledWith({
      id: 0, location_id: 1, size_label: "Small", capacity_kg: 8,
      price_cents: 313, is_active: true, review_required: false,
    });
    expect(onChanged).not.toHaveBeenCalled();
    await act(async () => finish([{ ...rate, size_label: "Small" }]));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(draftRow().getByLabelText("Size label")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save Small" })).toBeEnabled();
  });

  it("retains an unrelated draft when saving an existing rate", async () => {
    getRates.mockResolvedValue([rate]);
    render(<WasherRatesPanel locationId={1} onChanged={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Save Large" });
    const existing = within(button.closest(".rate-row") as HTMLElement);
    expect(existing.getByLabelText("Price")).toHaveValue(4.25);
    fillDraft();
    fireEvent.click(existing.getByLabelText("Active"));
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(saveRate).toHaveBeenCalledWith({ ...rate, is_active: false, review_required: false });
    expect(draftRow().getByLabelText("Size label")).toHaveValue("Small");
    expect(draftRow().getByLabelText("Price")).toHaveValue(3.13);
  });

  it("preserves same-location edits and resets drafts and errors on departure and return", async () => {
    const props = { onChanged: vi.fn() };
    const { rerender } = render(<WasherRatesPanel locationId={1} {...props} />);
    await act(async () => {});
    fireEvent.change(draftRow().getByLabelText("Size label"), { target: { value: "draft" } });
    rerender(<WasherRatesPanel locationId={1} {...props} />);
    expect(draftRow().getByLabelText("Size label")).toHaveValue("draft");
    fireEvent.click(screen.getByRole("button", { name: "Add washer rate" }));
    expect(screen.getByText("Enter a size label, capacity, and price.")).toBeInTheDocument();
    rerender(<WasherRatesPanel locationId={2} {...props} />);
    expect(draftRow().getByLabelText("Size label")).toHaveValue("");
    expect(screen.queryByText("Enter a size label, capacity, and price.")).not.toBeInTheDocument();
    rerender(<WasherRatesPanel locationId={1} {...props} />);
    expect(draftRow().getByLabelText("Size label")).toHaveValue("");
    await act(async () => {});
  });

  it.each([false, true])("ignores a departed load after return (reject=%s)", async (reject) => {
    let finish!: () => void;
    getRates.mockImplementationOnce(() => new Promise((resolve, fail) => {
      finish = () => reject ? fail(new Error("obsolete")) : resolve([rate]);
    }));
    const props = { onChanged: vi.fn() };
    const { rerender } = render(<WasherRatesPanel locationId={1} {...props} />);
    rerender(<WasherRatesPanel locationId={2} {...props} />);
    rerender(<WasherRatesPanel locationId={1} {...props} />);
    await act(async () => finish());
    expect(screen.queryByRole("button", { name: "Save Large" })).not.toBeInTheDocument();
    expect(screen.queryByText("obsolete")).not.toBeInTheDocument();
  });

  it("ignores the obsolete initial effect in StrictMode", async () => {
    let finish!: (data: WasherSizeRate[]) => void;
    getRates.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue([{ ...rate, size_label: "Current" }]);
    render(<StrictMode><WasherRatesPanel locationId={1} onChanged={vi.fn()} /></StrictMode>);
    await screen.findByRole("button", { name: "Save Current" });
    await act(async () => finish([rate]));
    expect(screen.getByRole("button", { name: "Save Current" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Large" })).not.toBeInTheDocument();
  });

  it("prevents overlapping submits and unlocks after a returned error", async () => {
    let finish!: (error: string) => void;
    saveRate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const onChanged = vi.fn();
    render(<WasherRatesPanel locationId={1} onChanged={onChanged} />);
    await act(async () => {});
    fillDraft();
    const button = screen.getByRole("button", { name: "Add washer rate" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(saveRate).toHaveBeenCalledTimes(1);
    expect(draftRow().getByLabelText("Price")).toBeDisabled();
    await act(async () => finish("Rate not saved"));
    expect(screen.getByText("Rate not saved")).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(draftRow().getByLabelText("Size label")).toHaveValue("Small");
    expect(onChanged).not.toHaveBeenCalled();
    expect(getRates).toHaveBeenCalledTimes(1);
  });

  it("handles a rejected save without losing the draft or calling onChanged", async () => {
    saveRate.mockRejectedValue(new Error("network"));
    const onChanged = vi.fn();
    render(<WasherRatesPanel locationId={1} onChanged={onChanged} />);
    await act(async () => {});
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "Add washer rate" }));
    await screen.findByText("Unable to save washer rate. Please try again.");
    expect(draftRow().getByLabelText("Size label")).toHaveValue("Small");
    expect(screen.getByRole("button", { name: "Add washer rate" })).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it.each(["success", "error", "reject"])("ignores a departed save after return (%s)", async (outcome) => {
    let finish!: () => void;
    saveRate.mockImplementationOnce(() => new Promise((resolve, reject) => {
      finish = () => outcome === "reject" ? reject(new Error("obsolete")) : resolve(outcome === "error" ? "obsolete" : undefined);
    }));
    const onChanged = vi.fn();
    const { rerender } = render(<WasherRatesPanel locationId={1} onChanged={onChanged} />);
    await act(async () => {});
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "Add washer rate" }));
    rerender(<WasherRatesPanel locationId={2} onChanged={onChanged} />);
    rerender(<WasherRatesPanel locationId={1} onChanged={onChanged} />);
    fireEvent.change(draftRow().getByLabelText("Size label"), { target: { value: "fresh" } });
    await act(async () => finish());
    expect(draftRow().getByLabelText("Size label")).toHaveValue("fresh");
    expect(screen.queryByText(/obsolete|Unable to save/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add washer rate" })).toBeEnabled();
    expect(getRates).toHaveBeenCalledTimes(3);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("prevents an older initial load from overwriting the post-save refresh", async () => {
    let finish!: (data: WasherSizeRate[]) => void;
    getRates.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue([{ ...rate, size_label: "Saved" }]);
    render(<WasherRatesPanel locationId={1} onChanged={vi.fn()} />);
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "Add washer rate" }));
    await screen.findByRole("button", { name: "Save Saved" });
    await act(async () => finish([rate]));
    expect(screen.queryByRole("button", { name: "Save Large" })).not.toBeInTheDocument();
  });

  it.each([false, true])("ignores a post-save refresh after unmount (reject=%s)", async (reject) => {
    let finish!: () => void;
    getRates.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise((resolve, fail) => {
      finish = () => reject ? fail(new Error("obsolete")) : resolve([rate]);
    }));
    const onChanged = vi.fn();
    const { unmount } = render(<WasherRatesPanel locationId={1} onChanged={onChanged} />);
    await act(async () => {});
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "Add washer rate" }));
    await waitFor(() => expect(getRates).toHaveBeenCalledTimes(2));
    unmount();
    await act(async () => finish());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it.each([false, true])("notifies after a saved rate and retains only current load errors (refresh fails=%s)", async (refreshFails) => {
    getRates.mockRejectedValueOnce(new Error("Cannot load rates"));
    if (refreshFails) getRates.mockRejectedValueOnce(new Error("Cannot load rates"));
    const onChanged = vi.fn();
    render(<WasherRatesPanel locationId={1} onChanged={onChanged} />);
    await screen.findByText("Cannot load rates");
    fillDraft();
    fireEvent.click(screen.getByRole("button", { name: "Add washer rate" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    if (refreshFails) expect(screen.getByText("Cannot load rates")).toBeInTheDocument();
    else expect(screen.queryByText("Cannot load rates")).not.toBeInTheDocument();
  });
});
