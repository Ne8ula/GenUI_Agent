use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};

pub(crate) const STT_MODEL: &str = "gpt-4o-mini-transcribe-2025-12-15";
pub(crate) const DEFAULT_REPLY_MODEL: &str = "gpt-4.1-mini-2025-04-14";
pub(crate) const TTS_MODEL: &str = "eleven_v3";
pub(crate) const MAX_HISTORY_TURNS: usize = 8;
pub(crate) const EXTERNAL_FACTS_LIMITATION: &str =
    "I can't verify external facts in this demo. I can stay with what you've shared here.";

const MIN_WAV_BYTES: usize = 44 + 1_600 * 2;
const MAX_WAV_BYTES: usize = 44 + 16_000 * 30 * 2;
const MAX_REPLY_BYTES: usize = 800;
const MAX_REPLY_CHARS: usize = 480;
const MAX_REPLY_WORDS: usize = 60;
const REPLY_SCHEMA: &str = include_str!("../../schemas/conversation-reply.schema.json");

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderStatus {
    pub(crate) stt: String,
    pub(crate) reply: String,
    pub(crate) tts: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StatusReply {
    pub(crate) ready: bool,
    pub(crate) missing: Vec<String>,
    pub(crate) providers: ProviderStatus,
    pub(crate) remaining_turns: u8,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartReply {
    pub(crate) session_id: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TurnReply {
    pub(crate) session_id: String,
    pub(crate) generation: u64,
    pub(crate) transcript: String,
    pub(crate) reply: String,
    pub(crate) stance: Stance,
    pub(crate) intensity: f64,
    pub(crate) audio_base64: String,
    pub(crate) audio_mime: &'static str,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Stance {
    Attentive,
    Comforting,
    SharedJoy,
    Congratulatory,
    Supportive,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Delivery {
    Neutral,
    Warm,
    Upbeat,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Scope {
    Conversation,
    ExternalFacts,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct ModelReply {
    pub(crate) reply: String,
    pub(crate) stance: Stance,
    pub(crate) intensity: f64,
    pub(crate) delivery: Delivery,
    pub(crate) scope: Scope,
}

pub(crate) fn parse_model_reply(value: &str) -> Result<ModelReply, &'static str> {
    let parsed: ModelReply = serde_json::from_str(value).map_err(|_| "w3_invalid_model_reply")?;
    validate_model_reply(parsed)
}

pub(crate) fn validate_model_reply(mut reply: ModelReply) -> Result<ModelReply, &'static str> {
    if !reply.intensity.is_finite() || !(0.0..=1.0).contains(&reply.intensity) {
        return Err("w3_invalid_model_reply");
    }
    validate_reply_safety_and_bounds(&reply.reply)?;
    validate_sentence_shape(&reply.reply)?;

    // This is deliberately a conservative defense-in-depth heuristic, not fact
    // verification. It catches only obvious external claims if the interim
    // decider mislabels them as conversation; ambiguous semantics still require
    // a real verifier in a later adapter.
    if reply.scope == Scope::ExternalFacts || obvious_external_claim(&reply.reply) {
        reply.reply = EXTERNAL_FACTS_LIMITATION.to_owned();
        reply.stance = Stance::Attentive;
        reply.intensity = 0.25;
        reply.delivery = Delivery::Neutral;
        reply.scope = Scope::ExternalFacts;
    }
    Ok(reply)
}

pub(crate) fn trusted_tts_text(reply: &ModelReply) -> String {
    let cue = match reply.delivery {
        Delivery::Neutral => "[calm]",
        Delivery::Warm => "[warm]",
        Delivery::Upbeat => "[happy]",
    };
    format!("{cue} {}", reply.reply)
}

#[cfg(test)]
pub(crate) fn validate_spoken_reply(text: &str) -> Result<(), &'static str> {
    validate_reply_safety_and_bounds(text)?;
    validate_sentence_shape(text)
}

fn validate_reply_safety_and_bounds(text: &str) -> Result<(), &'static str> {
    if text.is_empty()
        || text.trim() != text
        || text.len() > MAX_REPLY_BYTES
        || text.chars().count() > MAX_REPLY_CHARS
        || text.chars().any(char::is_control)
        || !text.chars().any(char::is_alphabetic)
        || text.chars().any(|character| {
            matches!(
                character,
                '<' | '>'
                    | '['
                    | ']'
                    | '{'
                    | '}'
                    | '('
                    | ')'
                    | '`'
                    | '\\'
                    | '|'
                    | ';'
                    | '='
                    | '*'
                    | '#'
                    | '~'
            )
        })
    {
        return Err("w3_invalid_model_reply");
    }

    let lowered = text.to_ascii_lowercase();
    if [
        "=>",
        "::",
        "#!/",
        "javascript:",
        "data:text/html",
        "```",
        "rm /",
        "cd /",
        "/bin/",
        "/usr/",
        "sudo ",
        "curl http",
        "wget http",
        "powershell -",
        "cmd.exe",
        "npm run",
        "cargo run",
        "python -",
        "node -",
    ]
    .iter()
    .any(|marker| lowered.contains(marker))
    {
        return Err("w3_invalid_model_reply");
    }

    let words = text.split_whitespace().count();
    if !(1..=MAX_REPLY_WORDS).contains(&words) {
        return Err("w3_invalid_model_reply");
    }
    Ok(())
}

fn validate_sentence_shape(text: &str) -> Result<(), &'static str> {
    let characters: Vec<char> = text.chars().collect();
    let mut sentences = 0;
    for (index, character) in characters.iter().enumerate() {
        if !matches!(character, '.' | '!' | '?')
            || index > 0 && matches!(characters[index - 1], '.' | '!' | '?')
        {
            continue;
        }
        let mut next = index + 1;
        while characters
            .get(next)
            .is_some_and(|character| matches!(character, '.' | '!' | '?' | '\'' | '"' | '’' | '”'))
        {
            next += 1;
        }
        if next == characters.len()
            || characters
                .get(next)
                .is_some_and(|character| character.is_whitespace())
        {
            sentences += 1;
        }
    }
    if !(1..=2).contains(&sentences)
        || !text
            .chars()
            .last()
            .is_some_and(|character| matches!(character, '.' | '!' | '?'))
    {
        return Err("w3_invalid_model_reply");
    }
    Ok(())
}

fn obvious_external_claim(text: &str) -> bool {
    let lowered = text.to_ascii_lowercase();
    if lowered.bytes().any(|byte| byte.is_ascii_digit()) {
        return true;
    }

    let url_markers = [
        "http://", "https://", "www.", "mailto:", ".com", ".org", ".net", ".edu", ".gov",
    ];
    let medical_claims = [
        "medical advice",
        "diagnosis is",
        "diagnosed with",
        "symptom means",
        "symptoms mean",
        "safe dose",
        "dosage",
        "prescription for",
        "medication for",
        "treatment for",
        "is safe to take",
        "is unsafe to take",
    ];
    let legal_claims = [
        "legal advice",
        "the law requires",
        "the law allows",
        " is legal",
        " is illegal",
        "legally required",
        "you can sue",
        "liable for",
        "statute of limitations",
        "court will",
    ];
    let financial_claims = [
        "financial advice",
        "buy stock",
        "sell stock",
        "buy shares",
        "sell shares",
        "invest in",
        "guaranteed return",
        "interest rate",
        "stock price",
        "market price",
        "tax rate",
        "will appreciate",
    ];
    let current_weather_claims = [
        "°f",
        "°c",
        " degrees fahrenheit",
        " degrees celsius",
        " fahrenheit",
        " celsius",
        " mph",
        " km/h",
        "percent chance",
        "% chance",
        "weather is currently",
        "currently raining",
        "currently snowing",
        "forecast says",
    ];
    let medical_recommendation = ["you should take", "you need to take"]
        .iter()
        .any(|marker| lowered.contains(marker))
        && [
            "medicine",
            "medication",
            "aspirin",
            "ibuprofen",
            "antibiotic",
            "dose",
            "pill",
            "tablet",
        ]
        .iter()
        .any(|marker| lowered.contains(marker));
    let financial_recommendation = ["you should buy", "you should sell"]
        .iter()
        .any(|marker| lowered.contains(marker))
        && ["stock", "share", "bond", "crypto", "fund", "investment"]
            .iter()
            .any(|marker| lowered.contains(marker));
    let completed_action_verbs = [
        "sent ",
        "emailed ",
        "booked ",
        "ordered ",
        "paid ",
        "called ",
        "scheduled ",
        "cancelled ",
        "canceled ",
        "changed ",
        "updated ",
        "deleted ",
        "uploaded ",
        "downloaded ",
        "submitted ",
        "reserved ",
        "transferred ",
        "posted ",
        "messaged ",
        "turned on ",
        "turned off ",
        "completed ",
    ];
    let first_person_completion = ["i ", "i've ", "i have "].iter().any(|prefix| {
        completed_action_verbs
            .iter()
            .any(|verb| lowered.contains(&format!("{prefix}{verb}")))
    });
    let passive_completion = [
        "has been sent",
        "has been emailed",
        "has been booked",
        "has been ordered",
        "has been scheduled",
        "has been submitted",
        "has been completed",
        "was sent",
        "was booked",
        "was scheduled",
        "was submitted",
    ]
    .iter()
    .any(|marker| lowered.contains(marker));

    url_markers
        .iter()
        .chain(medical_claims.iter())
        .chain(legal_claims.iter())
        .chain(financial_claims.iter())
        .chain(current_weather_claims.iter())
        .any(|marker| lowered.contains(marker))
        || medical_recommendation
        || financial_recommendation
        || first_person_completion
        || passive_completion
        || matches!(lowered.trim(), "done." | "completed.")
}

pub(crate) fn model_json_schema() -> Result<serde_json::Value, &'static str> {
    let mut schema: serde_json::Value =
        serde_json::from_str(REPLY_SCHEMA).map_err(|_| "w3_reply_unavailable")?;
    let object = schema.as_object_mut().ok_or("w3_reply_unavailable")?;
    for metadata in ["$schema", "$id", "title", "description", "$comment"] {
        object.remove(metadata);
    }
    Ok(schema)
}

