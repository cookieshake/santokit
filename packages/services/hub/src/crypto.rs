use base64::{engine::general_purpose, Engine as _};
use chacha20poly1305::{aead::Aead, aead::KeyInit, ChaCha20Poly1305, Key, Nonce};
use rand::RngCore;

pub fn parse_key_material(raw: &str) -> Option<[u8; 32]> {
    let trimmed = raw.trim();

    if trimmed.len() == 64 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        let bytes = decode_hex(trimmed)?;
        return bytes.as_slice().try_into().ok();
    }

    if let Ok(bytes) = general_purpose::URL_SAFE_NO_PAD.decode(trimmed) {
        if bytes.len() == 32 {
            return bytes.as_slice().try_into().ok();
        }
    }

    if let Ok(bytes) = general_purpose::STANDARD.decode(trimmed) {
        if bytes.len() == 32 {
            return bytes.as_slice().try_into().ok();
        }
    }

    let raw_bytes = trimmed.as_bytes();
    if raw_bytes.len() == 32 {
        return raw_bytes.try_into().ok();
    }

    None
}

pub fn encrypt_string(key: &[u8; 32], plaintext: &str) -> anyhow::Result<String> {
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| anyhow::anyhow!("encryption failed"))?;

    let mut payload = Vec::with_capacity(12 + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);

    Ok(general_purpose::URL_SAFE_NO_PAD.encode(payload))
}

pub fn decrypt_string(key: &[u8; 32], encoded: &str) -> anyhow::Result<String> {
    let payload = general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| anyhow::anyhow!("invalid ciphertext"))?;

    if payload.len() < 13 {
        return Err(anyhow::anyhow!("invalid ciphertext"));
    }

    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| anyhow::anyhow!("decryption failed"))?;

    Ok(String::from_utf8(plaintext)?)
}

fn decode_hex(input: &str) -> Option<Vec<u8>> {
    if input.len() % 2 != 0 {
        return None;
    }

    let mut bytes = Vec::with_capacity(input.len() / 2);
    let mut chars = input.chars();
    while let (Some(h), Some(l)) = (chars.next(), chars.next()) {
        let hi = h.to_digit(16)?;
        let lo = l.to_digit(16)?;
        bytes.push(((hi << 4) | lo) as u8);
    }
    Some(bytes)
}
