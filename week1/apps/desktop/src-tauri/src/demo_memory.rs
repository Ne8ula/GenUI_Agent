use serde::{Deserialize, Serialize};

const SOURCE_REFERENCE: &str = "fixtures/vault/preferences/weather-units.md";
const WEATHER_UNITS: &str = include_str!("../../../../fixtures/vault/preferences/weather-units.md");
const MAX_BYTES: usize = 4096;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MemoryRequest {
    record_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MemoryFields {
    id: String,
    category: String,
    value: String,
    scope: String,
    source: String,
    recorded_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DemoMemory {
    #[serde(flatten)]
    fields: MemoryFields,
    markdown: String,
    source_reference: &'static str,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum MemoryError {
    UnknownRecord,
    InvalidRecord,
    RecordUnavailable,
}

fn valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let year = value[..4].parse::<u32>().unwrap_or(0);
    let month = value[5..7].parse::<usize>().unwrap_or(0);
    let day = value[8..].parse::<u32>().unwrap_or(0);
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    year > 0 && (1..=12).contains(&month) && day > 0 && day <= days[month - 1]
}

fn parse_record(source: Option<&str>) -> Result<DemoMemory, MemoryError> {
    let markdown = source.ok_or(MemoryError::RecordUnavailable)?;
    if markdown.len() > MAX_BYTES || markdown.contains('\0') {
        return Err(MemoryError::InvalidRecord);
    }
    // A deliberately small frontmatter dialect: six unquoted scalar fields.
    // Never interpret YAML tags, aliases, nested structures, or Markdown HTML.
    let mut lines = markdown.lines();
    if lines.next() != Some("---") {
        return Err(MemoryError::InvalidRecord);
    }
    let mut values = serde_json::Map::new();
    let mut closed = false;
    for line in lines.by_ref() {
        if line == "---" {
            closed = true;
            break;
        }
        let (key, value) = line.split_once(": ").ok_or(MemoryError::InvalidRecord)?;
        if value.is_empty()
            || value.trim() != value
            || values
                .insert(key.to_owned(), serde_json::Value::String(value.to_owned()))
                .is_some()
        {
            return Err(MemoryError::InvalidRecord);
        }
    }
    if !closed || !lines.any(|line| !line.trim().is_empty()) {
        return Err(MemoryError::InvalidRecord);
    }
    let fields: MemoryFields = serde_json::from_value(serde_json::Value::Object(values))
        .map_err(|_| MemoryError::InvalidRecord)?;
    if fields.id != "weather-units"
        || fields.category != "preference"
        || !matches!(fields.value.as_str(), "Celsius" | "Fahrenheit")
        || fields.scope != "weather"
        || fields.source != "synthetic-demo"
        || !valid_date(&fields.recorded_date)
    {
        return Err(MemoryError::InvalidRecord);
    }
    Ok(DemoMemory {
        fields,
        markdown: markdown.to_owned(),
        source_reference: SOURCE_REFERENCE,
    })
}

#[tauri::command]
pub(crate) fn get_demo_memory(request: MemoryRequest) -> Result<DemoMemory, MemoryError> {
    // The caller supplies an ID, never a path. Only this compiled public fixture exists.
    match request.record_id.as_str() {
        "weather-units" => parse_record(Some(WEATHER_UNITS)),
        _ => Err(MemoryError::UnknownRecord),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_record_returns_fields_and_exact_source() {
        let record = get_demo_memory(MemoryRequest {
            record_id: "weather-units".into(),
        })
        .unwrap();
        assert_eq!(record.markdown, WEATHER_UNITS);
        assert_eq!(record.fields.value, "Celsius");
        assert_eq!(
            serde_json::to_value(record).unwrap(),
            serde_json::json!({
                "id": "weather-units", "category": "preference", "value": "Celsius",
                "scope": "weather", "source": "synthetic-demo", "recordedDate": "2026-09-16",
                "markdown": WEATHER_UNITS, "sourceReference": SOURCE_REFERENCE
            })
        );
    }

    #[test]
    fn rejects_unknown_ids_and_paths() {
        for id in [
            "",
            "other",
            "../weather-units",
            "C:\\private\\record.md",
            "weather-units.md",
        ] {
            assert_eq!(
                get_demo_memory(MemoryRequest {
                    record_id: id.into()
                })
                .unwrap_err(),
                MemoryError::UnknownRecord
            );
        }
        assert_eq!(
            get_demo_memory(MemoryRequest {
                record_id: "x".repeat(4096)
            })
            .unwrap_err(),
            MemoryError::UnknownRecord
        );
    }

    #[test]
    fn rejects_authority_and_path_fields_in_request() {
        for request in [
            r#"{"recordId":"weather-units","path":"private.md"}"#,
            r#"{"recordId":"weather-units","permission":"admin"}"#,
            r#"{}"#,
            r#"{"recordId":1}"#,
        ] {
            assert!(serde_json::from_str::<MemoryRequest>(request).is_err());
        }
    }

    #[test]
    fn missing_record_has_bounded_error() {
        assert_eq!(
            parse_record(None).unwrap_err(),
            MemoryError::RecordUnavailable
        );
    }

    #[test]
    fn rejects_malformed_oversized_or_untrusted_metadata() {
        for source in [
            "".to_owned(),
            WEATHER_UNITS.replacen("---", "", 1),
            WEATHER_UNITS.replace("category: preference\n", ""),
            WEATHER_UNITS.replace("scope: weather", "scope: weather\nscope: weather"),
            WEATHER_UNITS.replace("source: synthetic-demo", "source: live-vault"),
            WEATHER_UNITS.replace("value: Celsius", "value: Kelvin"),
            WEATHER_UNITS.replace("id: weather-units", "id: other"),
            WEATHER_UNITS.replace("scope: weather", "scope: calendar"),
            WEATHER_UNITS.replace("scope: weather", "scope: weather\npermission: admin"),
            WEATHER_UNITS.replace("2026-09-16", "2026-02-30"),
            WEATHER_UNITS.replace("value: Celsius", "value: &alias Celsius"),
            WEATHER_UNITS.replace("# Weather units", "\0"),
            "x".repeat(MAX_BYTES + 1),
        ] {
            assert_eq!(
                parse_record(Some(&source)).unwrap_err(),
                MemoryError::InvalidRecord
            );
        }
    }

    #[test]
    fn preserves_line_endings_and_derives_value_from_source() {
        let source = WEATHER_UNITS
            .replace("Celsius", "Fahrenheit")
            .replace('\n', "\r\n");
        let result = parse_record(Some(&source)).unwrap();
        assert_eq!(result.fields.value, "Fahrenheit");
        assert_eq!(result.markdown, source);
    }

    #[test]
    fn calendar_date_validation_handles_leap_years() {
        assert!(valid_date("2024-02-29"));
        for date in [
            "2026-02-29",
            "0000-01-01",
            "2026-13-01",
            "2026-00-01",
            "2026-01-00",
            "😀-01-01",
        ] {
            assert!(!valid_date(date));
        }
    }
}
