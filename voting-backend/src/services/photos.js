// Candidate photos: checking uploads and building their web addresses.
//
// The browser shrinks a photo before uploading it (see the website's lib/photo.js), so
// uploads are small. Here we only accept real JPEG, PNG or WebP images, checked by
// their first bytes rather than trusting what the upload claims to be.
const { badRequest } = require("../errors");

const MAX_BYTES = 512 * 1024;

const SIGNATURES = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

/** Reads `{ image: "data:image/jpeg;base64,..." }` into { contentType, data }. */
function parsePhoto(body) {
  const image = body?.image;
  const match = typeof image === "string" && image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw badRequest("Send the photo as a JPEG, PNG or WebP image", "BAD_PHOTO");
  const [, contentType, base64] = match;
  const data = Buffer.from(base64, "base64");
  if (data.length === 0 || data.length > MAX_BYTES) throw badRequest("The photo must be smaller than 512 KB", "BAD_PHOTO");
  if (!SIGNATURES[contentType](data)) throw badRequest("That file isn't a valid image", "BAD_PHOTO");
  return { contentType, data };
}

/** Web address of a candidate's photo. The ?v= part changes when the photo does, so browsers don't show an old one. */
const photoUrl = (c) => (c.photoUpdatedAt ? `/api/candidates/${c.id}/photo?v=${new Date(c.photoUpdatedAt).getTime()}` : null);

module.exports = { parsePhoto, photoUrl, MAX_BYTES };
