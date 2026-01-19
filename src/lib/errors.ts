export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  VALUE_TOO_LONG: '22001',
  DUPLICATE_TABLE: '42P07',
  UNDEFINED_COLUMN: '42703',
} as const

export const APP_ERROR_CODES = {
  UNIQUE_VIOLATION: 'UNIQUE_VIOLATION',
  FOREIGN_KEY_VIOLATION: 'FOREIGN_KEY_VIOLATION',
  NOT_NULL_VIOLATION: 'NOT_NULL_VIOLATION',
  VALUE_TOO_LONG: 'VALUE_TOO_LONG',
  DUPLICATE_TABLE: 'DUPLICATE_TABLE',
  UNDEFINED_COLUMN: 'UNDEFINED_COLUMN',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const

export class AppError extends Error {
  constructor(
    public message: string,
    public status: number = 500,
    public code?: string,
    public details?: any,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const handleDbError = (e: any): AppError => {
  // Check for common Postgres error codes
  if (e.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
    const detail = e.detail || ''
    const match = detail.match(/\((.*)\)=\((.*)\)/)
    if (match) {
      return new AppError(
        `A record with this ${match[1]} already exists.`,
        409,
        APP_ERROR_CODES.UNIQUE_VIOLATION,
      )
    }
    return new AppError(
      'A record with this value already exists.',
      409,
      APP_ERROR_CODES.UNIQUE_VIOLATION,
    )
  }

  if (e.code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return new AppError(
      'This operation violates a relationship constraint.',
      400,
      APP_ERROR_CODES.FOREIGN_KEY_VIOLATION,
    )
  }

  if (e.code === PG_ERROR_CODES.NOT_NULL_VIOLATION) {
    return new AppError(
      `Field '${e.column}' cannot be empty.`,
      400,
      APP_ERROR_CODES.NOT_NULL_VIOLATION,
    )
  }

  if (e.code === PG_ERROR_CODES.VALUE_TOO_LONG) {
    return new AppError('Value is too long for this field.', 400, APP_ERROR_CODES.VALUE_TOO_LONG)
  }

  if (e.code === PG_ERROR_CODES.DUPLICATE_TABLE) {
    return new AppError(
      'A table or index with this name already exists.',
      400,
      APP_ERROR_CODES.DUPLICATE_TABLE,
    )
  }

  if (e.code === PG_ERROR_CODES.UNDEFINED_COLUMN) {
    return new AppError('One or more columns do not exist.', 400, APP_ERROR_CODES.UNDEFINED_COLUMN)
  }

  // Handle generic driver errors
  const message = e.message || String(e)

  if (message.includes('unique constraint')) {
    return new AppError(
      'A record with this value already exists.',
      409,
      APP_ERROR_CODES.UNIQUE_VIOLATION,
    )
  }

  if (message.includes('already exists')) {
    return new AppError(message, 400, APP_ERROR_CODES.ALREADY_EXISTS)
  }

  return new AppError(message, 500, APP_ERROR_CODES.DATABASE_ERROR)
}
