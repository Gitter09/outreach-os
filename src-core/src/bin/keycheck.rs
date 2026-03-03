use keyring::{default, Entry};
use outreach_core::crypto;

fn main() {
    println!("--- Keyring Verification Tool ---");

    let service = "com.outreachos.app";
    let db_user = "db-encryption-key";
    let test_user = "diagnostic-test-key";

    // Test Persistence
    println!("\nTesting Persistence: {}", test_user);
    match Entry::new(service, test_user) {
        Ok(entry) => match entry.get_password() {
            Ok(val) => {
                println!(
                    "✅ EXISTING key found! Value matches: {}",
                    val == "persistent-secret-999"
                );
                println!("Value: {}", val);
            }
            Err(_) => {
                println!("ℹ️ No existing key found. Setting it now...");
                let test_val = "persistent-secret-999";
                match entry.set_password(test_val) {
                    Ok(_) => {
                        println!("✅ SET successful. Run this tool again to verify persistence.")
                    }
                    Err(e) => println!("❌ SET failed: {}", e),
                }
            }
        },
        Err(e) => println!("❌ Failed to create diagnostic entry: {}", e),
    }

    // Call actual implementation
    println!("\nCalling outreach_core::crypto::get_or_create_db_key()...");
    match crypto::get_or_create_db_key() {
        Ok(key) => println!(
            "✅ Function returned key: {}... (len: {})",
            &key[..8],
            key.len()
        ),
        Err(e) => println!("❌ Function returned error: {}", e),
    }

    // Double check with direct entry
    println!("\nDouble checking db-encryption-key directly...");
    match Entry::new(service, db_user) {
        Ok(entry) => match entry.get_password() {
            Ok(pw) => println!("✅ Found via direct GET! Length: {} characters", pw.len()),
            Err(e) => println!("❌ Still not found via direct GET: {}", e),
        },
        Err(e) => println!("❌ Failed to create entry for final check: {}", e),
    }
}
