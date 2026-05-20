"""
CIARA — Backend Server (Agentic)
=====================================
WebSocket server that:
  1. Receives audio from Electron → detects wake word → transcribes speech
  2. Passes transcribed text to the Agent Loop (perception + planning + tools)
  3. Streams UI state updates back to the Electron overlay
"""

import asyncio
import websockets
import json
import base64
import wave
import io
import struct
import time
import numpy as np
import sys
import os
import uuid
from functools import partial

from dotenv import load_dotenv

# Force print to flush immediately so Electron gets the logs in real-time
print = partial(print, flush=True)

AGENT_TEXT_TIMEOUT_SECONDS = int(os.getenv("CIARA_AGENT_TEXT_TIMEOUT_SECONDS", "180"))

# Ensure the backend package root is on sys.path so 'agent', 'tools', etc. resolve
# regardless of the working directory (Electron launches with cwd = project root).
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

load_dotenv(os.path.join(_backend_dir, ".env"))

from runtime_paths import ensure_ciara_data_layout

_data_root = ensure_ciara_data_layout()
print(f"[Local] CIARA local data directory: {_data_root}")

# Voice libraries (soft import — server still starts if missing, wake word is just disabled)
try:
    import pvporcupine
except ImportError:
    pvporcupine = None
    print("[Voice] pvporcupine not installed — wake word will be disabled")
import speech_recognition as sr

# CIARA Agent (V2 runtime)
from agent import create_agent
import agent.perception as perception
from runtime_state import runtime_state_store
from voice.tts import get_tts_engine, prepare_for_speech
from voice.transcription import transcribe_wav_bytes
from servers.browser_bridge_server import BRIDGE_HOST, BRIDGE_PORT, bridge_handler
from browser import BrowserResolver, browser_bridge, browser_store, ActionRequest
from browser.selector_ai import build_ranked_candidates, select_browser_candidate_with_flash
from servers.local_augment import build_agent_user_message_with_vault
from tools.registry import set_tool_run_context
from reliability import with_timeout_retry

# Agent version toggle (deprecated compatibility env; V2 is always used)
AGENT_VERSION = os.environ.get("CIARA_AGENT_VERSION", "v2")

# Picovoice access key (loaded from .env)
PICOVOICE_ACCESS_KEY = os.environ.get("PICOVOICE_ACCESS_KEY", "")

browser_resolver = BrowserResolver()


def _map_user_action_to_text(action: str) -> str:
    normalized = (action or "").strip().lower()
    if not normalized:
        return ""
    if normalized == "approve_plan":
        return "proceed"
    if normalized == "cancel_plan":
        return "cancel"
    return normalized


def _is_screen_read_request(text: str) -> bool:
    normalized = (text or "").strip().lower()
    if not normalized:
        return False
    screen_phrases = (
        "what's on my screen",
        "whats on my screen",
        "what is on my screen",
        "what do you see",
        "what can you see",
        "describe my screen",
        "describe what's on my screen",
        "describe whats on my screen",
        "read my screen",
        "look at my screen",
    )
    return any(phrase in normalized for phrase in screen_phrases)


def _is_cursor_demo_request(text: str) -> bool:
    normalized = " ".join((text or "").strip().lower().split())
    if not normalized:
        return False
    phrases = (
        "open cursor",
        "show cursor",
        "open ciara cursor",
        "show ciara cursor",
        "bring up cursor",
        "display cursor",
    )
    return normalized in phrases


