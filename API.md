# Santoki API Documentation

This document describes the API endpoints for the Santoki system. The system is split into two main applications: **Admin API** for platform management and **Client API** for project-specific data access.

---

## Admin API

Managed platform-wide entities like projects, data sources, and system administrators.

**Base URL**: `/admin/v1`

### Authentication
Authentication is handled via `better-auth`.
- **Endpoint**: `/auth/*`
- **Method**: `GET`, `POST`
- Protected routes require a valid session with the `admin` role.

### Data Sources
Manage physical database connections.

#### List Data Sources
- **URL**: `/sources`
- **Method**: `GET`
- **Response**: Array of Data Source objects.

#### Create Data Source
- **URL**: `/sources`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "name": "string",
    "connectionString": "string (url)",
    "prefix": "string (default: santoki_)"
  }
  ```

### Projects
Manage logical projects within Santoki.

#### List Projects
- **URL**: `/projects`
- **Method**: `GET`

#### Create Project
- **URL**: `/projects`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "name": "string",
    "ownerId": "string"
  }
  ```

#### Associate Data Source
Link a project to a physical data source.
- **URL**: `/projects/:projectId/associate-datasource`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "dataSourceId": "number"
  }
  ```

### Collections (Admin)
Manage tables/collections within a project.

#### List Collections
- **URL**: `/projects/:projectId/collections`
- **Method**: `GET`

#### Create Collection
- **URL**: `/projects/:projectId/collections`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "name": "string (alphanumeric & underscore)",
    "dataSourceId": "number"
  }
  ```

#### Get Collection Details
- **URL**: `/projects/:projectId/collections/:collectionName`
- **Method**: `GET`

#### Add Field
- **URL**: `/projects/:projectId/collections/:collectionName/fields`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "name": "string",
    "type": "text | integer | boolean",
    "isNullable": "boolean (optional)"
  }
  ```

#### Rename Field
- **URL**: `/projects/:projectId/collections/:collectionName/fields/:fieldName`
- **Method**: `PUT`
- **Body**:
  ```json
  {
    "newName": "string"
  }
  ```

#### Delete Field
- **URL**: `/projects/:projectId/collections/:collectionName/fields/:fieldName`
- **Method**: `DELETE`

#### Create Index
- **URL**: `/projects/:projectId/collections/:collectionName/indexes`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "indexName": "string",
    "fields": ["string"],
    "unique": "boolean (optional)"
  }
  ```

#### Delete Index
- **URL**: `/projects/:projectId/collections/:collectionName/indexes/:indexName`
- **Method**: `DELETE`

### Users (Project Admins/Users)
Manage users within a specific project.

#### List Users
- **URL**: `/projects/:projectId/users`
- **Method**: `GET`

#### Create User
- **URL**: `/projects/:projectId/users`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "email": "string",
    "password": "string (min 6)",
    "role": "string (default: user)"
  }
  ```

#### Delete User
- **URL**: `/projects/:projectId/users/:userId`
- **Method**: `DELETE`

### Admin Management
#### List Admins
- **URL**: `/admins`
- **Method**: `GET`
- **Description**: Returns all users with the `admin` role in the system.

---

## Client API

Used by applications to interact with project data and authenticate project users.

**Base URL**: `/client/v1`

### Authentication (Project-specific)
- **URL**: `/auth/:projectId/*`
- **Method**: `GET`, `POST`
- **Description**: Uses `better-auth` scoped to the project's data source.

### Data Interaction
Read and write data to project collections.

#### List Data
- **URL**: `/data/:projectId/:collectionName`
- **Method**: `GET`
- **Description**: Fetches all records from the specified collection.

#### Insert Data
- **URL**: `/data/:projectId/:collectionName`
- **Method**: `POST`
- **Body**: `JSON object` mapping field names to values.
- **Description**: Inserts a new record into the collection.
