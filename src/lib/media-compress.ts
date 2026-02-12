/**
 * Compress images and videos before upload for faster sending.
 * Uses Canvas API for images and reduces quality/size.
 */

const MAX_IMAGE_DIMENSION = 1200;
const IMAGE_QUALITY = 0.7;
const MAX_VIDEO_SIZE_MB = 8;

/**
 * Compress an image file by resizing and reducing quality.
 * Returns a new File with reduced size.
 */
export async function compressImage(file: File): Promise<File> {
  // Skip non-image files
  if (!file.type.startsWith("image/")) return file;

  // Skip GIFs (lossy compression ruins animation)
  if (file.type === "image/gif") return file;

  // Skip already small files (< 100KB)
  if (file.size < 100 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if larger than max dimension
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            // Compressed version is smaller — use it
            resolve(new File([blob], file.name, { type: "image/jpeg", lastModified: Date.now() }));
          } else {
            // Original was already optimized
            resolve(file);
          }
        },
        "image/jpeg",
        IMAGE_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback to original
    };

    img.src = url;
  });
}

/**
 * Compress a video file by re-encoding at lower bitrate.
 * Uses MediaRecorder API (available in modern browsers).
 * Falls back to original if compression isn't supported.
 */
export async function compressVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/")) return file;

  // Skip small videos (< 2MB)
  if (file.size < 2 * 1024 * 1024) return file;

  // Check if MediaRecorder supports webm
  if (!MediaRecorder.isTypeSupported("video/webm")) return file;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      // Calculate target bitrate for ~MAX_VIDEO_SIZE_MB output
      const durationSec = video.duration || 30;
      const targetBitsPerSec = Math.min(
        (MAX_VIDEO_SIZE_MB * 8 * 1024 * 1024) / durationSec,
        1_500_000 // cap at 1.5 Mbps
      );

      // Scale down resolution
      const maxDim = 720;
      let width = video.videoWidth;
      let height = video.videoHeight;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      // Ensure even dimensions
      width = width % 2 === 0 ? width : width - 1;
      height = height % 2 === 0 ? height : height - 1;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;

      const stream = canvas.captureStream(24); // 24fps

      // Add audio track if present
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch {
        // No audio or not supported — continue without
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm",
        videoBitsPerSecond: targetBitsPerSec,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        URL.revokeObjectURL(url);
        const blob = new Blob(chunks, { type: "video/webm" });
        if (blob.size < file.size) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".webm"), {
            type: "video/webm",
            lastModified: Date.now(),
          }));
        } else {
          resolve(file);
        }
      };

      recorder.start();

      const drawFrame = () => {
        if (video.ended || video.paused) {
          recorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        requestAnimationFrame(drawFrame);
      };

      video.onplay = drawFrame;
      video.onended = () => recorder.stop();

      // Timeout safety: stop after duration + 2s
      setTimeout(() => {
        if (recorder.state === "recording") {
          video.pause();
          recorder.stop();
        }
      }, (durationSec + 2) * 1000);

      video.play().catch(() => {
        URL.revokeObjectURL(url);
        resolve(file);
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    video.src = url;
  });
}

/**
 * Compress any media file. Routes to the appropriate compressor.
 */
export async function compressMedia(file: File): Promise<File> {
  if (file.type.startsWith("image/")) {
    return compressImage(file);
  }
  if (file.type.startsWith("video/")) {
    return compressVideo(file);
  }
  // Audio, documents — return as-is
  return file;
}
