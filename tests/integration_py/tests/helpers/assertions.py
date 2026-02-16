def assert_error(response, status: int, code: str | None = None) -> dict:
    assert response.status_code == status
    body = response.json()
    assert "error" in body
    assert isinstance(body["error"], dict)
    assert "message" in body["error"]
    assert "requestId" in body["error"]
    if code is not None:
        assert body["error"].get("code") == code
    return body


def assert_rows(response) -> list:
    body = response.json()
    data = body.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        rows = data.get("data")
        if isinstance(rows, list):
            return rows
    raise AssertionError(f"response does not contain row array: {body}")


def assert_affected(response, expected: int | None = None) -> int:
    body = response.json()
    data = body.get("data")
    assert isinstance(data, dict), f"data must be object, got: {body}"
    assert "affected" in data, f"missing affected field: {body}"
    value = data["affected"]
    assert isinstance(value, int), f"affected must be int, got: {body}"
    if expected is not None:
        assert value == expected, f"expected affected={expected}, got {value}"
    return value


def assert_insert_row(response) -> dict:
    body = response.json()
    assert "data" in body
    row = body["data"]
    assert isinstance(row, dict), f"insert response must be object, got: {body}"
    assert "id" in row, f"insert response must include id, got: {body}"
    assert "ids" not in row, f"legacy field ids must not exist, got: {body}"
    assert "generated_id" not in row, (
        f"legacy field generated_id must not exist, got: {body}"
    )
    return row
