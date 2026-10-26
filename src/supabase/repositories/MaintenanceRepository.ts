import type { Maintenance, MaintenanceService } from "../../interfaces/MaintenanceService.ts";
import { SupabaseClient } from "@supabase/supabase-js";

export class MaintenanceRepository implements MaintenanceService {
  constructor(private client: SupabaseClient) {}

  getMaintenances = async (): Promise<Maintenance[]> => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const filterDate = twoWeeksAgo.toISOString();

    const { data, error } = await this.client
      .from("Maintenance")
      .select("*")
      .gte("created_at", filterDate);

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("No data returned from server");
    }

    return data.map((row: Maintenance) => ({
      maint_id: row.maint_id,
      user_id: row.user_id,
      category: row.category,
      description: row.description,
      created_at: row.created_at,
      location: row.location,
      image_data: row.image_data,
    }));
  };
}
