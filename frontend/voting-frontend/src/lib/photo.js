// Prepares a candidate photo in the browser before uploading it: crops it to a square
// (from the centre) and shrinks it to 480×480 JPEG. A phone photo of several MB becomes
// roughly 40–80 KB, so uploads are quick and the server only stores small images.
const SIZE = 480;

export async function prepareCandidatePhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPEG, PNG or WebP).");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image couldn't be opened. Try a JPEG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}
