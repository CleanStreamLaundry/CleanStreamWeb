import type { SupabaseClient } from "@supabase/supabase-js";
import type { CortinaQuote, CortinaVendReference, CortinaVendService, CortinaVendStatus } from "../../interfaces/CortinaVendService";

export class CortinaVendRepository implements CortinaVendService {
  constructor(private client: SupabaseClient) {}

  private async invoke<T>(route: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.functions.invoke(`cortina-vend/${route}`, { body });
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const details = await context.clone().json().catch(() => null) as { error?: unknown } | null;
        if (typeof details?.error === "string") throw new Error(details.error);
      }
      throw new Error(error.message);
    }
    if (!data || typeof data !== "object") throw new Error("Payment service returned an invalid response.");
    const response = data as Record<string, unknown>;
    if (response.error) throw new Error(String(response.error));
    return data as T;
  }

  quote = (machineToken?: string, uniQr?: string) =>
    this.invoke<CortinaQuote>("quote", { machineToken, uniQr });

  createCard = (machineToken: string | undefined, uniQr: string | undefined, amountCents: number, clientRequestId: string) =>
    this.invoke<CortinaVendReference & { checkoutUrl: string }>("card", {
      machineToken,
      uniQr,
      amountCents,
      channel: "web",
      clientRequestId,
    });

  payWithWallet = (machineToken: string | undefined, uniQr: string | undefined, amountCents: number, clientRequestId: string) =>
    this.invoke<CortinaVendReference>("wallet", { machineToken, uniQr, amountCents, channel: "web", clientRequestId });

  status = (reference: CortinaVendReference) =>
    this.invoke<CortinaVendStatus>("status", { ...reference });

  hasSession = async () => Boolean((await this.client.auth.getSession()).data.session);
}
