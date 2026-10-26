import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CortinaConfigModal from "./CortinaConfigModal";
import type { LocationService, Machine } from "../interfaces/LocationService";

const save = vi.hoisted(() => vi.fn<LocationService["saveCortinaConfig"]>());
const preview = vi.hoisted(() => vi.fn<() => Promise<string>>());
vi.mock("../di/container", () => ({ useLocations: () => ({ saveCortinaConfig: save }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: preview } }));
const machine: Machine = {
  id: 1, Name: "Washer 1", Price: 4, Runtime: 30, Status: "Idle", Location_ID: 1,
  Machine_type: "Washer", Weight_kg: 12,
  cortina_machine_config: {
    machine_id: 1, nayax_terminal_id: "4434331126150568", nayax_uniqr: null,
    pulse_line_number: 1, environment: "sandbox", is_enabled: true, review_required: false,
  },
};

describe("Cortina product configuration", () => {
  beforeEach(() => {
    save.mockReset().mockResolvedValue(undefined);
    preview.mockReset().mockResolvedValue("data:image/png;base64,new");
  });
  afterEach(cleanup);

  it("saves a zero-based product code without a pulse line", async () => {
    render(<CortinaConfigModal machine={machine} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Product selection"), { target: { value: "price_array" } });
    fireEvent.change(screen.getByLabelText("$4.00 product code"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Save setup"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      product_codes: { "400": 0 }, pulse_line_number: null, review_required: false,
    })));
  });

  it("does not enable a missing or fractional mapping", () => {
    render(<CortinaConfigModal machine={machine} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Product selection"), { target: { value: "price_array" } });
    fireEvent.click(screen.getByText("Save setup"));
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("$4.00 product code"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByText("Save setup"));
    expect(save).not.toHaveBeenCalled();
  });

  it("requires a code for every dryer price", async () => {
    render(<CortinaConfigModal machine={{ ...machine, Machine_type: "Dryer" }} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Product selection"), { target: { value: "price_array" } });
    const prices = [0.5, 1, 1.5, 2, 3, 4.5];
    for (const [code, price] of prices.entries()) {
      fireEvent.change(screen.getByLabelText(`$${price.toFixed(2)} product code`), { target: { value: String(code) } });
      if (code < 5) {
        fireEvent.click(screen.getByText("Save setup"));
        expect(save).not.toHaveBeenCalled();
      }
    }
    fireEvent.click(screen.getByText("Save setup"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      product_codes: { "50": 0, "100": 1, "150": 2, "200": 3, "300": 4, "450": 5 },
    })));
  });

  it("clears product codes when returning to pulse lines", async () => {
    const configured = { ...machine, cortina_machine_config: { ...machine.cortina_machine_config!, product_codes: { "400": 3 }, pulse_line_number: null } };
    render(<CortinaConfigModal machine={configured} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Product selection"), { target: { value: "pulse_line" } });
    fireEvent.change(screen.getByLabelText("Pulse line"), { target: { value: "2" } });
    fireEvent.click(screen.getByText("Save setup"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ product_codes: null, pulse_line_number: 2 })));
  });

  it("shows save errors without reporting success", async () => {
    save.mockRejectedValue(new Error("network"));
    const onSuccess = vi.fn();
    render(<CortinaConfigModal machine={machine} onClose={vi.fn()} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByText("Save setup"));
    await screen.findByText("Unable to save machine configuration. Please try again.");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("preserves defaults and edits across same-entity rerenders, resetting on close", () => {
    const props = { onClose: vi.fn(), onSuccess: vi.fn() };
    const { rerender } = render(<CortinaConfigModal machine={machine} {...props} />);
    expect(screen.getByLabelText("Terminal ID")).toHaveValue("4434331126150568");
    expect(screen.getByLabelText("Nayax UniQR (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Environment")).toHaveValue("sandbox");
    expect(screen.getByLabelText("Pulse line")).toHaveValue(1);
    fireEvent.change(screen.getByLabelText("Terminal ID"), { target: { value: "edited" } });
    rerender(<CortinaConfigModal machine={{ ...machine }} {...props} />);
    expect(screen.getByLabelText("Terminal ID")).toHaveValue("edited");
    rerender(<CortinaConfigModal machine={null} {...props} />);
    expect(screen.queryByLabelText("Terminal ID")).not.toBeInTheDocument();
    rerender(<CortinaConfigModal machine={machine} {...props} />);
    expect(screen.getByLabelText("Terminal ID")).toHaveValue("4434331126150568");
  });

  it("retains washer rounding, nullable text, and disabled review defaults", async () => {
    render(<CortinaConfigModal machine={{ ...machine, Price: 4.125 }} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Product selection"), { target: { value: "price_array" } });
    expect(screen.getByLabelText("$4.13 product code")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Terminal ID"), { target: { value: "  " } });
    fireEvent.click(screen.getByLabelText("Enable payments"));
    fireEvent.click(screen.getByText("Save setup"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      nayax_terminal_id: null, nayax_uniqr: null, is_enabled: false,
      product_codes: {}, pulse_line_number: null, review_required: true,
    })));
  });

  it("blocks overlapping saves before rerender and unlocks after a returned error", async () => {
    let finish!: (error: string) => void;
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(<CortinaConfigModal machine={machine} onClose={onClose} onSuccess={onSuccess} />);
    const button = screen.getByText("Save setup");
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Terminal ID")).toBeDisabled();
    await act(async () => finish("Try again"));
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByLabelText("Terminal ID")).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Save setup"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(["success", "error", "reject"])("ignores a departed save after return (%s)", async (outcome) => {
    let finish!: () => void;
    save.mockImplementationOnce(() => new Promise((resolve, reject) => {
      finish = () => outcome === "reject" ? reject(new Error("obsolete")) : resolve(outcome === "error" ? "obsolete" : undefined);
    }));
    const props = { onClose: vi.fn(), onSuccess: vi.fn() };
    const { rerender } = render(<CortinaConfigModal machine={machine} {...props} />);
    fireEvent.click(screen.getByText("Save setup"));
    rerender(<CortinaConfigModal machine={{ ...machine, id: 2, Name: "Washer 2" }} {...props} />);
    rerender(<CortinaConfigModal machine={machine} {...props} />);
    fireEvent.change(screen.getByLabelText("Terminal ID"), { target: { value: "fresh" } });
    await act(async () => finish());
    expect(screen.getByLabelText("Terminal ID")).toHaveValue("fresh");
    expect(screen.getByText("Save setup")).toBeEnabled();
    expect(screen.queryByText(/obsolete|Unable to save/)).not.toBeInTheDocument();
    expect(props.onSuccess).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("keeps only the latest QR preview and preserves its URL/options", async () => {
    let finish!: (url: string) => void;
    preview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<CortinaConfigModal machine={{ ...machine, cortina_machine_config: { ...machine.cortina_machine_config!, public_machine_token: "test-token" } }} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText("Preview QR"));
    fireEvent.click(screen.getByText("Preview QR"));
    expect(await screen.findByAltText("Payment QR for Washer 1")).toHaveAttribute("src", "data:image/png;base64,new");
    await act(async () => finish("data:image/png;base64,old"));
    expect(screen.getByAltText("Payment QR for Washer 1")).toHaveAttribute("src", "data:image/png;base64,new");
    expect(preview).toHaveBeenCalledWith("https://cleanstreamlaundry.com/pay?machine=test-token", { width: 520, margin: 2, errorCorrectionLevel: "H" });
    expect(screen.getByText("Download")).toHaveAttribute("download", "Washer-1-CleanStream-QR.png");
  });

  it.each([false, true])("ignores a departed QR completion (reject=%s)", async (reject) => {
    let finish!: () => void;
    preview.mockImplementationOnce(() => new Promise((resolve, fail) => {
      finish = () => reject ? fail(new Error("obsolete")) : resolve("data:image/png;base64,old");
    }));
    const props = { onClose: vi.fn(), onSuccess: vi.fn() };
    const { rerender } = render(<CortinaConfigModal machine={machine} {...props} />);
    fireEvent.click(screen.getByText("Preview QR"));
    rerender(<CortinaConfigModal machine={null} {...props} />);
    rerender(<CortinaConfigModal machine={machine} {...props} />);
    await act(async () => finish());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to preview QR. Please try again.")).not.toBeInTheDocument();
  });

  it("clears a QR failure when preview is retried", async () => {
    preview.mockRejectedValueOnce(new Error("QR failed"));
    render(<CortinaConfigModal machine={machine} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText("Preview QR"));
    await screen.findByText("Unable to preview QR. Please try again.");
    fireEvent.click(screen.getByText("Preview QR"));
    await screen.findByAltText("Payment QR for Washer 1");
    expect(screen.queryByText("Unable to preview QR. Please try again.")).not.toBeInTheDocument();
  });
});
