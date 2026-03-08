import { useRef, useCallback, useEffect } from "react";

export type QueueItemStatus = "pending" | "sending" | "sent" | "failed";

export interface QueueItem {
  tempId: string;
  encrypted_blob: string;
  iv: string;
  room_id: string;
  sender_name: string;
  sender_color: string;
  media_url: string | null;
  media_type: string | null;
  status: QueueItemStatus;
  retryCount: number;
  createdAt: number;
}

const STORAGE_KEY_PREFIX = "msg_queue_";
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 3000, 5000, 8000, 12000];

export function useMessageQueue(
  roomId: string | undefined,
  onSendToServer: (item: QueueItem) => Promise<boolean>,
  onStatusChange: (tempId: string, status: QueueItemStatus) => void,
) {
  const queueRef = useRef<QueueItem[]>([]);
  const processingRef = useRef(false);
  const storageKey = roomId ? `${STORAGE_KEY_PREFIX}${roomId}` : null;

  // Persist queue to localStorage
  const persist = useCallback(() => {
    if (!storageKey) return;
    const toSave = queueRef.current.filter((i) => i.status !== "sent");
    if (toSave.length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(toSave));
    }
  }, [storageKey]);

  // Process queue: FIFO, one at a time
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (true) {
      // Find next pending or failed item to send
      const idx = queueRef.current.findIndex(
        (i) => i.status === "pending" || i.status === "failed"
      );
      if (idx === -1) break;

      // Pause if offline
      if (!navigator.onLine) break;

      const item = queueRef.current[idx];
      item.status = "sending";
      onStatusChange(item.tempId, "sending");
      persist();

      const success = await onSendToServer(item);

      if (success) {
        item.status = "sent";
        onStatusChange(item.tempId, "sent");
        // Remove from queue
        queueRef.current = queueRef.current.filter((i) => i.tempId !== item.tempId);
        persist();
      } else {
        item.retryCount++;
        if (item.retryCount >= MAX_RETRIES) {
          item.status = "failed";
          onStatusChange(item.tempId, "failed");
          persist();
          // Skip this item, continue to next
          continue;
        } else {
          item.status = "failed";
          onStatusChange(item.tempId, "sending"); // keep showing spinner during retry
          persist();
          // Wait with exponential delay before retry
          const delay = RETRY_DELAYS[Math.min(item.retryCount - 1, RETRY_DELAYS.length - 1)];
          await new Promise((r) => setTimeout(r, delay));
          // Reset to pending for retry
          item.status = "pending";
          continue; // retry same item
        }
      }
    }

    processingRef.current = false;
  }, [onSendToServer, onStatusChange, persist]);

  // Enqueue a new message
  const enqueue = useCallback(
    (item: Omit<QueueItem, "status" | "retryCount" | "createdAt">) => {
      const queueItem: QueueItem = {
        ...item,
        status: "pending",
        retryCount: 0,
        createdAt: Date.now(),
      };
      queueRef.current.push(queueItem);
      persist();
      // Trigger processing
      processQueue();
    },
    [persist, processQueue],
  );

  // Manual retry for a failed message
  const retryMessage = useCallback(
    (tempId: string) => {
      const item = queueRef.current.find((i) => i.tempId === tempId);
      if (item && item.status === "failed") {
        item.status = "pending";
        item.retryCount = 0;
        onStatusChange(tempId, "pending");
        persist();
        processQueue();
      }
    },
    [onStatusChange, persist, processQueue],
  );

  // Restore queue from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const items: QueueItem[] = JSON.parse(saved);
        // Reset all to pending for re-sending
        items.forEach((i) => {
          i.status = "pending";
          i.retryCount = 0;
        });
        queueRef.current = items;
        if (items.length > 0) {
          // Notify UI about restored items
          items.forEach((i) => onStatusChange(i.tempId, "pending"));
          processQueue();
        }
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]); // eslint-disable-line

  // Listen for online event to resume queue
  useEffect(() => {
    const handleOnline = () => {
      if (queueRef.current.some((i) => i.status === "pending" || i.status === "failed")) {
        // Reset failed to pending on reconnect
        queueRef.current.forEach((i) => {
          if (i.status === "failed") {
            i.status = "pending";
            i.retryCount = 0;
            onStatusChange(i.tempId, "pending");
          }
        });
        processQueue();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [processQueue, onStatusChange]);

  return { enqueue, retryMessage, getQueue: () => queueRef.current };
}
