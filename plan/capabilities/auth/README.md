# Auth Capability Guide

이 문서는 기존 auth flow 서사를 capability 기준으로 정리한 가이드다.

## Hub Issuer Login

- signup/login으로 access token 발급 후 Bridge 호출
- Capability: `AUTH-001`

## OIDC Provider Setup

- 외부 OIDC provider 설정 및 로그인 시작 조건
- Capability: `AUTH-002`

## Multi-Project Isolation

- project/env 컨텍스트 격리
- Capability: `AUTH-003`

## Explicit OIDC Linking

- 자동 링크 없이 명시적 identity 연결
- Capability: `AUTH-004`
