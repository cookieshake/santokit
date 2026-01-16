---
trigger: always_on
---

- 코드 변경 후에는 npm run build를 통해 프로젝트가 잘 빌드되는지 확인한다.
- project_id의 경우 header를 통해 제공받고, 나머지는 url을 통해 제공받는다.
- header 이름 처럼 공통적으로 관리되어야 하는 변수의 경우 constants.ts에 저장한 값을 사용하고, 하드코딩 하지 않는다.
- postgresql을 포함한 DB에 연결될 가능성을 고려하여 코드를 작성한다.
- 되도록이면 간결하게 작성한다.