import { ownedHostel, requireEditable, resetReview } from '../services/hostels.js';
import { uploadImage, deleteImage } from '../services/images.js';
export { serveImage as show } from '../services/images.js';
import { HttpError } from '../middleware/http.js';

export async function upload(req, res) {
  const hostel = await ownedHostel(req.params.id, req.user);
  requireEditable(hostel);
  if (!req.files?.length || hostel.images.length + req.files.length > 10) throw new HttpError(400, 'Provide images; a listing can have at most 10');
  const added = [];
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    for (const file of req.files) added.push(await uploadImage(file, baseUrl));
    hostel.images.push(...added);
    hostel.coverImage ||= hostel.images[0].publicId;
    resetReview(hostel);
    await hostel.save();
  } catch (error) {
    await Promise.allSettled(added.map(image => deleteImage(image.publicId)));
    throw error;
  }
  res.status(201).json({ data: hostel });
}
export async function arrange(req, res) {
  const hostel = await ownedHostel(req.params.id, req.user);
  requireEditable(hostel);
  const { publicIds, coverImage } = req.validated.body;
  const images = new Map(hostel.images.map(image => [image.publicId, image]));
  if (publicIds.length !== images.size || new Set(publicIds).size !== images.size || publicIds.some(id => !images.has(id)) || !images.has(coverImage)) throw new HttpError(400, 'Supply each existing image exactly once and a valid cover');
  hostel.images = publicIds.map(id => images.get(id));
  hostel.coverImage = coverImage;
  resetReview(hostel);
  await hostel.save();
  res.json({ data: hostel });
}
export async function remove(req, res) {
  const hostel = await ownedHostel(req.params.id, req.user);
  requireEditable(hostel);
  const { publicId } = req.validated.body;
  if (!hostel.images.some(image => image.publicId === publicId)) throw new HttpError(404, 'Image not found');
  hostel.images = hostel.images.filter(image => image.publicId !== publicId);
  if (hostel.coverImage === publicId) hostel.coverImage = hostel.images[0]?.publicId;
  resetReview(hostel);
  await hostel.save();
  // Persist the reference removal first; storage cleanup failure must not leave a broken listing.
  try { await deleteImage(publicId); } catch (error) { console.error('Image cleanup required:', publicId, error.message); }
  res.json({ data: hostel });
}
