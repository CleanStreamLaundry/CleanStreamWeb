import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunctionService } from "../../interfaces/FunctionService";

export class EdgeFunctionRepository implements FunctionService {
    constructor(private client: SupabaseClient) { }

    callFunction = async <T = unknown>(
        name: string,
        params?: Record<string, unknown>
    ): Promise<T> => {
        const { data, error } = await this.client.functions.invoke(
            name,
            params === undefined ? {} : { body: params },
        );

        if (error) {
            throw error;
        }

        if (data === undefined || data === null) {
            throw new Error(`${name} returned no data`);
        }

        return data as T;
    }
}
