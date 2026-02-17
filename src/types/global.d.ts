/**
 * Global Type Declarations
 * This file provides type definitions to resolve API response type errors
 */

// Extend the global scope
declare global {
    // Allow flexible property access during development
    type AnyObject = { [key: string]: any };

    // Helper type for API responses
    type ApiData<T = any> = T | T[] | null | undefined;
}

// Module augmentation for API client
declare module '@/lib/api' {
    export interface ApiResponse<T = any> {
        data?: T | T[];
        error?: string;
        message?: string;
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        // Allow any additional properties
        [key: string]: any;
    }

    export class ApiClient {
        [key: string]: any;
    }
}

// Export to make this a module
export { };
