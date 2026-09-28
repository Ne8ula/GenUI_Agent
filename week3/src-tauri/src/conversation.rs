use crate::{
    protocol::{
        decode_wav, parse_model_reply, ModelReply, StartReply, StatusReply, TurnReply,
        MAX_HISTORY_TURNS,
    },
    providers::{
        build_http_client, decide_conversation, inspect_runtime, synthesize, transcribe,
        ChatMessage, ChatRole,
    },
};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use std::{future::Future, sync::Mutex, time::Duration};
use tokio::sync::watch;
use uuid::Uuid;

const SESSION_LIMIT: Duration = Duration::from_secs(10 * 60);
const MAX_PROCESS_TURNS: u8 = 10;
const MAX_JS_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

pub(crate) struct W3State {
    inner: Mutex<BackendState>,
    client: Option<Client>,
}

struct BackendState {
    allowance_limit: u8,
    allowance_used: u8,
    session: Option<Session>,
    last_invalidated_session_id: Option<String>,
}

struct Session {
    id: String,
    started_at: std::time::Instant,
    active: Option<ActiveGeneration>,
    history: Vec<HistoryTurn>,
    delivered_turns: u8,
}

struct ActiveGeneration {
    number: u64,
    turn_started: bool,
    cancel: Option<watch::Sender<bool>>,
    pending: Option<ModelReply>,
}

#[derive(Debug, PartialEq, Eq)]
struct HistoryTurn {
    generation: u64,
    user: String,
    assistant: Option<String>,
}

impl Default for W3State {
    fn default() -> Self {
        Self {
            inner: Mutex::new(BackendState {
                allowance_limit: allowance_from_env(),
                allowance_used: 0,
                session: None,
                last_invalidated_session_id: None,
            }),
            client: build_http_client().ok(),
        }
    }
}

impl Session {
    fn new(id: String) -> Self {
        Self {
            id,
            started_at: std::time::Instant::now(),
            active: None,
            history: Vec::new(),
            delivered_turns: 0,
        }
    }

    fn deadline(&self) -> std::time::Instant {
        self.started_at + SESSION_LIMIT
    }

    fn expired(&self) -> bool {
        self.started_at.elapsed() >= SESSION_LIMIT
    }

    fn cancel_active(&mut self) {
        if let Some(sender) = self
            .active
            .as_ref()
            .and_then(|active| active.cancel.as_ref())
        {
            let _ = sender.send(true);
        }
    }

    fn advance(&mut self, generation: u64) -> Result<(), &'static str> {
        match self.active.as_ref() {
            None if generation != 0 => return Err("w3_generation_must_start_at_zero"),
            Some(active) if generation <= active.number => {
                return Err("w3_generation_not_increasing")
            }
            _ => {}
        }
        self.cancel_active();
        self.active = Some(ActiveGeneration {
            number: generation,
            turn_started: false,
            cancel: None,
            pending: None,
        });
        Ok(())
    }

    fn store_user(&mut self, generation: u64, transcript: String) {
        if self
            .history
            .iter()
            .any(|turn| turn.generation == generation)
        {
            return;
        }
        self.history.push(HistoryTurn {
            generation,
            user: transcript,
            assistant: None,
        });
        self.history.sort_by_key(|turn| turn.generation);
        while self.history.len() > MAX_HISTORY_TURNS {
            self.history.remove(0);
        }
    }

    fn messages(&self) -> Vec<ChatMessage> {
        let mut messages = Vec::with_capacity(self.history.len() * 2);
        for turn in &self.history {
            messages.push(ChatMessage {
                role: ChatRole::User,
                content: turn.user.clone(),
            });
            if let Some(assistant) = &turn.assistant {
                messages.push(ChatMessage {
                    role: ChatRole::Assistant,
                    content: assistant.clone(),
                });
            }
        }
        messages
    }

    fn commit_pending(&mut self, generation: u64) -> Result<(), &'static str> {
        let active = self.active.as_mut().ok_or("w3_generation_not_active")?;
        if active.number != generation {
            return Err("w3_stale_generation");
        }
        let reply = active.pending.as_ref().ok_or("w3_response_not_pending")?;
        let turn = self
            .history
            .iter_mut()
            .find(|turn| turn.generation == generation)
            .ok_or("w3_response_not_pending")?;
        if turn.assistant.is_some() {
            return Err("w3_response_already_delivered");
        }
        turn.assistant = Some(reply.reply.clone());
        active.pending = None;
        self.delivered_turns = self.delivered_turns.saturating_add(1);
        Ok(())
    }
}

