/**
 * Global type declarations to fix API response types
 * This file extends the API client types to handle unknown responses
 */

declare module '@/lib/api' {
    export interface ApiResponse<T = any> {
        data?: T;
        error?: string;
        message?: string;
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        stats?: any;
        charts?: any;
        comparison?: any;
        records?: any;
        revenue?: any;
        cost?: any;
        expenses?: any;
        totals?: any;
        [key: string]: any;
    }
}

// Extend Window interface for any global properties
declare global {
    interface Window {
        [key: string]: any;
    }
}

export { };
