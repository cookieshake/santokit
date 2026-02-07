# Flow 10: Advanced CRUD & Safety

This flow verifies advanced CRUD operations and safety mechanisms that are not covered in the basic `05-enduser-call-crud` flow.

## Goal

Ensure that `update` and `delete` operations function correctly and that critical safety checks (like preventing operations without `where` clauses) are enforced.

## Actors

- **Operator**: Sets up the project and schema.
- **End User (Client)**: Performs CRUD operations via the Bridge.

## Steps

1.  **Setup**:
    - Operator creates a project and environment (`dev`).
    - Operator applies the `users` schema.
    - Operator creates an API Key with `admin` role.

2.  **Insert (Setup)**:
    - Client inserts a user record to act on.

3.  **Update**:
    - **Success Case**: Client updates the user's name using a specific `where` clause (ID).
    - **Verify**: Select the user to confirm the name change.
    - **Safety Check 1 (Empty Where)**: Client attempts to update with an empty `where` clause `{}`.
        - **Expectation**: Request fails (400 Bad Request). Bridge must refuse to update all rows.
    - **Safety Check 2 (Invalid Column)**: Client attempts to update a non-existent column.
        - **Expectation**: Request fails.

4.  **Delete**:
    - **Safety Check (Empty Where)**: Client attempts to delete with an empty `where` clause `{}`.
        - **Expectation**: Request fails (400 Bad Request). Bridge must refuse to delete all rows.
    - **Success Case**: Client deletes the user using a specific `where` clause (ID).
    - **Verify**: Select the user to confirm it no longer returns data.
