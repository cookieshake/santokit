
import { z } from 'zod'

// Valid field types for our system
const FieldTypeEnum = z.enum(['text', 'integer', 'boolean'])

export const RegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
})

export const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
})

// CreateDataSourceSchema removed
export const CreateDatabaseSchema = z.object({
    name: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/, "Alphanumeric and underscores only"),
    connectionString: z.string().url(),
    prefix: z.string().default('santoki_'),
})

export const CreateProjectSchema = z.object({
    name: z.string().min(1),
})

export const CreateUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    role: z.string().default('user'),
})


export const CreateCollectionSchema = z.object({
    name: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/, "Alphanumeric and underscores only"),
    idType: z.enum(['serial', 'uuid', 'typeid']).default('serial'),
    type: z.enum(['base', 'auth']).default('base'),
})

export const AddFieldSchema = z.object({
    name: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/),
    type: FieldTypeEnum,
    isNullable: z.boolean().optional(),
})

export const RenameFieldSchema = z.object({
    newName: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/),
})

export const CreateIndexSchema = z.object({
    indexName: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/),
    fields: z.array(z.string().min(1)).min(1),
    unique: z.boolean().optional(),
})

// For dynamic data insert, we can't fully strict type the body structure 
// without knowing the table schema dynamically, but we can enforce it's an object.
export const DynamicDataInsertSchema = z.record(z.string(), z.any())
