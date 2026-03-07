// Web Worker for offloading encryption/decryption from main thread

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

const keyCache = new Map<string, CryptoKey>();

async function getKey(password: string, salt: string): Promise<CryptoKey> {
  const cacheKey = `${password}:${salt}`;
  if (keyCache.has(cacheKey)) return keyCache.get(cacheKey)!;
  const key = await deriveKey(password, salt);
  keyCache.set(cacheKey, key);
  return key;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    if (type === 'encrypt') {
      const { plaintext, password, salt } = payload;
      const key = await getKey(password, salt);
      const enc = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
      self.postMessage({ id, result: { encrypted: bufferToBase64(ciphertext), iv: bufferToBase64(iv.buffer) } });

    } else if (type === 'decrypt') {
      const { encrypted, iv, password, salt } = payload;
      const key = await getKey(password, salt);
      const dec = new TextDecoder();
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(iv) }, key, base64ToBuffer(encrypted)
      );
      self.postMessage({ id, result: dec.decode(plaintext) });

    } else if (type === 'decryptBatch') {
      const { messages, password, salt } = payload as {
        messages: Array<{ id: string; encrypted: string; iv: string }>;
        password: string; salt: string;
      };
      const key = await getKey(password, salt);
      const dec = new TextDecoder();
      const results: Array<{ id: string; text: string | null }> = [];
      for (const msg of messages) {
        try {
          const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBuffer(msg.iv) }, key, base64ToBuffer(msg.encrypted)
          );
          results.push({ id: msg.id, text: dec.decode(plaintext) });
        } catch {
          results.push({ id: msg.id, text: null });
        }
      }
      self.postMessage({ id, result: results });

    } else if (type === 'encryptFile') {
      const { fileData, password, salt } = payload as { fileData: ArrayBuffer; password: string; salt: string };
      const key = await getKey(password, salt);
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileData);
      (self as unknown as { postMessage(msg: any, transfer: Transferable[]): void }).postMessage({ id, result: { encryptedData: ciphertext, iv: bufferToBase64(iv.buffer) } }, [ciphertext]);

    } else if (type === 'decryptFile') {
      const { encryptedData, iv, password, salt } = payload as { encryptedData: ArrayBuffer; iv: string; password: string; salt: string };
      const key = await getKey(password, salt);
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(iv) }, key, encryptedData
      );
      (self as unknown as { postMessage(msg: any, transfer: Transferable[]): void }).postMessage({ id, result: plaintext }, [plaintext]);
    }
  } catch (err: any) {
    self.postMessage({ id, error: err?.message || 'Worker error' });
  }
};