fn allowance_from_value(value: Option<&str>) -> u8 {
    value
        .and_then(|value| value.parse::<u8>().ok())
        .filter(|value| *value <= MAX_PROCESS_TURNS)
        .unwrap_or(0)
}

fn allowance_from_env() -> u8 {
    allowance_from_value(std::env::var("EVA_W3_MAX_TURNS").ok().as_deref())
}

fn valid_session_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn require_exact_ipc_body(
    body: &tauri::ipc::InvokeBody,
    expected_keys: &[&str],
) -> Result<(), &'static str> {
    let tauri::ipc::InvokeBody::Json(serde_json::Value::Object(object)) = body else {
        return Err("w3_invalid_request");
    };
    if object.len() != expected_keys.len()
        || expected_keys.iter().any(|key| !object.contains_key(*key))
    {
        return Err("w3_invalid_request");
    }
    Ok(())
}

fn require_exact_ipc_keys(
    request: &tauri::ipc::Request<'_>,
    expected_keys: &[&str],
) -> Result<(), &'static str> {
    require_exact_ipc_body(request.body(), expected_keys)
}

fn validate_generation(generation: u64) -> Result<(), &'static str> {
    if generation > MAX_JS_SAFE_INTEGER {
        return Err("w3_invalid_generation");
    }
    Ok(())
}

fn expire_session(backend: &mut BackendState) -> bool {
    if !backend.session.as_ref().is_some_and(Session::expired) {
        return false;
    }
    if let Some(mut session) = backend.session.take() {
        session.cancel_active();
        backend.last_invalidated_session_id = Some(session.id);
    }
    true
}

fn require_session_mut<'a>(
    backend: &'a mut BackendState,
    session_id: &str,
) -> Result<&'a mut Session, &'static str> {
    if expire_session(backend) {
        return Err("w3_session_expired");
    }
    backend
        .session
        .as_mut()
        .filter(|session| session.id == session_id)
        .ok_or("w3_invalid_session")
}

fn remaining_turns(backend: &BackendState) -> u8 {
    backend
        .allowance_limit
        .saturating_sub(backend.allowance_used)
}

fn create_session(backend: &mut BackendState) -> String {
    if let Some(mut previous) = backend.session.take() {
        previous.cancel_active();
        backend.last_invalidated_session_id = Some(previous.id);
    }
    let id = Uuid::new_v4().simple().to_string();
    backend.session = Some(Session::new(id.clone()));
    id
}

fn end_session(backend: &mut BackendState, session_id: &str) -> Result<(), &'static str> {
    expire_session(backend);
    if let Some(active) = backend.session.as_ref() {
        if active.id != session_id {
            return Err("w3_invalid_session");
        }
        let mut session = backend.session.take().ok_or("w3_invalid_session")?;
        session.cancel_active();
        backend.last_invalidated_session_id = Some(session.id);
        return Ok(());
    }
    if backend.last_invalidated_session_id.as_deref() == Some(session_id) {
        Ok(())
    } else {
        Err("w3_invalid_session")
    }
}

fn advance_generation(
    backend: &mut BackendState,
    session_id: &str,
    generation: u64,
) -> Result<(), &'static str> {
    require_session_mut(backend, session_id)?.advance(generation)
}

