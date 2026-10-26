import type { Refund, RefundService } from "../../interfaces/RefundService";
import { SupabaseClient } from "@supabase/supabase-js";

type RefundRow = {
    refund_id: Refund["refundId"];
    transaction_id: Refund["transactionId"];
    amount: Refund["amount"];
    description: Refund["reason"];
    date: Refund["date"];
    status: Refund["status"];
    profiles: {
        id: Refund["customerId"];
        full_name: Refund["customerName"];
        refund_attempts: Refund["attempts"];
    };
};

export class RefundRepository implements RefundService {
    constructor(private client: SupabaseClient) {}

    getRefunds = async (): Promise<Refund[]> => {
        const sevenDaysAgo = new Date();
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(sevenDaysAgo.getDate() - 14);
        const { data, error } = await this.client
            .from("Refunds")
            .select<string, RefundRow>(`
                refund_id,
                transaction_id,
                amount,
                description,
                date,
                status,
                profiles (
                    id,
                    full_name,
                    refund_attempts
                )
                `)
            .gte("date", twoWeeksAgo.toISOString());


        if (error || data === null) throw error;
         
        return data.map((row)=> ({
            refundId: row.refund_id,
            id: ("R" + row.refund_id),
            customerName: row.profiles.full_name,
            customerId: row.profiles.id,
            transactionId: row.transaction_id,
            amount: row.amount,
            reason: row.description,
            date: row.date,
            status: row.status,
            attempts: row.profiles.refund_attempts
        }));
    }
}