def _clean_screen_read_response(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return "I could not read the screen."

    final_markers = [
        "\nThe screen shows ",
        "\nYour screen shows ",
        "\nI can see ",
        "\nCurrently, your screen ",
    ]
    lower = cleaned.lower()
    marker_positions = [
        lower.rfind(marker.lower())
        for marker in final_markers
        if lower.rfind(marker.lower()) >= 0
    ]
    if marker_positions:
        cleaned = cleaned[max(marker_positions):].strip()

    leaked_prefixes = (
        "the user wants",
        "i need to",
        "1.  **analyze",
        "analyze the image",
    )
    if cleaned.lower().startswith(leaked_prefixes):
        if "\n\n" in cleaned:
            cleaned = cleaned.split("\n\n", 1)[1].strip()
        lines = [line for line in cleaned.splitlines() if line.strip()]
        useful = []
        capture = False
        for line in lines:
            lowered = line.strip().lower()
            if lowered.startswith(("the screen shows", "your screen shows", "i can see", "currently")):
                capture = True
            if capture:
                useful.append(line)
        cleaned = "\n".join(useful).strip() or cleaned

    max_len = 1800
    if len(cleaned) <= max_len:
        return cleaned
    clipped = cleaned[:max_len]
    sentence_end = max(clipped.rfind("."), clipped.rfind("!"), clipped.rfind("?"))
    if sentence_end > 800:
        return clipped[:sentence_end + 1].strip()
    return clipped.rstrip() + "..."


async def _send_json(websocket, payload: dict, *, timeout_s: float = 2.5, attempts: int = 2) -> None:
    async def _op():
        return await websocket.send(json.dumps(payload))

    await with_timeout_retry(
        "websocket.send",
        _op,
        timeout_s=timeout_s,
        attempts=attempts,
    )


async def _read_screen_without_blocking_server(question: str) -> str:
    """Run vision screen reading away from the websocket event loop."""
    from tools.mac_tools import read_screen

    return await asyncio.to_thread(lambda: asyncio.run(read_screen(question)))


class VoiceAssistant:
    def __init__(self):
        self.state = "IDLE"  # IDLE, LISTENING, LOADING, DOING
        self.porcupine = None
        self.agent = create_agent(AGENT_VERSION)
        print("[Server] Agent initialized: V2")
        
        # We try to initialize Porcupine, but it will fail if the key is default
        try:
            if pvporcupine is None:
                print("[Voice] ⚠ pvporcupine not available — wake word disabled")
            elif not PICOVOICE_ACCESS_KEY or PICOVOICE_ACCESS_KEY == "YOUR_PICOVOICE_ACCESS_KEY_HERE":
                print("[Voice] ⚠ Picovoice Access Key not set — wake word disabled")
                print(f"[Voice]   PICOVOICE_ACCESS_KEY = '{PICOVOICE_ACCESS_KEY[:8]}…' (len={len(PICOVOICE_ACCESS_KEY)})")
            else:
                # Look for the .ppn file in the project root (one level above _backend_dir)
                project_root = os.path.abspath(os.path.join(_backend_dir, ".."))
                custom_ppn = os.path.join(project_root, "hey_ciara.ppn")
                # Also check inside the servers directory (bundled copy)
                servers_ppn = os.path.join(os.path.dirname(__file__), "hey_ciara.ppn")
                ppn_path = custom_ppn if os.path.exists(custom_ppn) else (servers_ppn if os.path.exists(servers_ppn) else None)

                print(f"[Voice] Picovoice key: {PICOVOICE_ACCESS_KEY[:12]}… (len={len(PICOVOICE_ACCESS_KEY)})")
                print(f"[Voice] PPn search: project_root={custom_ppn} exists={os.path.exists(custom_ppn)}")
                print(f"[Voice] PPn search: servers_dir={servers_ppn} exists={os.path.exists(servers_ppn)}")

                if ppn_path:
                    self.porcupine = pvporcupine.create(
                        access_key=PICOVOICE_ACCESS_KEY,
                        keyword_paths=[ppn_path]
                    )
                    print(f"[Voice] ✓ Porcupine initialized with 'Hey CIARA' from {ppn_path}")
                else:
                    self.porcupine = pvporcupine.create(
                        access_key=PICOVOICE_ACCESS_KEY,
                        keywords=["porcupine"]
                    )
                    print("[Voice] ⚠ hey_ciara.ppn not found — using built-in 'Porcupine' keyword")
                    print(f"[Voice]   Searched: {custom_ppn}")
                    print(f"[Voice]   Searched: {servers_ppn}")
        except Exception as e:
            print(f"[Voice] ✗ Porcupine init failed: {e}")

        # For capturing the command after wake
        self.audio_buffer = bytearray()
        self.recognizer = sr.Recognizer()
        self.consecutive_silence_chunks = 0
        self.SILENCE_THRESHOLD_CHUNKS = 7  # Approx 0.45 seconds of sustained silence
        self.MIN_BUFFER_SIZE = 16000 * 2 * 0.3  # Min 0.3 seconds of audio
        self.grace_chunks_remaining = 0  # Grace period after await_reply
        self.waiting_for_voice = False  # True = require voice onset before recording
        self.waiting_for_reply = False  # True = do not abort on STT silence

        # Conversation mode: user can talk without saying the wake word each time
        self.conversation_mode = False
        self.conversation_mode_timeout = 120  # seconds of silence before auto-off
        self._conversation_timer = None

        # TTS state: mute mic while speaking to prevent feedback
        self.tts_playing = False

        # Active agent task for interrupt support
        self._active_task: asyncio.Task | None = None
        self._active_websocket = None
        self._active_task_id: str | None = None

    async def run_agent_text(self, websocket, text: str):
        print(f"=> INPUT: {text}")
        task_id = f"task-{uuid.uuid4().hex[:10]}"
        self._active_task_id = task_id
        self._active_task = asyncio.current_task()
        await websocket.send(json.dumps({
            "type": "task_event",
            "phase": "start",
            "taskId": task_id,
            "text": text,
        }))

        async def ws_callback(msg: dict):
            try:
                if self._active_task_id != task_id:
                    print(f"[WS Callback] Dropping stale message for {task_id}")
                    return
                if isinstance(msg, dict):
                    msg.setdefault("taskId", task_id)
                await _send_json(websocket, msg)
            except Exception as e:
                print(f"[WS Callback] Error sending: {e}")

        set_tool_run_context(task_id, ws_callback)

        try:
            if _is_cursor_demo_request(text):
                await ws_callback({
                    "type": "tool_event",
                    "phase": "start",
                    "actionId": f"{task_id}:demo-cursor",
                    "tool": "show_cursor",
                })
                await ws_callback({
                    "type": "automation_cursor",
                    "payload": {
                        "action": "move",
                        "x": 0,
                        "y": 0,
                        "position": "center",
                        "label": "CIARA",
                        "autoHideMs": 5200,
                    },
                })
                await ws_callback({
                    "type": "tool_event",
                    "phase": "result",
                    "actionId": f"{task_id}:demo-cursor",
                    "tool": "show_cursor",
                    "ok": True,
                    "durationMs": 0,
                    "result": "Cursor preview shown.",
                })
                result = ("Cursor preview is open.", False)
            else:
                context = await perception.snapshot(text)

                # Vault RAG (TF-IDF over local vault files)
                user_message = build_agent_user_message_with_vault(self.agent, text)

                # Pass conversation-mode flag so the agent can tailor responses
                self.agent._conversation_mode = self.conversation_mode

                result = await self.agent.run(user_message, context, ws_callback=ws_callback)
        finally:
            if self._active_task_id == task_id:
                await _send_json(websocket, {
                    "type": "task_event",
                    "phase": "result",
                    "taskId": task_id,
                })
                self._active_task_id = None
                self._active_task = None
                set_tool_run_context("", None)

        if isinstance(result, tuple):
            response_text, awaiting_reply = result
        else:
            response_text = str(result)
            awaiting_reply = False

        if "[CONVERSATION_MODE_ON]" in (response_text or ""):
            self.conversation_mode = True
            print("[Backend] 🗣 Conversation mode ENABLED")
            await _send_json(websocket, {
                "type": "conversation_mode", "enabled": True
            })
        elif "[CONVERSATION_MODE_OFF]" in (response_text or ""):
            self.conversation_mode = False
            print("[Backend] 🔇 Conversation mode DISABLED")
            await _send_json(websocket, {
                "type": "conversation_mode", "enabled": False
            })

        # Stream TTS for the response
        clean_response = (response_text or "").replace("[CONVERSATION_MODE_ON]", "").replace("[CONVERSATION_MODE_OFF]", "").strip()
        if clean_response:
            await self._stream_tts(websocket, clean_response)

        if awaiting_reply:
            print("[Backend] Agent awaiting reply — listening without wake word")
            self.state = "LISTENING"
            self.audio_buffer = bytearray()
            self.consecutive_silence_chunks = 0
            self.grace_chunks_remaining = 64
            self.waiting_for_voice = True
            self.waiting_for_reply = True
            return

        if self.conversation_mode:
            print("[Backend] 🗣 Conversation mode — listening for next input")
            self.state = "LISTENING"
            self.audio_buffer = bytearray()
            self.consecutive_silence_chunks = 0
            self.grace_chunks_remaining = 48
            self.waiting_for_voice = True
            self.waiting_for_reply = False
            self._reset_conversation_timer()
            return

        self.waiting_for_reply = False
        self.state = "IDLE"
        self.audio_buffer = bytearray()

    # ── TTS Streaming ──

    async def start_agent_text_task(self, websocket, text: str, source: str = "text_input"):
        """Run an agent request in the background so cancel_task can interrupt it."""
        if self._active_task and not self._active_task.done():
            await self.cancel_active_task(websocket)

        async def runner():
            try:
                await asyncio.wait_for(
                    self.run_agent_text(websocket, text),
                    timeout=AGENT_TEXT_TIMEOUT_SECONDS,
                )
            except asyncio.CancelledError:
                print(f"[Backend] {source} cancelled")
                raise
            except asyncio.TimeoutError:
                print(f"[Backend] {source} timed out after {AGENT_TEXT_TIMEOUT_SECONDS}s")
                self.state = "IDLE"
                self.waiting_for_reply = False
                self.audio_buffer = bytearray()
                await websocket.send(json.dumps({
                    "type": "response",
                    "payload": {"text": "CIARA took too long to respond, so I stopped that task.", "app": ""}
                }))
                await websocket.send(json.dumps({"type": "status", "state": "state-idle"}))
            except Exception as e:
                print(f"[Backend] {source} error: {e}")
                self.state = "IDLE"
                self.waiting_for_reply = False
                self.audio_buffer = bytearray()
                await websocket.send(json.dumps({
                    "type": "response",
                    "payload": {"text": "CIARA hit an internal error while processing that request.", "app": ""}
                }))
                await websocket.send(json.dumps({"type": "status", "state": "state-idle"}))

        self.state = "LOADING"
        await websocket.send(json.dumps({
            "type": "progress", "state": "state-loading"
        }))
        self._active_task = asyncio.create_task(runner())

    async def _stream_tts(self, websocket, text: str):
        """Stream TTS audio sentence-by-sentence to the renderer."""
        if not text or len(text.strip()) < 3:
            return
        try:
            tts = get_tts_engine()
            speech_text = prepare_for_speech(text)
            if not speech_text:
                return

            self.tts_playing = True
            async for chunk in tts.stream_synthesize(speech_text):
                msg = chunk.to_ws_message()
                await websocket.send(json.dumps(msg))

            await websocket.send(json.dumps({"type": "tts_done"}))
        except Exception as e:
            print(f"[TTS] Streaming error: {e}")
        finally:
            self.tts_playing = False

    # ── Interrupt / Cancel ──

    async def cancel_active_task(self, websocket=None):
        """Cancel the currently running agent task."""
        ws = websocket or self._active_websocket
        print("[Backend] ⛔ Cancelling active task")
        runtime_state_store.cancel_request()
        cancelled_task_id = self._active_task_id
        self._active_task_id = None
        set_tool_run_context("", None)

        if self._active_task and not self._active_task.done():
            self._active_task.cancel()
            self._active_task = None

        # Stop any TTS playback on the renderer
        self.tts_playing = False
        if ws:
            try:
                if cancelled_task_id:
                    await ws.send(json.dumps({
                        "type": "task_event",
                        "phase": "cancelled",
                        "taskId": cancelled_task_id,
                    }))
                await ws.send(json.dumps({"type": "tts_stop"}))
                await ws.send(json.dumps({"type": "status", "state": "state-idle"}))
            except Exception:
                pass

        self.state = "IDLE" if not self.conversation_mode else "LISTENING"

    # ── Conversation Mode ──

    def toggle_conversation_mode(self) -> bool:
        """Toggle conversation mode on/off. Returns the new state."""
        self.conversation_mode = not self.conversation_mode
        if self.conversation_mode:
            print("[Backend] 🗣 Conversation mode ENABLED (user toggle)")
            self._reset_conversation_timer()
        else:
            print("[Backend] 🔇 Conversation mode DISABLED (user toggle)")
            self._cancel_conversation_timer()
        return self.conversation_mode

    def _reset_conversation_timer(self):
        """Reset the auto-off timer for conversation mode."""
        self._cancel_conversation_timer()
        loop = asyncio.get_event_loop()
        self._conversation_timer = loop.call_later(
            self.conversation_mode_timeout,
            lambda: asyncio.ensure_future(self._conversation_timeout())
        )

    def _cancel_conversation_timer(self):
        """Cancel any pending conversation mode timeout."""
        if self._conversation_timer:
            self._conversation_timer.cancel()
            self._conversation_timer = None

    async def _conversation_timeout(self):
        """Auto-disable conversation mode after silence timeout."""
        if not self.conversation_mode:
            return
        print(f"[Backend] ⏰ Conversation mode auto-off after {self.conversation_mode_timeout}s silence")
        self.conversation_mode = False
        self._conversation_timer = None
        ws = self._active_websocket
        if ws:
            try:
                await ws.send(json.dumps({"type": "conversation_mode", "enabled": False}))
                if self.state != "DOING":
                    self.state = "IDLE"
                    await ws.send(json.dumps({"type": "status", "state": "state-idle"}))
            except Exception:
                pass

    async def handle_audio_chunk(self, websocket, b64_payload):
        """Decode base64 WAV, strip header, get raw PCM bytes."""
        # Mute mic pipeline while TTS is playing to prevent feedback
        if self.tts_playing:
            return

        try:
            wav_bytes = base64.b64decode(b64_payload)
            
            # Use Python's wave module to read the WAV chunk
            with wave.open(io.BytesIO(wav_bytes), 'rb') as w:
                pcm_data = w.readframes(w.getnframes())
            
            if self.state == "IDLE":
                await self.process_wake_word(websocket, pcm_data)
            elif self.state == "LISTENING":
                await self.buffer_command(websocket, pcm_data)
                
        except Exception as e:
            print(f"Error processing audio chunk: {e}")

    async def process_wake_word(self, websocket, pcm_data):
        """Feed audio frames into Porcupine to detect wake word."""
        if not self.porcupine:
            return  # Can't detect without the engine

        chunk_size = 1024
        for i in range(0, len(pcm_data), chunk_size):
            chunk = pcm_data[i:i+chunk_size]
            if len(chunk) == chunk_size:
                pcm_tuple = struct.unpack_from("h" * self.porcupine.frame_length, chunk)
                
                keyword_index = self.porcupine.process(pcm_tuple)
                if keyword_index >= 0:
                    print("=> WAKE WORD DETECTED!")
                    self.state = "LISTENING"
                    self.audio_buffer = bytearray()
                    await websocket.send(json.dumps({
                        "type": "status", "state": "state-listening"
                    }))
                    break

    async def buffer_command(self, websocket, pcm_data):
        """Buffer incoming audio while listening, detect silence to stop."""

        # Grace period: discard audio (don't buffer silence before user speaks)
        if self.grace_chunks_remaining > 0:
            self.grace_chunks_remaining -= 1
            return

        # Calculate RMS of the incoming chunk
        ints = np.frombuffer(pcm_data, dtype=np.int16)
        if len(ints) == 0:
            return
        rms = np.sqrt(np.mean(ints.astype(np.float32)**2))

        # Phase 1: Wait for voice onset (after await_reply grace period)
        # Don't buffer until we hear actual speech — avoids capturing
        # silence or quiet system audio (e.g. YouTube playing)
        if self.waiting_for_voice:
            if rms > 1500:  # Voice onset threshold (significantly higher to filter out speaker audio bleed)
                print(f"[Audio] Voice detected (RMS={rms:.0f}), recording...")
                self.waiting_for_voice = False
                self.audio_buffer.extend(pcm_data)
            return  # Skip until voice detected

        # Phase 2: Normal buffering + silence detection
        self.audio_buffer.extend(pcm_data)

        if rms < 250:
            self.consecutive_silence_chunks += 1
        else:
            self.consecutive_silence_chunks = 0

        if len(self.audio_buffer) > self.MIN_BUFFER_SIZE:
            if self.consecutive_silence_chunks >= self.SILENCE_THRESHOLD_CHUNKS:
                print(f"=> SUSTAINED SILENCE ({self.consecutive_silence_chunks} chunks). Processing Command...")
                self.state = "LOADING"
                self.consecutive_silence_chunks = 0
                await websocket.send(json.dumps({
                    "type": "progress", "state": "state-loading"
                }))
                
                # Start processing the audio asynchronously
                asyncio.create_task(self.transcribe_and_act(websocket))

    async def transcribe_and_act(self, websocket):
        """
        Run Speech-to-Text on the buffered audio, then hand off
        to the agentic pipeline.
        """
        print(f"Transcribing {len(self.audio_buffer)} bytes of audio...")
        
        try:
            # Wrap raw PCM buffer into WAV for SpeechRecognition
            wav_io = io.BytesIO()
            with wave.open(wav_io, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)  # 16-bit
                w.setframerate(16000)
                w.writeframes(self.audio_buffer)
            wav_io.seek(0)

            try:
                text = await transcribe_wav_bytes(wav_io.getvalue(), self.recognizer)
                print(f"=> TRANSCRIBED: {text}")
                
                # ════════════════════════════════════════════
                #  Voice interrupt: if agent is working and user
                #  says "stop"/"cancel", cancel the task instead
                #  of queueing a new agent run.
                # ════════════════════════════════════════════
                _cancel_words = {"stop", "cancel", "never mind", "nevermind", "abort", "quit"}
                if self.state == "DOING" or self._active_task and not self._active_task.done():
                    normalized = text.strip().lower()
                    if normalized in _cancel_words or any(normalized.startswith(w) for w in _cancel_words):
                        print(f"[Backend] ⛔ Voice interrupt: '{text}' → cancelling task")
                        await self.cancel_active_task(websocket)
                        await websocket.send(json.dumps({
                            "type": "response",
                            "payload": {"text": "Stopped — let me know if you need anything else.", "app": ""}
                        }))
                        self.state = "IDLE" if not self.conversation_mode else "LISTENING"
                        if self.conversation_mode:
                            self.audio_buffer = bytearray()
                            self.consecutive_silence_chunks = 0
                            self.grace_chunks_remaining = 32
                            self.waiting_for_voice = True
                            self._reset_conversation_timer()
                            await websocket.send(json.dumps({"type": "status", "state": "state-listening"}))
                        return
                
                # ════════════════════════════════════════════
                #  AGENTIC PIPELINE — This is where the magic happens
                # ════════════════════════════════════════════
                
                await self.run_agent_text(websocket, text)
                if self.state != "IDLE":
                    return
                
            except sr.UnknownValueError:
                print("Speech-to-text could not understand audio")
                # If we were in an await_reply loop or conversation mode, keep listening
                if getattr(self, "waiting_for_reply", False) or self.conversation_mode:
                    print("[Backend] Keeping microphone open (conversation mode or await reply)...")
                    self.state = "LISTENING"
                    self.audio_buffer = bytearray()
                    self.consecutive_silence_chunks = 0
                    self.grace_chunks_remaining = 0
                    self.waiting_for_voice = True
                    await websocket.send(json.dumps({
                        "type": "status", "state": "state-listening"
                    }))
                    return
                # Otherwise, it was a wake word trigger that failed, reset to idle
                await websocket.send(json.dumps({
                    "type": "response",
                    "payload": {"text": "Sorry, I didn't catch that.", "app": ""}
                }))
                
            except sr.RequestError as e:
                print(f"Speech-to-text network error: {e}")
                if self.conversation_mode:
                    print("[Backend] Network error but conversation mode on — keeping mic open")
                    self.state = "LISTENING"
                    self.audio_buffer = bytearray()
                    self.consecutive_silence_chunks = 0
                    self.grace_chunks_remaining = 16
                    self.waiting_for_voice = True
                    await websocket.send(json.dumps({
                        "type": "status", "state": "state-listening"
                    }))
                    return
                await websocket.send(json.dumps({
                    "type": "response",
                    "payload": {"text": "Network error processing speech.", "app": ""}
                }))

        except Exception as e:
            print(f"Transcription error: {e}")
            if self.conversation_mode:
                print("[Backend] Error but conversation mode on — keeping mic open")
                self.state = "LISTENING"
                self.audio_buffer = bytearray()
                self.consecutive_silence_chunks = 0
                self.grace_chunks_remaining = 16
                self.waiting_for_voice = True
                try:
                    await websocket.send(json.dumps({
                        "type": "status", "state": "state-listening"
                    }))
                except Exception:
                    pass
                return
            await websocket.send(json.dumps({
                "type": "response",
                "payload": {"text": "Internal error.", "app": ""}
            }))

        # Reset state
        self.state = "IDLE"
        self.audio_buffer = bytearray()


async def main_handler(websocket):
    print("Electron App Connected!")
    assistant = VoiceAssistant()
    assistant._active_websocket = websocket
    await assistant.agent.router.initialize()

    # Initialize UI
    try:
        await websocket.send(json.dumps({"type": "status", "state": "state-idle"}))
        
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")
                
                if msg_type == "audio_chunk":
                    await assistant.handle_audio_chunk(websocket, data.get("payload", ""))
                elif msg_type == "cancel_task":
                    await assistant.cancel_active_task(websocket)
                elif msg_type == "toggle_conversation_mode":
                    enabled = assistant.toggle_conversation_mode()
                    await websocket.send(json.dumps({
                        "type": "conversation_mode", "enabled": enabled
                    }))
                    if enabled:
                        # Immediately start listening (no wake word needed)
                        assistant.state = "LISTENING"
                        assistant.audio_buffer = bytearray()
                        assistant.consecutive_silence_chunks = 0
                        assistant.grace_chunks_remaining = 32
                        assistant.waiting_for_voice = True
                        await websocket.send(json.dumps({
                            "type": "status", "state": "state-listening"
                        }))
                    else:
                        assistant.state = "IDLE"
                        await websocket.send(json.dumps({
                            "type": "status", "state": "state-idle"
                        }))
                elif msg_type == "tts_done":
                    # Renderer finished playing all TTS audio
                    assistant.tts_playing = False
                elif msg_type == "text_input":
                    text = (data.get("text") or "").strip()
                    if text:
                        assistant.state = "LOADING"
                        await websocket.send(json.dumps({
                            "type": "progress", "state": "state-loading"
                        }))
                        try:
                            if _is_screen_read_request(text):
                                await websocket.send(json.dumps({
                                    "type": "doing",
                                    "text": "Reading your screen",
                                    "tool": "read_screen",
                                    "variant": "",
                                }))
                                result = await asyncio.wait_for(
                                    _read_screen_without_blocking_server(text),
                                    timeout=60,
                                )
                                result = _clean_screen_read_response(result)
                                assistant.state = "IDLE"
                                await websocket.send(json.dumps({
                                    "type": "response",
                                    "payload": {
                                        "modal": "text",
                                        "message": result,
                                        "display": "card",
                                        "app": "",
                                    },
                                }))
                                await websocket.send(json.dumps({"type": "status", "state": "state-idle"}))
                                continue

                            await assistant.start_agent_text_task(websocket, text, "text_input")
                        except asyncio.TimeoutError:
                            print(f"[Backend] text_input timed out after {AGENT_TEXT_TIMEOUT_SECONDS}s")
                            assistant.state = "IDLE"
                            assistant.waiting_for_reply = False
                            assistant.audio_buffer = bytearray()
                            await websocket.send(json.dumps({
                                "type": "response",
                                "payload": {"text": "CIARA took too long to respond, so I stopped that task.", "app": ""}
                            }))
                            await websocket.send(json.dumps({"type": "status", "state": "state-idle"}))
                        except Exception as e:
                            print(f"[Backend] text_input error: {e}")
                            assistant.state = "IDLE"
                            assistant.waiting_for_reply = False
                            assistant.audio_buffer = bytearray()
                            await websocket.send(json.dumps({
                                "type": "response",
                                "payload": {"text": "CIARA hit an internal error while processing that request.", "app": ""}
                            }))
                            await websocket.send(json.dumps({"type": "status", "state": "state-idle"}))
                elif msg_type == "user_action":
                    mapped_text = _map_user_action_to_text(data.get("action", ""))
                    if mapped_text:
                        assistant.state = "LOADING"
                        await websocket.send(json.dumps({
                            "type": "progress", "state": "state-loading"
                        }))
                        try:
                            await assistant.start_agent_text_task(websocket, mapped_text, "user_action")
                        except asyncio.TimeoutError:
                            print(f"[Backend] user_action timed out after {AGENT_TEXT_TIMEOUT_SECONDS}s")
                            assistant.state = "IDLE"
                            assistant.waiting_for_reply = False
                            assistant.audio_buffer = bytearray()
                            await websocket.send(json.dumps({
                                "type": "response",
                                "payload": {"text": "CIARA took too long to respond, so I stopped that task.", "app": ""}
                            }))
                            await websocket.send(json.dumps({"type": "status", "state": "state-idle"}))
                        except Exception as e:
                            print(f"[Backend] user_action error: {e}")
                            assistant.state = "IDLE"
                            assistant.waiting_for_reply = False
                            assistant.audio_buffer = bytearray()
                            await websocket.send(json.dumps({
                                "type": "response",
                                "payload": {"text": "CIARA hit an internal error while processing that request.", "app": ""}
                            }))
                            await websocket.send(json.dumps({"type": "status", "state": "state-idle"}))
                elif msg_type == "browser_debug_action":
                    query = (data.get("query") or "").strip()
                    action = (data.get("action") or "click").strip().lower()
                    session_id = (data.get("session_id") or "").strip()
                    text = data.get("text") or ""
                    option = data.get("option") or ""
                    clear_first = bool(data.get("clear_first", False))
                    timeout = float(data.get("timeout", 8.0) or 8.0)

                    if not query:
                        await websocket.send(json.dumps({
                            "type": "browser_debug_result",
                            "ok": False,
                            "message": "query is required",
                        }))
                        continue

                    snapshot = browser_store.get_snapshot(session_id or None)
                    if not snapshot:
                        await websocket.send(json.dumps({
                            "type": "browser_debug_result",
                            "ok": False,
                            "message": "No active browser snapshot is available.",
                        }))
                        continue

                    candidate = browser_resolver.best_candidate(query, snapshot.elements, action=action)
                    if not candidate:
                        await websocket.send(json.dumps({
                            "type": "browser_debug_result",
                            "ok": False,
                            "message": f"No browser candidate matched query '{query}' for action '{action}'.",
                            "session_id": snapshot.session_id,
                            "generation": snapshot.generation,
                        }))
                        continue

                    request = ActionRequest(
                        action=action,
                        ref_id=candidate.ref_id,
                        session_id=snapshot.session_id,
                        text=text,
                        option=option,
                        clear_first=clear_first,
                        timeout=timeout,
                    )
                    queued = browser_bridge.queue_action(request)
                    if not queued.ok:
                        await websocket.send(json.dumps({
                            "type": "browser_debug_result",
                            "ok": False,
                            "message": queued.message,
                            "query": query,
                            "candidate": {
                                "ref_id": candidate.ref_id,
                                "label": candidate.primary_label(),
                                "role": candidate.role or candidate.tag,
                            },
                        }))
                        continue

                    result = await browser_bridge.wait_for_result(queued.action_id, timeout=timeout)

                    if result is None:
                        await websocket.send(json.dumps({
                            "type": "browser_debug_result",
                            "ok": False,
                            "message": f"Timed out waiting for browser action result for '{query}'.",
                            "query": query,
                            "action": action,
                            "action_id": queued.action_id,
                            "candidate": {
                                "ref_id": candidate.ref_id,
                                "label": candidate.primary_label(),
                                "role": candidate.role or candidate.tag,
                            },
                        }))
                        continue

                    await websocket.send(json.dumps({
                        "type": "browser_debug_result",
                        "ok": result.ok,
                        "message": result.message,
                        "query": query,
                        "action": action,
                        "action_id": result.action_id,
                        "session_id": result.session_id,
                        "pre_generation": result.pre_generation,
                        "post_generation": result.post_generation,
                        "candidate": {
                            "ref_id": candidate.ref_id,
                            "label": candidate.primary_label(),
                            "role": candidate.role or candidate.tag,
                        },
                        "details": result.details,
                    }))
                elif msg_type == "browser_flash_action":
                    query = (data.get("query") or "").strip()
                    action = (data.get("action") or "click").strip().lower()
                    session_id = (data.get("session_id") or "").strip()
                    text = data.get("text") or ""
                    option = data.get("option") or ""
                    clear_first = bool(data.get("clear_first", False))
                    timeout = float(data.get("timeout", 10.0) or 10.0)

                    snapshot, _, snapshot_error = build_ranked_candidates(query, action, session_id=session_id, limit=8)
                    if not snapshot:
                        await websocket.send(json.dumps({
                            "type": "browser_flash_result",
                            "ok": False,
                            "message": snapshot_error or "No active browser snapshot is available.",
                        }))
                        continue

                    selection, error = await select_browser_candidate_with_flash(
                        query=query,
                        action=action,
                        session_id=snapshot.session_id,
                        text=text,
                        option=option,
                    )
                    if not selection:
                        await websocket.send(json.dumps({
                            "type": "browser_flash_result",
                            "ok": False,
                            "message": error,
                            "query": query,
                            "action": action,
                            "session_id": snapshot.session_id,
                            "generation": snapshot.generation,
                        }))
                        continue

                    candidate = browser_store.get_element(selection["ref_id"], snapshot.session_id)
                    if not candidate:
                        await websocket.send(json.dumps({
                            "type": "browser_flash_result",
                            "ok": False,
                            "message": f"Selected ref '{selection['ref_id']}' is no longer present.",
                            "selection": selection,
                        }))
                        continue

                    request = ActionRequest(
                        action=action,
                        ref_id=candidate.ref_id,
                        session_id=snapshot.session_id,
                        text=text,
                        option=option,
                        clear_first=clear_first,
                        timeout=timeout,
                    )
                    queued = browser_bridge.queue_action(request)
                    if not queued.ok:
                        await websocket.send(json.dumps({
                            "type": "browser_flash_result",
                            "ok": False,
                            "message": queued.message,
                            "selection": selection,
                        }))
                        continue

                    result = await browser_bridge.wait_for_result(queued.action_id, timeout=timeout)

                    if result is None:
                        await websocket.send(json.dumps({
                            "type": "browser_flash_result",
                            "ok": False,
                            "message": f"Timed out waiting for Gemma 4 fast tier browser action '{query}'.",
                            "action_id": queued.action_id,
                            "selection": selection,
                        }))
                        continue

                    await websocket.send(json.dumps({
                        "type": "browser_flash_result",
                        "ok": result.ok,
                        "message": result.message,
                        "query": query,
                        "action": action,
                        "action_id": result.action_id,
                        "session_id": result.session_id,
                        "pre_generation": result.pre_generation,
                        "post_generation": result.post_generation,
                        "selection": selection,
                        "details": result.details,
                    }))
                    
                elif msg_type == "hotkey_pressed":
                    print("=> HOTKEY PRESSED. Forcing wake...")
                    assistant.state = "LISTENING"
                    assistant.audio_buffer = bytearray()
                    await websocket.send(json.dumps({
                        "type": "status", "state": "state-listening"
                    }))
                    
            except json.JSONDecodeError:
                pass
            except Exception as inner_e:
                print(f"Error handling message: {inner_e}")
                
    except websockets.exceptions.ConnectionClosed as e:
        print(f"Electron disconnected: {e}")
    except Exception as e:
        print(f"Unexpected websocket error: {e}")


async def main():
    if PICOVOICE_ACCESS_KEY == "YOUR_PICOVOICE_ACCESS_KEY_HERE":
        print("!" * 60)
        print("ACTION REQUIRED: You must set PICOVOICE_ACCESS_KEY in ")
        print("backend_server.py to enable the wake word.")
        print("!" * 60)

    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        print("!" * 60)
        print("NOTE: GEMINI_API_KEY not set. Agent will run in fallback mode.")
        print("Set it with: export GEMINI_API_KEY='your-key-here'")
        print("!" * 60)
        
    async with websockets.serve(
        main_handler,
        "127.0.0.1",
        8000,
        origins=None,
        ping_interval=120,
        ping_timeout=600,
    ):
        async with websockets.serve(
            bridge_handler,
            BRIDGE_HOST,
            BRIDGE_PORT,
            origins=None,
            ping_interval=120,
            ping_timeout=600,
        ):
            print("Server running on ws://127.0.0.1:8000 (Allow All Origins)")
            print(f"Browser bridge running on ws://{BRIDGE_HOST}:{BRIDGE_PORT}")
            print("[Backend] READY")
            await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
