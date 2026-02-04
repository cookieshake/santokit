# Context

## Problem
멀티 팀 환경에서 “BYO DB”를 쓰면서도, 각 팀이 DB를 직접 노출하지 않고도:
- 스키마 기반으로 기본 CRUD API를 제공하고
- 권한/환경(dev/stg/prod) 분리를 강제하며
- 릴리즈/롤백/감사 로그를 중앙에서 관리하는
플랫폼이 필요하다.

## Approach
- Hub(Control Plane): org/team/project/env, connections(secrets), 선언 스키마(YAML), schema snapshot(드리프트 감지), permissions, releases, audit log 관리
- Bridge(Data Plane): `/call` 단일 엔드포인트로 CRUD 실행(허용된 연산만), Hub 설정을 pull/캐시
- CLI(`stk`): 웹 콘솔 없이 Operator가 모든 운영을 수행하는 인터페이스

## Actors
- Operator: Hub를 운영/관리하는 팀 멤버(사람)
- End User: Bridge의 API를 호출하는 앱 최종 사용자(사람)

## Non-goals
- DB 프로비저닝/호스팅(=BYO DB 유지)
- 애플리케이션 비즈니스 로직 런타임(수동 SQL/코드 실행)은 최종 스펙 범위 밖으로 둔다
