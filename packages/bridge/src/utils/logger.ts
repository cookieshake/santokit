/**
 * Structured logging utility for Santokit
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export interface LogContext {
    requestId?: string;
    userId?: string;
    projectId?: string;
    path?: string;
    [key: string]: unknown;
}

export class Logger {
    private level: LogLevel;
    private context: LogContext;

    constructor(level: LogLevel = LogLevel.INFO, context: LogContext = {}) {
        this.level = level;
        this.context = context;
    }

    /**
     * Create a child logger with additional context
     */
    child(context: LogContext): Logger {
        return new Logger(this.level, { ...this.context, ...context });
    }

    /**
     * Set log level
     */
    setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * Debug log
     */
    debug(message: string, meta?: Record<string, unknown>): void {
        if (this.level <= LogLevel.DEBUG) {
            this.log('DEBUG', message, meta);
        }
    }

    /**
     * Info log
     */
    info(message: string, meta?: Record<string, unknown>): void {
        if (this.level <= LogLevel.INFO) {
            this.log('INFO', message, meta);
        }
    }

    /**
     * Warning log
     */
    warn(message: string, meta?: Record<string, unknown>): void {
        if (this.level <= LogLevel.WARN) {
            this.log('WARN', message, meta);
        }
    }

    /**
     * Error log
     */
    error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
        if (this.level <= LogLevel.ERROR) {
            const errorMeta = error instanceof Error
                ? {
                    error: error.message,
                    stack: error.stack,
                    name: error.name,
                }
                : { error: String(error) };

            this.log('ERROR', message, { ...errorMeta, ...meta });
        }
    }

    /**
     * Internal log method
     */
    private log(level: string, message: string, meta?: Record<string, unknown>): void {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...this.context,
            ...meta,
        };

        // In production, this could send to a logging service
        // For now, we use console with structured JSON
        const logString = JSON.stringify(logEntry);

        switch (level) {
            case 'DEBUG':
            case 'INFO':
                console.log(logString);
                break;
            case 'WARN':
                console.warn(logString);
                break;
            case 'ERROR':
                console.error(logString);
                break;
        }
    }
}

/**
 * Global logger instance
 */
export const logger = new Logger(
    process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO
);

/**
 * Custom error classes
 */
export class SantokitError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'SantokitError';
    }
}

export class ValidationError extends SantokitError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'VALIDATION_ERROR', 400, details);
        this.name = 'ValidationError';
    }
}

export class AuthenticationError extends SantokitError {
    constructor(message: string = 'Authentication required') {
        super(message, 'AUTHENTICATION_ERROR', 401);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends SantokitError {
    constructor(message: string = 'Forbidden') {
        super(message, 'AUTHORIZATION_ERROR', 403);
        this.name = 'AuthorizationError';
    }
}

export class NotFoundError extends SantokitError {
    constructor(resource: string) {
        super(`${resource} not found`, 'NOT_FOUND', 404);
        this.name = 'NotFoundError';
    }
}

export class RateLimitError extends SantokitError {
    constructor(message: string = 'Rate limit exceeded') {
        super(message, 'RATE_LIMIT', 429);
        this.name = 'RateLimitError';
    }
}

/**
 * Error response formatter
 */
export function formatErrorResponse(error: unknown, requestId?: string): {
    status: number;
    body: string;
} {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: Record<string, unknown> | undefined;

    if (error instanceof SantokitError) {
        status = error.statusCode;
        code = error.code;
        message = error.message;
        details = error.details;
    } else if (error instanceof Error) {
        message = error.message;
    }

    const body = JSON.stringify({
        error: {
            code,
            message,
            ...(details && { details }),
            ...(requestId && { requestId }),
        },
    });

    return { status, body };
}
