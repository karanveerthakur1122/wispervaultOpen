import { useState, useRef, useCallback, useEffect } from "react";

export interface VoiceRecorderState {
  isRecording: boolean;
  duration: number;
  stream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => Promise<File | null>;
  cancel: () => void;
}

export function useVoiceRecorder(): VoiceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((file: File | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm/opus, fallback to whatever is available
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100); // collect in 100ms chunks
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        cleanup();
        resolve(null);
        return;
      }

      resolveRef.current = resolve;

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice-${Date.now()}.${ext}`, {
          type: mimeType,
          lastModified: Date.now(),
        });
        cleanup();
        resolveRef.current?.(file);
        resolveRef.current = null;
      };

      recorder.stop();
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    cleanup();
    resolveRef.current?.(null);
    resolveRef.current = null;
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return { isRecording, duration, stream: streamRef.current, start, stop, cancel };
}