pub(crate) fn decode_wav(encoded: &str) -> Result<Vec<u8>, &'static str> {
    if encoded.len() > MAX_WAV_BYTES.div_ceil(3) * 4 {
        return Err("w3_invalid_audio");
    }
    let bytes = STANDARD.decode(encoded).map_err(|_| "w3_invalid_audio")?;
    if !valid_wav(&bytes) {
        return Err("w3_invalid_audio");
    }
    Ok(bytes)
}

pub(crate) fn valid_wav(bytes: &[u8]) -> bool {
    if !(MIN_WAV_BYTES..=MAX_WAV_BYTES).contains(&bytes.len())
        || !(bytes.len() - 44).is_multiple_of(2)
    {
        return false;
    }
    let u16_at = |index| u16::from_le_bytes([bytes[index], bytes[index + 1]]);
    let u32_at = |index| {
        u32::from_le_bytes([
            bytes[index],
            bytes[index + 1],
            bytes[index + 2],
            bytes[index + 3],
        ])
    };
    &bytes[0..4] == b"RIFF"
        && u32_at(4) as usize == bytes.len() - 8
        && &bytes[8..16] == b"WAVEfmt "
        && u32_at(16) == 16
        && u16_at(20) == 1
        && u16_at(22) == 1
        && u32_at(24) == 16_000
        && u32_at(28) == 32_000
        && u16_at(32) == 2
        && u16_at(34) == 16
        && &bytes[36..40] == b"data"
        && u32_at(40) as usize == bytes.len() - 44
}

