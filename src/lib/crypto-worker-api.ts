// Thin API to communicate with the crypto Web Worker

let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/crypto.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    };
  }
  return worker;
}

function post<T>(type: string, payload: any, transfer?: Transferable[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type, payload }, transfer || []);
  });
}

export function workerEncrypt(plaintext: string, password: string, salt: string) {
  return post<{ encrypted: string; iv: string }>('encrypt', { plaintext, password, salt });
}

export function workerDecrypt(encrypted: string, iv: string, password: string, salt: string) {
  return post<string>('decrypt', { encrypted, iv, password, salt });
}

export function workerDecryptBatch(
  messages: Array<{ id: string; encrypted: string; iv: string }>,
  password: string,
  salt: string
) {
  return post<Array<{ id: string; text: string | null }>>('decryptBatch', { messages, password, salt });
}

export function workerEncryptFile(fileData: ArrayBuffer, password: string, salt: string) {
  return post<{ encryptedData: ArrayBuffer; iv: string }>('encryptFile', { fileData, password, salt }, [fileData]);
}

export function workerDecryptFile(encryptedData: ArrayBuffer, iv: string, password: string, salt: string) {
  return post<ArrayBuffer>('decryptFile', { encryptedData, iv, password, salt }, [encryptedData]);
}
