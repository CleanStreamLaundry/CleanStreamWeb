export interface TransactionService {
    getTodayRevenue(): Promise<number | null>;
}
