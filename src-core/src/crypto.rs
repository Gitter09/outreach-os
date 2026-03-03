use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Context, Result};
use base64::prelude::*;
use rand::RngCore;

const KEYRING_SERVICE: &str = "com.outreachos.app";
const KEYRING_USER: &str = "encryption-key";
const KEYRING_DB_KEY_USER: &str = "db-encryption-key";
const NONCE_SIZE: usize = 12; // AES-GCM standard nonce size

/// Retrieves (or creates) a 256-bit database encryption key from the OS keychain.
/// Stored as a 64-char lowercase hex string for use with SQLCipher PRAGMA key.
pub fn get_or_create_db_key() -> Result<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_DB_KEY_USER)
        .context("Failed to create keyring entry for DB key")?;

    match entry.get_password() {
        Ok(hex_key) if hex_key.len() == 64 => Ok(hex_key),
        _ => {
            // Generate a new 256-bit random key
            let mut key_bytes = [0u8; 32];
            OsRng.fill_bytes(&mut key_bytes);
            let hex_key = hex::encode(key_bytes);
            entry
                .set_password(&hex_key)
                .context("Failed to store DB encryption key in OS keychain")?;
            Ok(hex_key)
        }
    }
}

/// Retrieves the 256-bit encryption key from the OS keychain.
/// If no key exists, generates a cryptographically random one and stores it.
fn get_or_create_key() -> Result<[u8; 32]> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .context("Failed to create keyring entry")?;

    // Try to retrieve existing key
    match entry.get_password() {
        Ok(stored) => {
            let decoded = BASE64_STANDARD
                .decode(stored.as_bytes())
                .context("Failed to decode encryption key from keychain")?;
            if decoded.len() != 32 {
                return Err(anyhow!(
                    "Stored encryption key has invalid length: {}",
                    decoded.len()
                ));
            }
            let mut key = [0u8; 32];
            key.copy_from_slice(&decoded);
            Ok(key)
        }
        Err(_) => {
            // Generate a new random key
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);

            // Store in keychain as base64
            let encoded = BASE64_STANDARD.encode(key);
            entry
                .set_password(&encoded)
                .context("Failed to store encryption key in OS keychain")?;

            Ok(key)
        }
    }
}

/// Encrypts with an explicit 32-byte key (used internally and in tests).
fn encrypt_with_key(plaintext: &str, key_bytes: &[u8; 32]) -> Result<String> {
    let cipher = Aes256Gcm::new_from_slice(key_bytes)
        .map_err(|e| anyhow!("Failed to create cipher: {}", e))?;

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;

    let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(BASE64_STANDARD.encode(combined))
}

/// Decrypts with an explicit 32-byte key (used internally and in tests).
fn decrypt_with_key(encrypted: &str, key_bytes: &[u8; 32]) -> Result<String> {
    let cipher = Aes256Gcm::new_from_slice(key_bytes)
        .map_err(|e| anyhow!("Failed to create cipher: {}", e))?;

    let combined = BASE64_STANDARD
        .decode(encrypted.as_bytes())
        .context("Failed to decode encrypted token")?;

    if combined.len() < NONCE_SIZE {
        return Err(anyhow!(
            "Encrypted data too short (got {} bytes, need at least {})",
            combined.len(),
            NONCE_SIZE
        ));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).context("Decrypted data is not valid UTF-8")
}

/// Encrypts a plaintext string using AES-256-GCM.
/// Returns a base64-encoded string containing `nonce || ciphertext`.
pub fn encrypt(plaintext: &str) -> Result<String> {
    let key_bytes = get_or_create_key()?;
    encrypt_with_key(plaintext, &key_bytes)
}

/// Decrypts a base64-encoded `nonce || ciphertext` string.
/// Returns the original plaintext.
pub fn decrypt(encrypted: &str) -> Result<String> {
    let key_bytes = get_or_create_key()?;
    decrypt_with_key(encrypted, &key_bytes)
}

/// Attempts to decrypt a value, but if it fails (e.g., the value was stored
/// before encryption was enabled), returns the original value unchanged.
/// This provides backward compatibility during the migration period.
pub fn decrypt_or_passthrough(value: &str) -> String {
    match decrypt(value) {
        Ok(decrypted) => decrypted,
        Err(_) => value.to_string(), // Assume it's a legacy plaintext token
    }
}

// ============================
// Keychain Credential Helpers
// ============================

/// Stores an OAuth app credential (client_id or client_secret) in the OS keychain.
/// Uses a service scoped to provider + field, e.g. "com.outreachos.gmail.client_id".
pub fn store_credential(provider: &str, field: &str, value: &str) -> Result<()> {
    let service = format!("{}.{}", KEYRING_SERVICE, provider);
    let entry = keyring::Entry::new(&service, field)
        .context("Failed to create keyring entry for credential")?;
    entry
        .set_password(value)
        .context("Failed to store credential in OS keychain")?;
    Ok(())
}

