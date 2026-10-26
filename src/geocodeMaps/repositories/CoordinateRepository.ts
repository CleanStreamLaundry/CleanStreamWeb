import type { CoordinateService, Coordinates, AddressParams } from "../../interfaces/CoordinateService";
import { invoke } from "../../admin/api";
import { getSupabaseClient } from "../../supabase/client";

export class CoordinateRepository implements CoordinateService {
  private pending = new Map<string, Promise<Coordinates | null>>();

  getCoordinates = (address: AddressParams): Promise<Coordinates | null> => {
    const snapshot = { address: address.address, city: address.city, state: address.state, zipCode: address.zipCode, country: address.country };
    const key = JSON.stringify(snapshot);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = this.lookup(snapshot).finally(() => { this.pending.delete(key); });
    this.pending.set(key, request);
    return request;
  };

  private async lookup(address: AddressParams): Promise<Coordinates | null> {
    let unsubscribe: (() => void) | undefined;
    let accountChanged = false;
    try {
      const client = getSupabaseClient();
      const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") accountChanged = true;
      });
      unsubscribe = () => subscription.unsubscribe();
      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session?.access_token || accountChanged) return null;
      const result = await invoke<{ coordinates: Coordinates | null }>("geocode", { address }, session.access_token);
      if (accountChanged) return null;
      const coordinates = result.coordinates;
      if (!coordinates || typeof coordinates.lat !== "number" || typeof coordinates.lon !== "number" ||
          !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lon) ||
          Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lon) > 180) return null;
      return { lat: coordinates.lat, lon: coordinates.lon };
    } catch {
      return null;
    } finally {
      unsubscribe?.();
    }
  }
}
