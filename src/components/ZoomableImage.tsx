import { useRef, useState, useCallback, useEffect } from "react";

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export default function ZoomableImage({ src, alt = "", className = "", onClick }: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = useState(false);

  // Touch state refs for pinch & pan
  const touchState = useRef<{
    initialDistance: number;
    initialScale: number;
    initialCenter: { x: number; y: number };
    initialTranslate: { x: number; y: number };
    lastCenter: { x: number; y: number };
    isPinching: boolean;
    isPanning: boolean;
    panStart: { x: number; y: number } | null;
  }>({
    initialDistance: 0,
    initialScale: 1,
    initialCenter: { x: 0, y: 0 },
    initialTranslate: { x: 0, y: 0 },
    lastCenter: { x: 0, y: 0 },
    isPinching: false,
    isPanning: false,
    panStart: null,
  });

  const getDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const getCenter = (t1: React.Touch, t2: React.Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const clampTranslate = useCallback((tx: number, ty: number, s: number) => {
    if (s <= 1) return { x: 0, y: 0 };
    const el = containerRef.current;
    if (!el) return { x: tx, y: ty };
    const rect = el.getBoundingClientRect();
    const maxX = (rect.width * (s - 1)) / 2;
    const maxY = (rect.height * (s - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, tx)),
      y: Math.max(-maxY, Math.min(maxY, ty)),
    };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const center = getCenter(e.touches[0], e.touches[1]);
      touchState.current = {
        ...touchState.current,
        initialDistance: dist,
        initialScale: scale,
        initialCenter: center,
        initialTranslate: { ...translate },
        lastCenter: center,
        isPinching: true,
        isPanning: false,
        panStart: null,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      e.preventDefault();
      touchState.current = {
        ...touchState.current,
        isPanning: true,
        isPinching: false,
        panStart: { x: e.touches[0].clientX, y: e.touches[0].clientY },
        initialTranslate: { ...translate },
      };
    }
  }, [scale, translate]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const ts = touchState.current;

    if (ts.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const center = getCenter(e.touches[0], e.touches[1]);
      const newScale = Math.max(1, Math.min(5, ts.initialScale * (dist / ts.initialDistance)));

      // Pan while pinching
      const dx = center.x - ts.initialCenter.x;
      const dy = center.y - ts.initialCenter.y;
      const newTranslate = clampTranslate(
        ts.initialTranslate.x + dx,
        ts.initialTranslate.y + dy,
        newScale
      );

      setScale(newScale);
      setTranslate(newTranslate);
      setIsZoomed(newScale > 1.05);
      ts.lastCenter = center;
    } else if (ts.isPanning && e.touches.length === 1 && ts.panStart) {
      e.preventDefault();
      const dx = e.touches[0].clientX - ts.panStart.x;
      const dy = e.touches[0].clientY - ts.panStart.y;
      const newTranslate = clampTranslate(
        ts.initialTranslate.x + dx,
        ts.initialTranslate.y + dy,
        scale
      );
      setTranslate(newTranslate);
    }
  }, [scale, clampTranslate]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const ts = touchState.current;

    if (e.touches.length < 2) {
      ts.isPinching = false;
    }
    if (e.touches.length === 0) {
      ts.isPanning = false;
      ts.panStart = null;

      // Snap back if scale is near 1
      if (scale < 1.1) {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
        setIsZoomed(false);
      }
    }
  }, [scale]);

  // Double-tap to zoom
  const lastTapRef = useRef(0);
  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap
      e.stopPropagation();
      if (scale > 1.1) {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
        setIsZoomed(false);
      } else {
        setScale(2.5);
        setIsZoomed(true);
        // Zoom towards tap point
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const cx = e.clientX - rect.left - rect.width / 2;
          const cy = e.clientY - rect.top - rect.height / 2;
          setTranslate(clampTranslate(-cx * 0.6, -cy * 0.6, 2.5));
        }
      }
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    // Single tap — pass through after delay
    setTimeout(() => {
      if (Date.now() - lastTapRef.current >= 280 && !isZoomed) {
        onClick?.(e);
      }
    }, 300);
  }, [scale, isZoomed, onClick, clampTranslate]);

  // Reset on src change
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setIsZoomed(false);
  }, [src]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`${className} select-none`}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: scale === 1 && !touchState.current.isPinching ? "transform 0.25s ease-out" : "none",
          willChange: "transform",
          transformOrigin: "center center",
        }}
        draggable={false}
      />
    </div>
  );
}