/// Retrieves an OAuth app credential from the OS keychain.
pub fn get_credential(provider: &str, field: &str) -> Result<String> {
    let service = format!("{}.{}", KEYRING_SERVICE, provider);
    let entry = keyring::Entry::new(&service, field)
        .context("Failed to create keyring entry for credential")?;
    entry.get_password().map_err(|_| {
        anyhow!(
            "Credential '{}' not found for provider '{}'",
            field,
            provider
        )
    })
}

/// Checks whether OAuth app credentials exist in the keychain for a given provider.
pub fn has_credentials(provider: &str) -> bool {
    get_credential(provider, "client_id").is_ok()
        && get_credential(provider, "client_secret").is_ok()
}

/// Stores a named secret (e.g. tracking_secret) in the OS keychain.
pub fn store_secret(name: &str, value: &str) -> Result<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, name)
        .context("Failed to create keyring entry for secret")?;
    entry
        .set_password(value)
        .context("Failed to store secret in OS keychain")?;
    Ok(())
}

/// Retrieves a named secret from the OS keychain.
pub fn get_secret(name: &str) -> Result<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, name)
        .context("Failed to create keyring entry for secret")?;
    entry
        .get_password()
        .map_err(|_| anyhow!("Secret '{}' not found in keychain", name))
}

// ===== App Lock Screen PIN Logic =====

/// Hashes a PIN with a salt using PBKDF2-HMAC-SHA256.
pub fn hash_pin(pin: &str, salt: &[u8]) -> String {
    use pbkdf2::pbkdf2_hmac;
    use sha2::Sha256;

    let mut hash = [0u8; 32];
    // Use 100,000 iterations for stronger stretching
    pbkdf2_hmac::<Sha256>(pin.as_bytes(), salt, 100_000, &mut hash);
    hex::encode(hash)
}

/// Creates a "salt:hash" formatted string for a new PIN.
pub fn create_pin_data(pin: &str) -> String {
    // Generate a random 16-byte salt
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let salt_hex = hex::encode(salt);

    let hash = hash_pin(pin, &salt);
    format!("{}:{}", salt_hex, hash)
}

/// Verifies a PIN against a stored "salt:hash" formatted string.
pub fn verify_pin_against_hash(pin: &str, stored_hash: &str) -> bool {
    let parts: Vec<&str> = stored_hash.splitn(2, ':').collect();
    if parts.len() != 2 {
        tracing::error!("Corrupted PIN data format");
        return false;
    }

    match hex::decode(parts[0]) {
        Ok(salt) => {
            let expected_hash = parts[1];
            let actual_hash = hash_pin(pin, &salt);
            actual_hash == expected_hash
        }
        Err(_) => {
            tracing::error!("Invalid salt format in PIN data");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        // Use a fixed test key to avoid depending on the OS keyring
        let test_key = [42u8; 32];
        let original = "test_token_12345";
        let encrypted = encrypt_with_key(original, &test_key).expect("encryption failed");
        assert_ne!(encrypted, original);
        let decrypted = decrypt_with_key(&encrypted, &test_key).expect("decryption failed");
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_decrypt_or_passthrough_with_plaintext() {
        let legacy_token = "ya29.a0AVvZVsoQFtest_plaintext_token";
        let result = decrypt_or_passthrough(legacy_token);
        assert_eq!(result, legacy_token);
    }

    #[test]
    fn test_different_encryptions_produce_different_ciphertext() {
        // Use a fixed test key to avoid depending on the OS keyring
        let test_key = [42u8; 32];
        let original = "test_token";
        let enc1 = encrypt_with_key(original, &test_key).expect("encryption failed");
        let enc2 = encrypt_with_key(original, &test_key).expect("encryption failed");
        // Different nonces → different ciphertext
        assert_ne!(enc1, enc2);
        // Both decrypt to the same value
        assert_eq!(decrypt_with_key(&enc1, &test_key).unwrap(), original);
        assert_eq!(decrypt_with_key(&enc2, &test_key).unwrap(), original);
    }

    #[test]
    fn test_hash_pin_deterministic() {
        let salt = [1u8; 16];
        let hash1 = hash_pin("1234", &salt);
        let hash2 = hash_pin("1234", &salt);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_pin_different_pins() {
        let salt = [1u8; 16];
        let hash1 = hash_pin("1234", &salt);
        let hash2 = hash_pin("5678", &salt);
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_hash_pin_different_salts() {
        let salt1 = [1u8; 16];
        let salt2 = [2u8; 16];
        let hash1 = hash_pin("1234", &salt1);
        let hash2 = hash_pin("1234", &salt2);
        assert_ne!(hash1, hash2);
    }
}
