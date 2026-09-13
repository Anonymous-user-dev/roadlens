"use client";

type QueuedReport = {
  id: string;
  createdAt: string;
  fields: Record<string, string>;
  image: Blob;
  imageName: string;
  imageType: string;
};

const DB_NAME = "roadlens-offline";
const STORE = "pending-reports";

function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openQueue();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function queueReport(form: FormData) {
  const image = form.get("image");
  if (!(image instanceof File)) throw new Error("Missing report photo");
  const fields: Record<string, string> = {};
  form.forEach((value, key) => { if (typeof value === "string") fields[key] = value; });
  const report: QueuedReport = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    fields,
    image,
    imageName: image.name,
    imageType: image.type,
  };
  await transaction("readwrite", (store) => store.put(report));
  return report.id;
}

export async function queuedReportCount() {
  return transaction("readonly", (store) => store.count());
}

export async function flushQueuedReports() {
  const reports = await transaction<QueuedReport[]>("readonly", (store) => store.getAll());
  let sent = 0;
  for (const report of reports) {
    const form = new FormData();
    Object.entries(report.fields).forEach(([key, value]) => form.set(key, value));
    form.set("image", new File([report.image], report.imageName, { type: report.imageType }));
    const response = await fetch("/api/reports", { method: "POST", body: form });
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 429) await transaction("readwrite", (store) => store.delete(report.id));
      break;
    }
    await transaction("readwrite", (store) => store.delete(report.id));
    sent += 1;
  }
  return { sent, remaining: await queuedReportCount() };
}

