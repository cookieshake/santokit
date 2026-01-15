/**
 * Centralized constants for the Santoki application
 * This file contains all project-level constants to avoid magic strings/numbers
 */

export const CONSTANTS = {
    // HTTP Headers
    HEADERS: {
        PROJECT_ID: 'x-project-id',
    },

    // Special Project Identifiers
    PROJECTS: {
        SYSTEM_ID: 'system' as const,
    },

    // Authentication
    AUTH: {
        COOKIE_NAME: 'auth_token',
        TOKEN_EXPIRY_SECONDS: 60 * 60 * 24, // 24 hours
    },
} as const;

// Type helpers
export type SystemProjectId = typeof CONSTANTS.PROJECTS.SYSTEM_ID;
export type ProjectId = number | SystemProjectId;
