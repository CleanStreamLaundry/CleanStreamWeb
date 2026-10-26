import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationForm } from "./MachineForms";

const mocks = vi.hoisted(() => ({
  preview: false,
  createLocation: vi.fn(),
  getCoordinates: vi.fn(),
}));
vi.mock("./context", () => ({
  useAdmin: () => ({ api: { createLocation: mocks.createLocation }, preview: mocks.preview }),
}));
vi.mock("../geocodeMaps/repositories/CoordinateRepository", () => ({
  CoordinateRepository: class { getCoordinates = mocks.getCoordinates; },
}));
const dialogDescriptors = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createLocation.mockResolvedValue({ id: 42 });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
});
afterEach(() => {
  expect(mocks.getCoordinates).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  cleanup();
  for (const method of ["showModal", "close"]) {
    const descriptor = dialogDescriptors[method];
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, method, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function show() {
  const onSaved = vi.fn();
  render(<LocationForm onClose={vi.fn()} onSaved={onSaved} />);
  fill("Location name", " Test location ");
  fill("Street address", " 100 Test Street ");
  fill("City", " Test City ");
  fill("ZIP code", "46000");
  return onSaved;
}
function submit() {
  // Bypass native validation to exercise the submit handler's own guards.
  fireEvent.submit(screen.getByRole("button", { name: "Add location" }).closest("form")!);
}

describe.each([false, true])("LocationForm preview=%s", (preview) => {
  beforeEach(() => { mocks.preview = preview; });

  it("starts with required blank coordinates and native range constraints", () => {
    show();
    for (const [label, min, max] of [["Latitude", "-90", "90"], ["Longitude", "-180", "180"]] as const) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveValue(null);
      expect(input).toBeRequired();
      expect(input).toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("min", min);
      expect(input).toHaveAttribute("max", max);
      expect(input).toHaveAttribute("step", "any");
    }
  });

  it.each([
    ["12.345678", "-45.678901"],
    ["0", "0"],
    ["-90", "-180"],
    ["90", "180"],
  ])("saves entered coordinates %s, %s through the existing API", async (lat, lon) => {
    const onSaved = show();
    fill("Latitude", lat);
    fill("Longitude", lon);
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith(42));
    expect(mocks.createLocation).toHaveBeenCalledExactlyOnceWith({
      Name: "Test location",
      Address: "100 Test Street, Test City, IN 46000",
      Latitude: Number(lat),
      Longitude: Number(lon),
    });
  });

  it.each([
    ["Latitude", ""], ["Longitude", ""],
    ["Latitude", "   "], ["Longitude", "   "],
    ["Latitude", "NaN"], ["Longitude", "NaN"],
    ["Latitude", "Infinity"], ["Longitude", "-Infinity"],
    ["Latitude", "1e309"], ["Longitude", "-1e309"],
    ["Latitude", "-90.0001"], ["Latitude", "90.0001"],
    ["Longitude", "-180.0001"], ["Longitude", "180.0001"],
  ])("rejects invalid %s value %j without saving or substituting", async (label, value) => {
    const onSaved = show();
    fill("Latitude", "12");
    fill("Longitude", "34");
    // Preserve malformed raw values that number inputs otherwise sanitize to blank.
    screen.getByLabelText(label).setAttribute("type", "text");
    fill(label, value);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(`Enter a valid ${label.toLowerCase()}`);
    expect(mocks.createLocation).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("keeps entered coordinates after API failure and allows a corrected retry", async () => {
    mocks.createLocation.mockRejectedValueOnce(new Error("Save failed"));
    const onSaved = show();
    fill("Latitude", "12.5");
    fill("Longitude", "-34.5");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Latitude")).toHaveValue(12.5);
    expect(screen.getByLabelText("Longitude")).toHaveValue(-34.5);
    fill("Longitude", "-35.5");
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith(42));
    expect(mocks.createLocation).toHaveBeenLastCalledWith(expect.objectContaining({
      Latitude: 12.5, Longitude: -35.5,
    }));
  });
});
