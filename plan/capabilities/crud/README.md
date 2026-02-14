# CRUD Capability Guide

이 문서는 기존 CRUD flow 서사를 capability 기준으로 정리한 가이드다.

## Basic CRUD

- insert/select 기본 계약
- Capability: `CRUD-001`

## Advanced Update/Delete

- 안전장치 포함 update/delete
- Capability: `CRUD-002`

## Expand

- FK relation expand 조회
- Capability: `CRUD-003`

## Pagination/Sorting

- `orderBy`, `limit`, `offset`
- Capability: `CRUD-004`

## Array Validation

- array 컬럼 item 타입 검증
- Capability: `CRUD-005`
