'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const GOLD = '#C8960F';
const DARK = '#F8F9FB';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';
const TEXT = '#e8edf8';

interface VoiceToLogProps {
  onTranscript: (text: string) => void;
}

export default function VoiceToLog({ onTranscript }: VoiceToLogProps) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [duration, setDuration] = useState(0);
  const [supported, setSupported] = useState(true);
  const [useFallback, setUseFallback] = useState(false);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullTranscriptRef = useRef('');

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (typeof MediaRecorder !== 'undefined') {
        setUseFallback(true);
      } else {
        setSupported(false);
      }
    }
  }, []);

  const startTimer = useCallback(() => {
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    fullTranscriptRef.current = '';
    setTranscript('');

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      fullTranscriptRef.current = final;
      setTranscript(final + interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') {
        console.error('Speech recognition error:', event.error);
      }
    };

    recognition.onend = () => {
      setRecording(false);
      stopTimer();
      const finalText = fullTranscriptRef.current.trim();
      if (finalText) {
        onTranscript(finalText);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
    startTimer();
  }, [onTranscript, startTimer, stopTimer]);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Dispatch custom event with audio blob for server-side transcription
        const customEvent = new CustomEvent('saguaro:audio-recorded', {
          detail: { blob: audioBlob, duration },
        });
        window.dispatchEvent(customEvent);

        setRecording(false);
        stopTimer();
        setTranscript('Audio recorded. Sending for transcription...');
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setTranscript('Recording audio...');
      startTimer();
    } catch (err) {
      console.error('Microphone access denied:', err);
      setTranscript('Microphone access denied.');
    }
  }, [duration, startTimer, stopTimer]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleToggle = () => {
    if (recording) {
      if (useFallback) {
        stopMediaRecorder();
      } else {
        stopSpeechRecognition();
      }
    } else {
      if (useFallback) {
        startMediaRecorder();
      } else {
        startSpeechRecognition();
      }
    }
  };

  useEffect(() => {
    return () => {
      stopTimer();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [stopTimer]);

  if (!supported) {
    return (
      <div
        style={{
          background: RAISED,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '12px 16px',
          color: DIM,
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        Voice not supported in this browser
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <style>{`
        @keyframes voicePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          50% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0); }
        }
      `}</style>

      {/* Microphone button */}
      <button
        onClick={handleToggle}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: recording ? '#ef4444' : GOLD,
          color: DARK,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
          animation: recording ? 'voicePulse 1.5s ease-in-out infinite' : 'none',
          transition: 'background 0.2s ease',
        }}
        aria-label={recording ? 'Stop recording' : 'Start voice recording'}
      >
        {recording ? (
          // Stop icon
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="4" y="4" width="12" height="12" rx="2" fill={DARK} />
          </svg>
        ) : (
          // Mic icon
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={DARK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="1" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="17" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        )}
      </button>

      {/* Duration timer */}
      {recording && (
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#ef4444',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatDuration(duration)}
        </span>
      )}

      {/* Real-time transcript preview */}
      {transcript && (
        <div
          style={{
            width: '100%',
            maxWidth: 360,
            background: RAISED,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            color: TEXT,
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: 'auto',
          }}
        >
          {transcript}
        </div>
      )}
    </div>
  );
}
