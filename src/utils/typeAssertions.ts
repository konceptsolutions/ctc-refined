/**
 * Type assertion utilities to handle API responses
 * These utilities help TypeScript understand the shape of API responses
 */

/**
 * Safely cast unknown API response to expected type
 */
export function asType<T>(value: unknown): T {
    return value as T;
}

/**
 * Check if value has a specific property
 */
export function hasProperty<K extends string>(
    obj: unknown,
    key: K
): obj is Record<K, unknown> {
    return typeof obj === 'object' && obj !== null && key in obj;
}

/**
 * Get property from unknown object safely
 */
export function getProperty<T = unknown>(obj: unknown, key: string): T | undefined {
    if (hasProperty(obj, key)) {
        return obj[key] as T;
    }
    return undefined;
}

/**
 * Assert that value is an array
 */
export function asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
        return value as T[];
    }
    return [];
}

/**
 * Extract data from API response
 */
export function extractData<T>(response: unknown): T | T[] | null {
    if (hasProperty(response, 'data')) {
        return response.data as T | T[];
    }
    if (Array.isArray(response)) {
        return response as T[];
    }
    return response as T;
}
