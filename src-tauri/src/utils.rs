use crate::error::AppError;

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), AppError> {
    open::that(url).map_err(|e| e.to_string())?;
    Ok(())
}
