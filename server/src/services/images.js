import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { HttpError } from '../middleware/http.js';
import { ImageFile } from '../models/index.js';

const databasePrefix = 'db:';
function provider() {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) return null;
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return cloudinary;
}
// Without Cloudinary, photos are shrunk to WebP and stored in MongoDB (roughly 100–300 KB each).
async function storeInDatabase(buffer, baseUrl) {
  const data = await sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
    .catch(() => { throw new HttpError(400, 'That image could not be read'); });
  const id = randomUUID();
  await ImageFile.create({ _id: id, data, contentType: 'image/webp' });
  return { publicId: `${databasePrefix}${id}`, url: `${baseUrl}/api/images/${id}` };
}
export async function uploadImage(file, baseUrl) {
  const type = await fileTypeFromBuffer(file.buffer);
  if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) throw new HttpError(400, 'Only JPEG, PNG, and WebP images are supported');
  const service = provider();
  if (!service) return storeInDatabase(file.buffer, baseUrl);
  return new Promise((resolve, reject) => {
    service.uploader.upload_stream({ folder: 'hostelhub', resource_type: 'image', transformation: [{ width: 2400, height: 2400, crop: 'limit' }] }, (error, result) => {
      if (error) return reject(new HttpError(502, 'Image upload failed'));
      resolve({ publicId: result.public_id, url: result.secure_url });
    }).end(file.buffer);
  });
}
export async function deleteImage(publicId) {
  if (publicId.startsWith(databasePrefix)) return ImageFile.deleteOne({ _id: publicId.slice(databasePrefix.length) });
  const service = provider();
  if (!service) throw new HttpError(503, 'Image storage is not configured');
  await service.uploader.destroy(publicId);
}
export async function serveImage(req, res) {
  const image = await ImageFile.findById(req.params.imageId);
  if (!image) throw new HttpError(404, 'Image not found');
  // Photos are shown on the student and owner sites, which are different origins from the API.
  res.set({ 'Content-Type': image.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.send(image.data);
}
