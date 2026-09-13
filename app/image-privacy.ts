"use client";

export async function preparePrivateImage(file: File) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("Image conversion failed");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "road-evidence";
    return { file: new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() }), metadataRemoved: true };
  } catch {
    return { file, metadataRemoved: false };
  }
}
