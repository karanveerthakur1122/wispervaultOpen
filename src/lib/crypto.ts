// AES-256-GCM Encryption Engine using Web Crypto API

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(
  plaintext: string,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return {
    encrypted: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv.buffer),
  };
}

export async function decryptMessage(
  encrypted: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    key,
    base64ToBuffer(encrypted)
  );

  return dec.decode(plaintext);
}

export async function encryptFile(
  file: File,
  key: CryptoKey
): Promise<{ encryptedBlob: Blob; iv: string; originalName: string; mimeType: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const arrayBuffer = await file.arrayBuffer();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  );

  return {
    encryptedBlob: new Blob([ciphertext]),
    iv: bufferToBase64(iv.buffer),
    originalName: file.name,
    mimeType: file.type,
  };
}

export async function decryptFile(
  encryptedData: ArrayBuffer,
  iv: string,
  key: CryptoKey,
  mimeType: string
): Promise<Blob> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    key,
    encryptedData
  );

  return new Blob([plaintext], { type: mimeType });
}

export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const arr = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export function generatePassword(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}
