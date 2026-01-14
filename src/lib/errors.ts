export class AppError extends Error {
    constructor(
        public message: string,
        public status: number = 500,
        public code?: string,
        public details?: any
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export const handleDbError = (e: any): AppError => {
    // Check for common Postgres error codes
    if (e.code === '23505') {
        const detail = e.detail || '';
        const match = detail.match(/\((.*)\)=\((.*)\)/);
        if (match) {
            return new AppError(`A record with this ${match[1]} already exists.`, 409, 'UNIQUE_VIOLATION');
        }
        return new AppError('A record with this value already exists.', 409, 'UNIQUE_VIOLATION');
    }

    if (e.code === '23503') {
        return new AppError('This operation violates a relationship constraint.', 400, 'FOREIGN_KEY_VIOLATION');
    }

    if (e.code === '23502') {
        return new AppError(`Field '${e.column}' cannot be empty.`, 400, 'NOT_NULL_VIOLATION');
    }

    if (e.code === '22001') {
        return new AppError('Value is too long for this field.', 400, 'VALUE_TOO_LONG');
    }

    if (e.code === '42P07') {
        return new AppError('A table or index with this name already exists.', 400, 'DUPLICATE_TABLE');
    }

    if (e.code === '42703') {
        return new AppError('One or more columns do not exist.', 400, 'UNDEFINED_COLUMN');
    }

    // Handle generic Drizzle/Driver errors
    const message = e.message || String(e);

    if (message.includes('unique constraint')) {
        return new AppError('A record with this value already exists.', 409, 'UNIQUE_VIOLATION');
    }

    if (message.includes('already exists')) {
        return new AppError(message, 400, 'ALREADY_EXISTS');
    }

    return new AppError(message, 500, 'DATABASE_ERROR');
};