fn begin_turn(
    backend: &mut BackendState,
    session_id: &str,
    generation: u64,
) -> Result<(watch::Receiver<bool>, std::time::Instant), &'static str> {
    if remaining_turns(backend) == 0 {
        return Err("w3_turn_allowance_exhausted");
    }
    let (receiver, deadline) = {
        let session = require_session_mut(backend, session_id)?;
        let deadline = session.deadline();
        let active = session.active.as_mut().ok_or("w3_generation_not_active")?;
        if active.number != generation {
            return Err("w3_stale_generation");
        }
        if active.turn_started {
            return Err("w3_duplicate_turn");
        }
        let (sender, receiver) = watch::channel(false);
        active.turn_started = true;
        active.cancel = Some(sender);
        (receiver, deadline)
    };
    // This process-wide allowance is consumed immediately before the first paid
    // stage. Provider failure and cancellation deliberately do not restore it.
    backend.allowance_used = backend.allowance_used.saturating_add(1);
    Ok((receiver, deadline))
}

fn store_user_turn(
    backend: &mut BackendState,
    session_id: &str,
    generation: u64,
    transcript: String,
) -> bool {
    if expire_session(backend) {
        return false;
    }
    let Some(session) = backend
        .session
        .as_mut()
        .filter(|session| session.id == session_id)
    else {
        return false;
    };
    // A replacement generation may already be active. The completed user
    // transcript is still retained, but no unheard assistant reply is added.
    session.store_user(generation, transcript);
    true
}

fn current_messages(
    backend: &mut BackendState,
    session_id: &str,
    generation: u64,
) -> Result<Vec<ChatMessage>, &'static str> {
    let session = require_session_mut(backend, session_id)?;
    let active = session
        .active
        .as_ref()
        .filter(|active| active.number == generation)
        .ok_or("w3_stale_generation")?;
    if active
        .cancel
        .as_ref()
        .is_some_and(|cancel| *cancel.borrow())
    {
        return Err("w3_cancelled");
    }
    Ok(session.messages())
}

fn ensure_current(
    backend: &mut BackendState,
    session_id: &str,
    generation: u64,
) -> Result<(), &'static str> {
    current_messages(backend, session_id, generation).map(|_| ())
}

fn finish_turn(
    backend: &mut BackendState,
    session_id: &str,
    generation: u64,
    reply: ModelReply,
) -> Result<(), &'static str> {
    let session = require_session_mut(backend, session_id)?;
    let active = session
        .active
        .as_mut()
        .filter(|active| active.number == generation)
        .ok_or("w3_stale_generation")?;
    if active
        .cancel
        .as_ref()
        .is_some_and(|cancel| *cancel.borrow())
    {
        return Err("w3_cancelled");
    }
    if active.pending.is_some() {
        return Err("w3_duplicate_turn");
    }
    active.pending = Some(reply);
    Ok(())
}

async fn run_stage<T, F>(
    cancel: &mut watch::Receiver<bool>,
    deadline: std::time::Instant,
    future: F,
) -> Result<T, &'static str>
where
    F: Future<Output = Result<T, &'static str>>,
{
    if *cancel.borrow() {
        return Err("w3_cancelled");
    }
    tokio::select! {
        biased;
        _ = tokio::time::sleep_until(tokio::time::Instant::from_std(deadline)) => Err("w3_session_expired"),
        _ = cancel.changed() => Err("w3_cancelled"),
        result = future => result,
    }
}

#[tauri::command]
pub(crate) fn w3_status(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, W3State>,
) -> Result<StatusReply, &'static str> {
    require_exact_ipc_keys(&request, &[])?;
    let inspected = inspect_runtime();
    let backend = state
        .inner
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let remaining_turns = remaining_turns(&backend);
    let mut missing = inspected.missing;
    if state.client.is_none() {
        missing.push("httpClient".to_owned());
    }
    if remaining_turns == 0 {
        missing.push(if backend.allowance_limit == 0 {
            "EVA_W3_MAX_TURNS".to_owned()
        } else {
            "turnAllowance".to_owned()
        });
    }
    Ok(StatusReply {
        ready: missing.is_empty(),
        missing,
        providers: inspected.providers,
        remaining_turns,
    })
}

