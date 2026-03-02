import { useState, useRef, useCallback, useEffect } from "react";

export interface VoiceRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  stream: MediaStream | null;
  previewUrl: string | null;
  start: () => Promise<void>;
  stop: () => Promise<File | null>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  finishRecording: () => Promise<void>;
  discardPreview: () => void;
  sendPreview: () => File | null;
}

export function useVoiceRecorder(): VoiceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((file: File | null) => void) | null>(null);
  const previewFileRef = useRef<File | null>(null);

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
    setIsPaused(false);
    setDuration(0);
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    previewFileRef.current = null;
  }, [previewUrl]);

  const start = useCallback(async () => {
    clearPreview();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 256000,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100);
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      cleanup();
    }
  }, [cleanup, clearPreview]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    setIsPaused(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    setIsPaused(false);
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, []);

  // Finish recording and move to preview mode (don't send yet)
  const finishRecording = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        cleanup();
        resolve();
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice-${Date.now()}.${ext}`, {
          type: mimeType,
          lastModified: Date.now(),
        });
        previewFileRef.current = file;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        cleanup();
        resolve();
      };

      recorder.stop();
    });
  }, [cleanup]);

  const discardPreview = useCallback(() => {
    clearPreview();
  }, [clearPreview]);

  const sendPreview = useCallback((): File | null => {
    const file = previewFileRef.current;
    clearPreview();
    return file;
  }, [clearPreview]);

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
    clearPreview();
    resolveRef.current?.(null);
    resolveRef.current = null;
  }, [cleanup, clearPreview]);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    isRecording,
    isPaused,
    duration,
    stream: streamRef.current,
    previewUrl,
    start,
    stop,
    pause,
    resume,
    cancel,
    finishRecording,
    discardPreview,
    sendPreview,
  };
}
