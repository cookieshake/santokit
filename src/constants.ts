/**
 * Centralized constants for the Santoki application
 * This file contains all project-level constants to avoid magic strings/numbers
 */

export const CONSTANTS = {
    // HTTP Headers
    HEADERS: {
        PROJECT_ID: 'x-project-id',
    },

    // Authentication
    AUTH: {
        COOKIE_NAME: 'auth_token',
        TOKEN_EXPIRY_SECONDS: 60 * 60 * 24, // 24 hours
    },
} as const;

// Type helpers
export type ProjectId = number;
