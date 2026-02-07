# Flow 11: CRUD Expand (Foreign Key Join)

This flow verifies the `expand` capability in CRUD `select` operations, allowing clients to fetch related records in a single request based on foreign key relationships defined in the schema.

## Goal

Ensure that `select` operations can include nested objects for foreign key relationships when requested via the `expand` parameter.

## Actors

- **Operator**: Sets up the project and schema with relationships.
- **End User (Client)**: Performs `select` with `expand`.

## Steps

1.  **Setup**:
    - Operator creates a project and environment.
    - Operator applies a schema with `users` and `posts` tables.
        - `posts` has a foreign key `user_id` referring to `users.id`.
        - The reference defines `as: user` for the relationship name.
    - Operator creates an API Key.

2.  **Insert Data**:
    - Client inserts a user (User A).
    - Client inserts a post (Post 1) belonging to User A (`user_id` = User A's ID).

3.  **Select with Expand**:
    - Client performs a `select` on `posts` with `expand: ["user"]`.
    - **Verify**: The response includes the post fields *and* a `user` field containing User A's details (e.g., email).

4.  **Select without Expand (Control)**:
    - Client performs a `select` on `posts` *without* `expand`.
    - **Verify**: The response includes `user_id` but *not* the `user` object.

5.  **Invalid Expand (Safety Check)**:
    - Client requests an invalid relation name in `expand`.
    - **Verify**: The request fails (400 Bad Request).
