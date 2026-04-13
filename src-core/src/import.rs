use anyhow::{anyhow, Result};
use calamine::{open_workbook, Reader, Xls, Xlsx};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub headers: Vec<String>,
    pub total_rows: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMapping {
    pub first_name: Option<usize>,
    pub last_name: Option<usize>,
    pub email: Option<usize>,
    pub linkedin_url: Option<usize>,
    pub company: Option<usize>,
    pub title: Option<usize>,
    pub location: Option<usize>,
    pub company_website: Option<usize>,
    #[serde(default)]
    pub intelligence_summary: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedContact {
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub linkedin_url: Option<String>,
    pub company: Option<String>,
    pub title: Option<String>,
    pub location: Option<String>,
    pub company_website: Option<String>,
    pub intelligence_summary: Option<String>,
}

/// Reads a file and returns a preview (headers + sample rows)
pub fn preview_file(path: &str) -> Result<ImportPreview> {
    let path = Path::new(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "csv" => preview_csv(path),
        "xlsx" => preview_xlsx(path),
        "xls" => preview_xls(path),
        _ => Err(anyhow!(
            "Unsupported file format: {}. Use .csv, .xlsx, or .xls",
            ext
        )),
    }
}

fn preview_csv(path: &Path) -> Result<ImportPreview> {
    let mut reader = csv::Reader::from_path(path)?;

    let headers: Vec<String> = reader.headers()?.iter().map(|h| h.to_string()).collect();

    let mut total_rows = 0;
    for result in reader.records() {
        let _ = result?;
        total_rows += 1;
    }

    Ok(ImportPreview {
        headers,
        total_rows,
    })
}

fn preview_xlsx(path: &Path) -> Result<ImportPreview> {
    let mut workbook: Xlsx<_> = open_workbook(path)?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .ok_or_else(|| anyhow!("No sheets found in workbook"))?
        .clone();

    let range = workbook.worksheet_range(&sheet_name)?;

    let mut rows_iter = range.rows();

    // First row as headers
    let headers: Vec<String> = rows_iter
        .next()
        .ok_or_else(|| anyhow!("Empty spreadsheet"))?
        .iter()
        .map(|cell| cell.to_string())
        .collect();

    let mut total_rows = 0;

    for _ in rows_iter {
        total_rows += 1;
    }

    Ok(ImportPreview {
        headers,
        total_rows,
    })
}

fn preview_xls(path: &Path) -> Result<ImportPreview> {
    let mut workbook: Xls<_> = open_workbook(path)?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .ok_or_else(|| anyhow!("No sheets found in workbook"))?
        .clone();

    let range = workbook.worksheet_range(&sheet_name)?;

    let mut rows_iter = range.rows();

    let headers: Vec<String> = rows_iter
        .next()
        .ok_or_else(|| anyhow!("Empty spreadsheet"))?
        .iter()
        .map(|cell| cell.to_string())
        .collect();

    let mut total_rows = 0;

    for _ in rows_iter {
        total_rows += 1;
    }

    Ok(ImportPreview {
        headers,
        total_rows,
    })
}

/// Parses the file with the given column mapping and returns contacts
pub fn parse_file_with_mapping(
    path: &str,
    mapping: &ColumnMapping,
) -> Result<Vec<ImportedContact>> {
    let path = Path::new(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let rows: Vec<Vec<String>> = match ext.as_str() {
        "csv" => read_csv_rows(path)?,
        "xlsx" => read_xlsx_rows(path)?,
        "xls" => read_xls_rows(path)?,
        _ => return Err(anyhow!("Unsupported file format")),
    };

    let contacts: Vec<ImportedContact> = rows
        .into_iter()
        .filter_map(|row| {
            let (first_name, last_name) = {
                let f = mapping
                    .first_name
                    .and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .unwrap_or_default();

                let l = mapping
                    .last_name
                    .and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .unwrap_or_default();

                if l.is_empty() && f.contains(' ') {
                    match f.split_once(' ') {
                        Some((first, last)) => (first.trim().to_string(), last.trim().to_string()),
                        None => (f, l),
                    }
                } else {
                    (f, l)
                }
            };

            // Skip rows without names
            if first_name.is_empty() && last_name.is_empty() {
                return None;
            }

            Some(ImportedContact {
                first_name,
                last_name,
                email: mapping
                    .email
                    .and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                linkedin_url: mapping
                    .linkedin_url
                    .and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                company: mapping
                    .company
                    .and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                title: mapping
                    .title
                    .and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                location: mapping
                    .location
                    .and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                company_website: mapping
                    .company_website
                    .and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                intelligence_summary: {
                    let parts: Vec<String> = mapping
                        .intelligence_summary
                        .iter()
                        .filter_map(|&i| row.get(i))
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    if parts.is_empty() {
                        None
                    } else {
                        Some(parts.join("\n\n"))
                    }
                },
            })
        })
        .collect();

    Ok(contacts)
}

fn read_csv_rows(path: &Path) -> Result<Vec<Vec<String>>> {
    let mut reader = csv::Reader::from_path(path)?;
    let mut rows = Vec::new();

    for result in reader.records() {
        let record = result?;
        rows.push(record.iter().map(|s| s.to_string()).collect());
    }

    Ok(rows)
}

fn read_xlsx_rows(path: &Path) -> Result<Vec<Vec<String>>> {
    let mut workbook: Xlsx<_> = open_workbook(path)?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .ok_or_else(|| anyhow!("No sheets"))?
        .clone();
    let range = workbook.worksheet_range(&sheet_name)?;

    let mut rows_iter = range.rows();
    rows_iter.next(); // Skip header

    Ok(rows_iter
        .map(|row| row.iter().map(|c| c.to_string()).collect())
        .collect())
}

fn read_xls_rows(path: &Path) -> Result<Vec<Vec<String>>> {
    let mut workbook: Xls<_> = open_workbook(path)?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .ok_or_else(|| anyhow!("No sheets"))?
        .clone();
    let range = workbook.worksheet_range(&sheet_name)?;

    let mut rows_iter = range.rows();
    rows_iter.next(); // Skip header

    Ok(rows_iter
        .map(|row| row.iter().map(|c| c.to_string()).collect())
        .collect())
}