#[tauri::command]
pub(crate) fn w3_start(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, W3State>,
) -> Result<StartReply, &'static str> {
    require_exact_ipc_keys(&request, &[])?;
    if inspect_runtime().config.is_none() || state.client.is_none() {
        return Err("w3_not_ready");
    }
    let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
    if remaining_turns(&backend) == 0 {
        return Err("w3_turn_allowance_exhausted");
    }
    Ok(StartReply {
        session_id: create_session(&mut backend),
    })
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn w3_advance(
    session_id: String,
    generation: u64,
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, W3State>,
) -> Result<(), &'static str> {
    require_exact_ipc_keys(&request, &["sessionId", "generation"])?;
    validate_generation(generation)?;
    if !valid_session_id(&session_id) {
        return Err("w3_invalid_session");
    }
    let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
    advance_generation(&mut backend, &session_id, generation)
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn w3_turn(
    session_id: String,
    generation: u64,
    wav_base64: String,
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, W3State>,
) -> Result<TurnReply, &'static str> {
    require_exact_ipc_keys(&request, &["sessionId", "generation", "wavBase64"])?;
    validate_generation(generation)?;
    if !valid_session_id(&session_id) {
        return Err("w3_invalid_session");
    }
    let wav = decode_wav(&wav_base64)?;
    // Drop the IPC base64 copy before network work. Cancellation drops the
    // remaining owned WAV/request buffers, but Rust allocators do not promise
    // that freed memory is immediately overwritten; renderer strings are also
    // subject to the WebView's garbage collector and cannot be zeroized here.
    drop(wav_base64);
    let config = inspect_runtime().config.ok_or("w3_not_ready")?;
    let client = state.client.clone().ok_or("w3_http_unavailable")?;

    let (mut cancel, deadline) = {
        let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
        begin_turn(&mut backend, &session_id, generation)?
    };

    let transcript = run_stage(&mut cancel, deadline, transcribe(&client, &config, wav)).await?;
    {
        let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
        if !store_user_turn(&mut backend, &session_id, generation, transcript.clone()) {
            return Err("w3_cancelled");
        }
    }

    // A current-generation check immediately precedes every subsequent paid
    // provider stage. It also builds the bounded context after transcription.
    let messages = {
        let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
        current_messages(&mut backend, &session_id, generation)?
    };
    let raw_decision = run_stage(
        &mut cancel,
        deadline,
        decide_conversation(&client, &config, &messages),
    )
    .await?;
    // The decider is not a policy boundary. Closed fields, enum membership,
    // intensity, plain speech, word/sentence limits, and factual-scope handling
    // are all enforced here after it returns.
    let reply = parse_model_reply(&raw_decision)?;

    {
        let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
        // Generation validity also remains outside and after the decider.
        ensure_current(&mut backend, &session_id, generation)?;
    }
    let audio = run_stage(&mut cancel, deadline, synthesize(&client, &config, &reply)).await?;
    let audio_base64 = STANDARD.encode(audio);

    // This final stale check and pending-record update happen atomically. The
    // renderer must still compare the returned IDs before starting playback.
    {
        let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
        finish_turn(&mut backend, &session_id, generation, reply.clone())?;
    }
    Ok(TurnReply {
        session_id,
        generation,
        transcript,
        reply: reply.reply,
        stance: reply.stance,
        intensity: reply.intensity,
        audio_base64,
        audio_mime: "audio/mpeg",
    })
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn w3_delivered(
    session_id: String,
    generation: u64,
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, W3State>,
) -> Result<(), &'static str> {
    require_exact_ipc_keys(&request, &["sessionId", "generation"])?;
    validate_generation(generation)?;
    if !valid_session_id(&session_id) {
        return Err("w3_invalid_session");
    }
    let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
    require_session_mut(&mut backend, &session_id)?.commit_pending(generation)
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn w3_end(
    session_id: String,
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, W3State>,
) -> Result<(), &'static str> {
    require_exact_ipc_keys(&request, &["sessionId"])?;
    if !valid_session_id(&session_id) {
        return Err("w3_invalid_session");
    }
    let mut backend = state.inner.lock().map_err(|_| "w3_unavailable")?;
    end_session(&mut backend, &session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Delivery, Scope, Stance};

    fn model_reply(text: &str) -> ModelReply {
        ModelReply {
            reply: text.into(),
            stance: Stance::Attentive,
            intensity: 0.4,
            delivery: Delivery::Warm,
            scope: Scope::Conversation,
        }
    }

    fn backend(limit: u8) -> BackendState {
        BackendState {
            allowance_limit: limit,
            allowance_used: 0,
            session: None,
            last_invalidated_session_id: None,
        }
    }

    #[test]
    fn process_allowance_defaults_closed_and_never_exceeds_ten() {
        assert_eq!(allowance_from_value(None), 0);
        assert_eq!(allowance_from_value(Some("")), 0);
        assert_eq!(allowance_from_value(Some("invalid")), 0);
        assert_eq!(allowance_from_value(Some("0")), 0);
        assert_eq!(allowance_from_value(Some("10")), 10);
        assert_eq!(allowance_from_value(Some("11")), 0);
    }

    #[test]
    fn runtime_ipc_bodies_require_exact_camel_case_keys() {
        use tauri::ipc::InvokeBody;

        assert!(require_exact_ipc_body(&InvokeBody::Json(serde_json::json!({})), &[]).is_ok());
        assert!(require_exact_ipc_body(
            &InvokeBody::Json(serde_json::json!({"sessionId": "id"})),
            &["sessionId"]
        )
        .is_ok());
        assert!(require_exact_ipc_body(
            &InvokeBody::Json(serde_json::json!({"sessionId": "id", "generation": 0})),
            &["sessionId", "generation"]
        )
        .is_ok());
        assert!(require_exact_ipc_body(
            &InvokeBody::Json(serde_json::json!({
                "sessionId": "id",
                "generation": 0,
                "wavBase64": "wave"
            })),
            &["sessionId", "generation", "wavBase64"]
        )
        .is_ok());

        for (body, expected) in [
            (serde_json::json!({"extra": true}), Vec::<&str>::new()),
            (
                serde_json::json!({"sessionId": "id", "model": "gpt-x"}),
                vec!["sessionId"],
            ),
            (
                serde_json::json!({"session_id": "id", "generation": 0}),
                vec!["sessionId", "generation"],
            ),
            (
                serde_json::json!({"sessionId": "id", "generation": 0, "text": "speak"}),
                vec!["sessionId", "generation"],
            ),
            (
                serde_json::json!({
                    "sessionId": "id",
                    "generation": 0,
                    "wavBase64": "wave",
                    "url": "https://example.com"
                }),
                vec!["sessionId", "generation", "wavBase64"],
            ),
        ] {
            assert_eq!(
                require_exact_ipc_body(&InvokeBody::Json(body), &expected),
                Err("w3_invalid_request")
            );
        }
        assert_eq!(
            require_exact_ipc_body(&InvokeBody::Raw(vec![1, 2, 3]), &[]),
            Err("w3_invalid_request")
        );
    }

    #[test]
    fn generation_is_bounded_to_javascript_safe_integers() {
        assert!(validate_generation(0).is_ok());
        assert!(validate_generation(MAX_JS_SAFE_INTEGER).is_ok());
        assert_eq!(
            validate_generation(MAX_JS_SAFE_INTEGER + 1),
            Err("w3_invalid_generation")
        );
        assert_eq!(validate_generation(u64::MAX), Err("w3_invalid_generation"));
    }

    #[test]
    fn generation_starts_at_zero_and_strictly_increases() {
        let mut backend = backend(3);
        let id = create_session(&mut backend);
        assert_eq!(
            advance_generation(&mut backend, &id, 1),
            Err("w3_generation_must_start_at_zero")
        );
        advance_generation(&mut backend, &id, 0).unwrap();
        assert_eq!(
            advance_generation(&mut backend, &id, 0),
            Err("w3_generation_not_increasing")
        );
        advance_generation(&mut backend, &id, 2).unwrap();
        assert_eq!(
            advance_generation(&mut backend, &id, 1),
            Err("w3_generation_not_increasing")
        );
    }

    #[test]
    fn allowance_is_consumed_once_before_a_turn_and_not_restored() {
        let mut backend = backend(1);
        let id = create_session(&mut backend);
        advance_generation(&mut backend, &id, 0).unwrap();
        let _permit = begin_turn(&mut backend, &id, 0).unwrap();
        assert_eq!(remaining_turns(&backend), 0);
        assert_eq!(
            begin_turn(&mut backend, &id, 0).unwrap_err(),
            "w3_turn_allowance_exhausted"
        );
        advance_generation(&mut backend, &id, 1).unwrap();
        assert_eq!(
            begin_turn(&mut backend, &id, 1).unwrap_err(),
            "w3_turn_allowance_exhausted"
        );
    }

    #[test]
    fn duplicate_turns_are_rejected_even_with_allowance_remaining() {
        let mut backend = backend(3);
        let id = create_session(&mut backend);
        advance_generation(&mut backend, &id, 0).unwrap();
        let _permit = begin_turn(&mut backend, &id, 0).unwrap();
        assert_eq!(
            begin_turn(&mut backend, &id, 0).unwrap_err(),
            "w3_duplicate_turn"
        );
        assert_eq!(remaining_turns(&backend), 2);
    }

    #[tokio::test]
    async fn advancing_aborts_the_previous_generation_signal() {
        let mut backend = backend(3);
        let id = create_session(&mut backend);
        advance_generation(&mut backend, &id, 0).unwrap();
        let (mut cancel, _) = begin_turn(&mut backend, &id, 0).unwrap();
        assert!(!*cancel.borrow());
        advance_generation(&mut backend, &id, 1).unwrap();
        cancel.changed().await.unwrap();
        assert!(*cancel.borrow());
    }

    #[tokio::test]
    async fn session_expiry_cancels_active_work() {
        let mut backend = backend(3);
        let id = create_session(&mut backend);
        advance_generation(&mut backend, &id, 0).unwrap();
        let (mut cancel, _) = begin_turn(&mut backend, &id, 0).unwrap();
        backend.session.as_mut().unwrap().started_at = std::time::Instant::now() - SESSION_LIMIT;
        assert!(expire_session(&mut backend));
        cancel.changed().await.unwrap();
        assert!(*cancel.borrow());
        assert!(backend.session.is_none());
    }

    #[test]
    fn end_is_idempotent_for_its_own_ended_or_expired_session() {
        let mut backend = backend(3);
        let first = create_session(&mut backend);
        end_session(&mut backend, &first).unwrap();
        assert!(backend.session.is_none());
        end_session(&mut backend, &first).unwrap();

        let expired = create_session(&mut backend);
        backend.session.as_mut().unwrap().started_at = std::time::Instant::now() - SESSION_LIMIT;
        end_session(&mut backend, &expired).unwrap();
        assert!(backend.session.is_none());
        end_session(&mut backend, &expired).unwrap();
    }

    #[test]
    fn end_rejects_a_different_active_or_unknown_session() {
        let mut backend = backend(3);
        let active = create_session(&mut backend);
        let other = if active == "f".repeat(32) {
            "e".repeat(32)
        } else {
            "f".repeat(32)
        };
        assert_eq!(end_session(&mut backend, &other), Err("w3_invalid_session"));
        assert_eq!(backend.session.as_ref().unwrap().id, active);
        end_session(&mut backend, &active).unwrap();
        assert_eq!(end_session(&mut backend, &other), Err("w3_invalid_session"));
    }

    #[tokio::test]
    async fn stage_deadline_stops_work_at_the_session_limit() {
        let (_sender, mut cancel) = watch::channel(false);
        let result = run_stage(
            &mut cancel,
            std::time::Instant::now() - Duration::from_millis(1),
            std::future::pending::<Result<(), &'static str>>(),
        )
        .await;
        assert_eq!(result, Err("w3_session_expired"));
    }

    #[test]
    fn interruption_preserves_user_text_but_not_unheard_assistant_text() {
        let mut backend = backend(3);
        let id = create_session(&mut backend);
        advance_generation(&mut backend, &id, 0).unwrap();
        let _permit = begin_turn(&mut backend, &id, 0).unwrap();
        assert!(store_user_turn(
            &mut backend,
            &id,
            0,
            "I had a difficult day.".into()
        ));
        finish_turn(
            &mut backend,
            &id,
            0,
            model_reply("I hear how difficult that was."),
        )
        .unwrap();

        advance_generation(&mut backend, &id, 1).unwrap();
        let messages = current_messages(&mut backend, &id, 1).unwrap();
        assert_eq!(
            messages,
            vec![ChatMessage {
                role: ChatRole::User,
                content: "I had a difficult day.".into()
            }]
        );
    }

    #[test]
    fn delivered_context_allows_ten_process_turns_while_history_stays_at_eight() {
        let mut backend = backend(MAX_PROCESS_TURNS);
        let id = create_session(&mut backend);
        for generation in 0..MAX_PROCESS_TURNS as u64 {
            advance_generation(&mut backend, &id, generation).unwrap();
            let _permit = begin_turn(&mut backend, &id, generation).unwrap();
            assert!(store_user_turn(
                &mut backend,
                &id,
                generation,
                format!("User turn {generation}.")
            ));
            finish_turn(
                &mut backend,
                &id,
                generation,
                model_reply(&format!("Assistant turn {generation}.")),
            )
            .unwrap();
            require_session_mut(&mut backend, &id)
                .unwrap()
                .commit_pending(generation)
                .unwrap();
        }
        {
            let session = require_session_mut(&mut backend, &id).unwrap();
            assert_eq!(session.delivered_turns, MAX_PROCESS_TURNS);
            assert_eq!(session.history.len(), MAX_HISTORY_TURNS);
            assert_eq!(session.history.first().unwrap().generation, 2);
            assert_eq!(
                session.commit_pending((MAX_PROCESS_TURNS - 1) as u64),
                Err("w3_response_not_pending")
            );
            session.advance(MAX_PROCESS_TURNS as u64).unwrap();
        }
        assert_eq!(
            begin_turn(&mut backend, &id, MAX_PROCESS_TURNS as u64).unwrap_err(),
            "w3_turn_allowance_exhausted"
        );
    }

    #[test]
    fn bounded_history_keeps_at_most_eight_user_turns() {
        let mut session = Session::new("test".into());
        for generation in 0..12 {
            session.store_user(generation, format!("Turn {generation}."));
        }
        assert_eq!(session.history.len(), MAX_HISTORY_TURNS);
        assert_eq!(session.history.first().unwrap().generation, 4);
        assert_eq!(session.history.last().unwrap().generation, 11);
    }

    #[test]
    fn session_ids_are_local_opaque_values() {
        let mut backend = backend(1);
        let id = create_session(&mut backend);
        assert!(valid_session_id(&id));
        for invalid in ["", "session", "../private", "g".repeat(32).as_str()] {
            assert!(!valid_session_id(invalid));
        }
    }
}
