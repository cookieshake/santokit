//! Bridge 미들웨어
//!
//! 인증, 로깅, Rate Limiting 등의 미들웨어를 정의합니다.

use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct RequestId(#[allow(dead_code)] pub String);

pub async fn request_id(mut req: Request, next: Next) -> Response {
    let id = Uuid::new_v4().to_string();
    req.extensions_mut().insert(RequestId(id.clone()));
    let mut resp = next.run(req).await;
    if let Ok(value) = HeaderValue::from_str(&id) {
        resp.headers_mut().insert("x-request-id", value);
    }
    resp
}
