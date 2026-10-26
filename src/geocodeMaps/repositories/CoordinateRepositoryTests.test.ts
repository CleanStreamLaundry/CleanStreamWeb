import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoordinateRepository } from "./CoordinateRepository";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  listener: undefined as undefined | ((event: string) => void),
}));
vi.mock("../../admin/api", () => ({ invoke: mocks.invoke }));
vi.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: {
    getSession: mocks.getSession,
    onAuthStateChange: (listener: (event: string) => void) => {
      mocks.listener = listener;
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    },
  },
}) }));
const address = { address: "12 A&B #4", city: "Indianapolis", state: "IN", zipCode: "46201", country: "US" };
const coordinates = { lat: 39.7684, lon: -86.1581 };
describe("CoordinateRepository protected lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "captured-A" } }, error: null });
    mocks.invoke.mockResolvedValue({ coordinates });
    vi.stubGlobal("fetch", vi.fn(() => { throw Error("Browser provider access forbidden"); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("uses the existing portal action with captured bearer and unchanged structured address", async () => {
    expect(await new CoordinateRepository().getCoordinates(address)).toEqual(coordinates);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("geocode", { address }, "captured-A");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("signed-out lookup cannot call the portal or provider", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await new CoordinateRepository().getCoordinates(address)).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null for a provider no-match", async () => {
    mocks.invoke.mockResolvedValue({ coordinates: null });
    expect(await new CoordinateRepository().getCoordinates(address)).toBeNull();
  });

  it("does not retry or log controlled portal failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.invoke.mockRejectedValue(new Error("private provider detail"));
      expect(await new CoordinateRepository().getCoordinates(address)).toBeNull();
      expect(mocks.invoke).toHaveBeenCalledOnce();
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it("deduplicates identical in-flight lookups but permits a later explicit retry", async () => {
    let release!: (value: { coordinates: typeof coordinates }) => void;
    mocks.invoke.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const repo = new CoordinateRepository();
    const first = repo.getCoordinates(address);
    const second = repo.getCoordinates({ ...address });
    expect(second).toBe(first);
    await Promise.resolve();
    release({ coordinates });
    expect(await first).toEqual(coordinates);
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(await repo.getCoordinates(address)).toEqual(coordinates);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it("discards A-to-B-to-A completions and still uses the original captured bearer", async () => {
    mocks.invoke.mockImplementationOnce(async () => {
      mocks.listener!("SIGNED_OUT");
      mocks.listener!("SIGNED_IN");
      mocks.listener!("SIGNED_IN");
      return { coordinates };
    });
    expect(await new CoordinateRepository().getCoordinates(address)).toBeNull();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("geocode", { address }, "captured-A");
  });

  it("account change during session lookup prevents dispatch", async () => {
    mocks.getSession.mockImplementationOnce(async () => {
      mocks.listener!("SIGNED_OUT");
      return { data: { session: { access_token: "replacement-B" } }, error: null };
    });
    expect(await new CoordinateRepository().getCoordinates(address)).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects malformed/out-of-range coordinates", async () => {
    for (const value of [{ lat: "39", lon: -86 }, { lat: NaN, lon: 0 }, { lat: 0, lon: Infinity }, { lat: 91, lon: 0 }, { lat: 0, lon: -181 }]) {
      mocks.invoke.mockResolvedValueOnce({ coordinates: value });
      expect(await new CoordinateRepository().getCoordinates(address)).toBeNull();
    }
  });
});
