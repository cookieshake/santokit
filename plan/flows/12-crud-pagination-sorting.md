# Flow 12: CRUD Pagination & Sorting

This flow verifies the pagination and sorting capabilities of the `select` operation, including `orderBy`, `limit`, and `offset`.

## Goal

Ensure that clients can sort results by specific columns (ascending/descending) and retrieve data in pages using limit/offset.

## Actors

- **Operator**: Sets up the project and schema.
- **End User (Client)**: Performs `select` operations with sorting and pagination parameters.

## Steps

1.  **Setup**:
    - Operator creates a project and environment.
    - Operator applies a schema (using `basic` fixture or similar with a `users` table).
    - Operator creates an API Key.

2.  **Insert Data**:
    - Client inserts multiple users (e.g., 5 users) with distinct fields (e.g., name A, B, C, D, E) to ensure deterministic sorting.

3.  **Sort Ascending**:
    - Client performs `select` with `orderBy: { name: "asc" }`.
    - **Verify**: Results are returned in A -> E order.

4.  **Sort Descending**:
    - Client performs `select` with `orderBy: { name: "desc" }`.
    - **Verify**: Results are returned in E -> A order.

5.  **Limit**:
    - Client performs `select` with `limit: 2` (default order or sorted).
    - **Verify**: Exactly 2 results are returned.

6.  **Offset**:
    - Client performs `select` with `orderBy: { name: "asc" }, limit: 2, offset: 2`.
    - **Verify**: Returns users C and D (skipping A and B).

7.  **Pagination (Limit + Offset)**:
    - Iterate through pages using limit/offset to retrieve all records.
