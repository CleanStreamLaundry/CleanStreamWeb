import type { TransactionService } from "../../interfaces/TransactionService";
import { SupabaseClient } from "@supabase/supabase-js";

export interface DailyData {
    date: string;
    amount: number;
}

export class TransactionRepository implements TransactionService {

    constructor(private client: SupabaseClient) {}

    getTodayRevenue = async (): Promise<number | null> => {
        let total: number = 0;
        const today = new Date();

        const startOfDay = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            0, 0, 0, 0
        );

        const endOfDay = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            23, 59, 59, 999
        );
        const { data, error } = await this.client
            .from('transactions')
            .select('*')
            .gte('created_at', startOfDay.toISOString())
            .lte('created_at', endOfDay.toISOString())
            .not('description', 'in', '("Loyalty payment on Dryer","Loyalty payment on Washer")');

        if (error) {
            console.error('Error fetching transactions:', error);
            return null;
        }

        if (!data || data.length === 0) {
            console.log("No transactions found for today.");
            return 0;
        }

        for (const row of data) {
            const amount = Number(row.amount);
            if (!isNaN(amount)) {
                total += amount;
            }
        }

        return total;
    };

    getLast30DaysRevenue = async (): Promise<{ dailyData: DailyData[], total: number } | null> => {
        try {
            const today = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(today.getDate() - 29);
            thirtyDaysAgo.setHours(0, 0, 0, 0);

            const { data, error } = await this.client
                .from('transactions')
                .select('created_at, amount')
                .gte('created_at', thirtyDaysAgo.toISOString())
                .lte('created_at', today.toISOString())
                .not('description', 'in', '("Loyalty payment on Dryer","Loyalty payment on Washer")');

            if (error) {
                console.error('Error fetching transactions:', error);
                return null;
            }

            const dailyMap = new Map<string, number>();
            let totalAmount = 0;

            for (let i = 0; i < 30; i++) {
                const date = new Date();
                date.setDate(today.getDate() - (29 - i));
                const dateKey = date.toISOString().split('T')[0];
                dailyMap.set(dateKey!, 0);
            }

            if (data) {
                for (const row of data) {
                    const amount = Number(row.amount);
                    if (!isNaN(amount)) {
                        const dateKey = new Date(row.created_at).toISOString().split('T')[0];
                        dailyMap.set(dateKey!, (dailyMap.get(dateKey!) || 0) + amount);
                        totalAmount += amount;
                    }
                }
            }

            const dailyArray = Array.from(dailyMap.entries())
                .map(([date, amount]) => ({ date, amount }))
                .sort((a, b) => a.date.localeCompare(b.date));

            return {
                dailyData: dailyArray,
                total: totalAmount
            };
        } catch (e) {
            console.error("Error fetching 30-day revenue:", e);
            return null;
        }
    };
}