pub(crate) fn validate_transcript(text: &str) -> Result<String, &'static str> {
    let text = text.trim();
    if text.is_empty()
        || text.len() > 4_000
        || text.chars().count() > 2_000
        || text
            .chars()
            .any(|character| character.is_control() && !character.is_whitespace())
    {
        return Err("w3_invalid_transcript");
    }
    Ok(text.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wave(samples: usize) -> Vec<u8> {
        let mut bytes = vec![0; 44 + samples * 2];
        let length = bytes.len();
        bytes[0..4].copy_from_slice(b"RIFF");
        bytes[4..8].copy_from_slice(&((length - 8) as u32).to_le_bytes());
        bytes[8..16].copy_from_slice(b"WAVEfmt ");
        bytes[16..20].copy_from_slice(&16_u32.to_le_bytes());
        bytes[20..22].copy_from_slice(&1_u16.to_le_bytes());
        bytes[22..24].copy_from_slice(&1_u16.to_le_bytes());
        bytes[24..28].copy_from_slice(&16_000_u32.to_le_bytes());
        bytes[28..32].copy_from_slice(&32_000_u32.to_le_bytes());
        bytes[32..34].copy_from_slice(&2_u16.to_le_bytes());
        bytes[34..36].copy_from_slice(&16_u16.to_le_bytes());
        bytes[36..40].copy_from_slice(b"data");
        bytes[40..44].copy_from_slice(&((length - 44) as u32).to_le_bytes());
        bytes
    }

    fn valid_reply() -> ModelReply {
        ModelReply {
            reply: "That sounds genuinely exciting. What part feels best right now?".into(),
            stance: Stance::SharedJoy,
            intensity: 0.7,
            delivery: Delivery::Upbeat,
            scope: Scope::Conversation,
        }
    }

    #[test]
    fn schema_is_draft_2020_12_and_closed() {
        let schema: serde_json::Value = serde_json::from_str(REPLY_SCHEMA).unwrap();
        assert_eq!(
            schema["$schema"],
            "https://json-schema.org/draft/2020-12/schema"
        );
        assert_eq!(schema["additionalProperties"], false);
        assert_eq!(schema["required"].as_array().unwrap().len(), 5);

        let provider_schema = model_json_schema().unwrap();
        assert!(provider_schema.get("$schema").is_none());
        assert_eq!(provider_schema["additionalProperties"], false);
    }

    #[test]
    fn strict_model_object_rejects_unknowns_and_bad_bounds() {
        let valid = serde_json::to_string(&valid_reply()).unwrap();
        assert_eq!(parse_model_reply(&valid).unwrap(), valid_reply());

        for invalid in [
            r#"{"reply":"Hello.","stance":"attentive","intensity":0.5,"delivery":"neutral","scope":"conversation","html":"<b>"}"#,
            r#"{"reply":"Hello.","stance":"certain","intensity":0.5,"delivery":"neutral","scope":"conversation"}"#,
            r#"{"reply":"Hello.","stance":"attentive","intensity":1.1,"delivery":"neutral","scope":"conversation"}"#,
            r#"{"reply":"Hello.","stance":"attentive","intensity":0.5,"delivery":"dramatic","scope":"conversation"}"#,
            r#"{"reply":"Hello.","stance":"attentive","intensity":0.5,"delivery":"neutral","scope":"verified"}"#,
        ] {
            assert!(parse_model_reply(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn reply_policy_rejects_tags_code_ssml_and_oversize_text() {
        assert!(validate_spoken_reply("One sentence.").is_ok());
        assert!(validate_spoken_reply("One sentence. A second sentence!").is_ok());
        for invalid in [
            "[warm] Hello.",
            "<speak>Hello.</speak>",
            "Use `code` here.",
            "Run function() { return true; }.",
            "Run rm /home now.",
            "First. Second. Third.",
            "No terminal punctuation",
            "line one.\nline two.",
        ] {
            assert!(validate_spoken_reply(invalid).is_err(), "{invalid}");
        }
        let too_many_words = format!("{}.", "word ".repeat(61).trim());
        assert!(validate_spoken_reply(&too_many_words).is_err());
        let too_many_characters = format!("{}.", "a".repeat(481));
        assert!(validate_spoken_reply(&too_many_characters).is_err());
    }

    #[test]
    fn external_facts_become_a_trusted_limitation() {
        let mut reply = valid_reply();
        reply.scope = Scope::ExternalFacts;
        reply.reply = "The current answer is forty-two.".into();
        let reply = validate_model_reply(reply).unwrap();
        assert_eq!(reply.reply, EXTERNAL_FACTS_LIMITATION);
        assert_eq!(reply.stance, Stance::Attentive);
        assert_eq!(reply.intensity, 0.25);
        assert_eq!(reply.delivery, Delivery::Neutral);
        assert_eq!(reply.scope, Scope::ExternalFacts);
        assert_eq!(
            trusted_tts_text(&reply),
            format!("[calm] {EXTERNAL_FACTS_LIMITATION}")
        );
    }

    #[test]
    fn misclassified_obvious_external_claims_become_the_trusted_limitation() {
        for text in [
            "The city has 812,000 residents.",
            "Visit https://example.com for the answer.",
            "This symptom means you should take aspirin.",
            "You should take aspirin for that headache.",
            "The law requires you to file this form.",
            "You should buy this stock for a guaranteed return.",
            "It is 72 degrees Fahrenheit in Ithaca right now.",
            "I sent the email and booked the appointment.",
            "I have scheduled the appointment.",
        ] {
            let mut candidate = valid_reply();
            candidate.reply = text.into();
            candidate.scope = Scope::Conversation;
            let guarded = validate_model_reply(candidate).unwrap();
            assert_eq!(guarded.reply, EXTERNAL_FACTS_LIMITATION, "{text}");
            assert_eq!(guarded.scope, Scope::ExternalFacts, "{text}");
            assert_eq!(guarded.stance, Stance::Attentive, "{text}");
            assert_eq!(guarded.intensity, 0.25, "{text}");
            assert_eq!(guarded.delivery, Delivery::Neutral, "{text}");
        }
    }

    #[test]
    fn heuristic_preserves_short_context_grounded_conversation() {
        for text in [
            "That medical appointment sounds exhausting. I can stay with you.",
            "Finishing the legal paperwork sounds like a relief!",
            "Money worries can feel heavy. Would you like me to listen?",
            "Congratulations on finishing your treatment!",
            "One opening could be: This project began with a question.",
            "You should take a short break and come back to it.",
            "You should buy yourself a cupcake to celebrate!",
        ] {
            let mut candidate = valid_reply();
            candidate.reply = text.into();
            candidate.scope = Scope::Conversation;
            let validated = validate_model_reply(candidate).unwrap();
            assert_eq!(validated.reply, text, "{text}");
            assert_eq!(validated.scope, Scope::Conversation, "{text}");
        }
    }

    #[test]
    fn canonical_pcm_wav_is_limited_to_thirty_seconds() {
        assert!(valid_wav(&wave(1_600)));
        assert!(valid_wav(&wave(16_000 * 30)));
        assert!(!valid_wav(&wave(1_599)));
        assert!(!valid_wav(&wave(16_000 * 30 + 1)));
        for offset in [0, 4, 8, 16, 20, 22, 24, 28, 32, 34, 36, 40] {
            let mut invalid = wave(16_000);
            invalid[offset] ^= 1;
            assert!(!valid_wav(&invalid), "offset {offset}");
        }
        assert!(decode_wav(&STANDARD.encode(wave(16_000))).is_ok());
        assert!(decode_wav("not-base64").is_err());
    }

    #[test]
    fn status_and_start_serialize_the_exact_renderer_contracts() {
        let status = StatusReply {
            ready: true,
            missing: Vec::new(),
            providers: ProviderStatus {
                stt: format!("openai/{STT_MODEL}"),
                reply: format!("openai/{DEFAULT_REPLY_MODEL}"),
                tts: format!("elevenlabs/{TTS_MODEL}"),
            },
            remaining_turns: 7,
        };
        assert_eq!(
            serde_json::to_value(status).unwrap(),
            serde_json::json!({
                "ready": true,
                "missing": [],
                "providers": {
                    "stt": format!("openai/{STT_MODEL}"),
                    "reply": format!("openai/{DEFAULT_REPLY_MODEL}"),
                    "tts": format!("elevenlabs/{TTS_MODEL}")
                },
                "remainingTurns": 7
            })
        );
        assert_eq!(
            serde_json::to_value(StartReply {
                session_id: "session".into()
            })
            .unwrap(),
            serde_json::json!({"sessionId": "session"})
        );
    }

    #[test]
    fn turn_response_serializes_the_exact_renderer_contract() {
        let response = TurnReply {
            session_id: "session".into(),
            generation: 2,
            transcript: "I finished it.".into(),
            reply: "That is wonderful news!".into(),
            stance: Stance::Congratulatory,
            intensity: 0.8,
            audio_base64: "audio".into(),
            audio_mime: "audio/mpeg",
        };
        let value = serde_json::to_value(response).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "sessionId": "session",
                "generation": 2,
                "transcript": "I finished it.",
                "reply": "That is wonderful news!",
                "stance": "congratulatory",
                "intensity": 0.8,
                "audioBase64": "audio",
                "audioMime": "audio/mpeg"
            })
        );
    }
}
