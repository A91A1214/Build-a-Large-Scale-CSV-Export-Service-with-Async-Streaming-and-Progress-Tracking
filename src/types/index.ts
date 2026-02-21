export interface ExportJob {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    totalRows: number;
    processedRows: number;
    error: string | null;
    createdAt: Date;
    completedAt: Date | null;
    filePath: string | null;
}

export interface ExportFilters {
    country_code?: string;
    subscription_tier?: string;
    min_ltv?: number;
    columns?: string;
    delimiter?: string;
    quoteChar?: string;
}
