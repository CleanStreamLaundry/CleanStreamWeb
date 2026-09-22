import { describe, expect, it, vi } from "vitest";
import { CortinaVendRepository } from "./CortinaVendRepository";

describe("CortinaVendRepository", () => {
  it("uses the Edge Function error message when a request is declined", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message: "Edge Function returned a non-2xx status code",
            context: new Response(JSON.stringify({
              error: "Machine payments are not enabled",
              code: "machine_disabled",
            }), { status: 409 }),
          },
        }),
      },
    };
    const repository = new CortinaVendRepository(client as never);

    await expect(repository.quote("public-token")).rejects.toThrow(
      "Machine payments are not enabled",
    );
  });

  it("preserves network errors whose context is not an HTTP response", async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Failed to send a request to the Edge Function", context: new TypeError("Failed to fetch") },
    }) } };
    const repository = new CortinaVendRepository(client as never);

    await expect(repository.quote("public-token")).rejects.toThrow("Failed to send a request to the Edge Function");
  });

  it("preserves the original error when the HTTP body is not JSON", async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Service unavailable", context: new Response("Unavailable", { status: 503 }) },
    }) } };
    const repository = new CortinaVendRepository(client as never);

    await expect(repository.quote("public-token")).rejects.toThrow("Service unavailable");
  });
});
