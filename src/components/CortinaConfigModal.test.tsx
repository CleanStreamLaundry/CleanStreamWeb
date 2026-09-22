import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CortinaConfigModal from "./CortinaConfigModal";
import type { Machine } from "../interfaces/LocationService";

const save = vi.hoisted(() => vi.fn());
vi.mock("../di/container", () => ({ useLocations: () => ({ saveCortinaConfig: save }) }));
const machine: Machine = {
  id: 1, Name: "Washer 1", Price: 4, Runtime: 30, Status: "Idle", Location_ID: 1,
  Machine_type: "Washer", Weight_kg: 12,
  cortina_machine_config: {
    machine_id: 1, nayax_terminal_id: "4434331126150568", nayax_uniqr: null,
    pulse_line_number: 1, environment: "sandbox", is_enabled: true, review_required: false,
  },
};

describe("Cortina product configuration", () => {
  beforeEach(() => { save.mockReset().mockResolvedValue(undefined); });
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
});
