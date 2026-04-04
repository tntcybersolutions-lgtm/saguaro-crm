'use client';
/**
 * VoiceMemoButton — Compact inline voice memo recorder.
 * Records audio via MediaRecorder API (audio/webm), uploads to /api/voice-memos/create,
 * shows transcription result and playback controls.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';

const BASE   = '#0F1419';
const CARD   = '#1A1F2E';
const GOLD   = '#C8960F';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const BORDER = '#2A3144';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';

interface VoiceMemoButtonProps {
  projectId: string;
  itemType: 'rfi' | 'punch' | 'daily_log' | 'photo' | 'general';
  itemId?: string;
}

export default function VoiceMemoButton({ projectId, itemType, itemId }: VoiceMemoButtonProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startRecording = useCallback(async () => {
    setError('');
    setTranscription('');
    setAudioUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = '';
        }
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        await uploadMemo(blob);
      };

      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err: any) {
      setError(err?.message === 'Permission denied' ? 'Microphone access denied' : 'Could not access microphone');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const uploadMemo = async (blob: Blob) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, `memo-${Date.now()}.webm`);
      fd.append('projectId', projectId);
      fd.append('itemType', itemType);
      if (itemId) fd.append('itemId', itemId);
      fd.append('duration', String(duration));

      const res = await fetch('/api/voice-memos/create', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (data.transcription) setTranscription(data.transcription);
      else setTranscription('Memo saved. Transcription processing...');
    } catch {
      setError('Failed to upload memo');
    } finally {
      setUploading(false);
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <style>{`
        @keyframes vmPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
        }
      `}</style>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Main mic / stop button */}
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={uploading}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: recording ? RED : `${GOLD}22`,
            color: recording ? '#fff' : GOLD,
            cursor: uploading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: recording ? 'vmPulse 1.5s ease-in-out infinite' : 'none',
            transition: 'background 0.2s',
            flexShrink: 0,
            opacity: uploading ? 0.5 : 1,
          }}
          aria-label={recording ? 'Stop recording' : 'Record voice memo'}
        >
          {recording ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="1" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="17" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          )}
        </button>

        {/* Duration timer while recording */}
        {recording && (
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: RED,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 36,
          }}>
            {formatDuration(duration)}
          </span>
        )}

        {/* Uploading spinner */}
        {uploading && (
          <span style={{ fontSize: 12, color: DIM }}>Uploading...</span>
        )}

        {/* Playback button */}
        {audioUrl && !recording && !uploading && (
          <>
            <button
              onClick={togglePlayback}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                border: `1px solid ${BORDER}`,
                background: `${GREEN}15`,
                color: GREEN,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-label={playing ? 'Pause playback' : 'Play recording'}
            >
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="1" y="1" width="4" height="10" rx="1" />
                  <rect x="7" y="1" width="4" height="10" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <polygon points="2,0 12,6 2,12" />
                </svg>
              )}
            </button>
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setPlaying(false)}
              style={{ display: 'none' }}
            />
          </>
        )}
      </div>

      {/* Transcription result */}
      {transcription && (
        <div style={{
          background: `${CARD}cc`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          color: TEXT,
          lineHeight: 1.5,
          maxHeight: 80,
          overflowY: 'auto',
          maxWidth: 280,
        }}>
          {transcription}
        </div>
      )}

      {/* Error message */}
      {error && (
        <span style={{ fontSize: 11, color: RED }}>{error}</span>
      )}
    </div>
  );
}
