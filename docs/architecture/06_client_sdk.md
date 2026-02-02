# 06. Client SDK 명세 (Spec)

## 존재 의의
Client SDK는 애플리케이션에서 Santokit 로직을 **타입 안전하게 호출**하기 위한 인터페이스다.

## 핵심 행동
- `stk.logic.<ns>.<fn>()` 호출을 `/call` API로 변환
- `stk sync`로 생성된 타입 보강 적용
- 인증 API 래핑

## 상태 표기
- ✅ 구현됨
- 🟡 부분 구현
- ❌ 미구현

## 로직 호출
- **존재 의의**: 직접 HTTP 호출 없이 함수 호출 느낌 제공
- **행동**: Proxy 기반 네임스페이스 구성
- **동작**: `{ path, params }` 형태로 `/call` 호출
- **상태**: ✅

## 타입 생성
- **존재 의의**: IntelliSense/타입 안정성 제공
- **행동**: `stk sync`가 타입 정의 파일 생성
- **동작**: `codegen.output` 경로에 `santokit-env.d.ts` 생성
- **상태**: ✅

## Auth API

### `auth.login(credentials)`
- **존재 의의**: 이메일/패스워드 로그인
- **행동**: `POST /auth/login`
- **동작**: 토큰 저장
- **상태**: ✅ (Hub는 단순 토큰 발급)

### `auth.register(data)`
- **존재 의의**: 회원가입
- **행동**: `POST /auth/register`
- **동작**: 토큰 저장
- **상태**: ✅ (Hub 저장소 미연결)

### `auth.refreshToken()`
- **존재 의의**: 토큰 재발급
- **행동**: `POST /auth/refresh`
- **동작**: 새 토큰 저장
- **상태**: ✅

### `auth.logout()`
- **존재 의의**: 세션 종료
- **행동**: `POST /auth/logout`
- **동작**: 토큰 제거
- **상태**: ✅ (토큰 무효화는 없음)

### `auth.me()`
- **존재 의의**: 현재 사용자 정보 확인
- **행동**: `GET /auth/me`
- **동작**: 토큰으로 사용자 정보 반환
- **상태**: ✅

### `auth.loginWithOAuth()`
- **존재 의의**: 소셜 로그인
- **행동**: `/auth/oauth`로 리다이렉트
- **상태**: ❌ (Hub OAuth 미구현)

