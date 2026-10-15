import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name, required: true });

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  phone: { type: String, trim: true },
  phoneVerified: { type: Boolean, default: false },
  pendingPhone: { type: String, select: false }, phoneCodeSentAt: { type: Date, select: false },
  username: { type: String, lowercase: true, trim: true, match: /^[a-z0-9_]{3,24}$/ },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['STUDENT', 'OWNER', 'ADMIN', 'SUPERADMIN'], required: true },
  active: { type: Boolean, default: true },
  favorites: [{ type: Schema.Types.ObjectId, ref: 'Hostel' }],
}, { timestamps: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });
export const User = model('User', userSchema);

const roomSchema = new Schema({
  code: { type: String, required: true, trim: true }, floor: { type: Number, default: 0, min: 0 },
  seats: { type: Number, required: true, min: 1 }, available: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 }, priceMax: { type: Number, min: 0 },
  bath: { type: String, enum: ['ATTACHED', 'SHARED'] }, seatPrices: { type: [Number], default: undefined },
  x: { type: Number, required: true, min: 0 }, y: { type: Number, required: true, min: 0 },
  w: { type: Number, required: true, min: 1 }, h: { type: Number, required: true, min: 1 },
}, { _id: false });
const areaSchema = new Schema({
  label: { type: String, required: true, trim: true }, floor: { type: Number, default: 0, min: 0 },
  kind: { type: String, enum: ['CORRIDOR', 'STAIRS', 'BATH', 'KITCHEN', 'COMMON', 'STUDY', 'OTHER'], default: 'OTHER' },
  x: { type: Number, required: true, min: 0 }, y: { type: Number, required: true, min: 0 },
  w: { type: Number, required: true, min: 1 }, h: { type: Number, required: true, min: 1 },
}, { _id: false });

const hostelSchema = new Schema({
  owner: ref('User'), name: { type: String, required: true },
  description: { type: String, required: true }, city: { type: String, required: true },
  address: { type: String, required: true }, price: { type: Number, required: true, min: 0 },
  beds: { type: Number, required: true, min: 0 },
  gender: { type: String, enum: ['MALE', 'FEMALE', 'ANY'], default: 'ANY' },
  amenities: [String],
  floors: { type: Number, min: 1 }, totalRooms: { type: Number, min: 1 },
  // How many rooms of each size (1–5 beds) and the monthly price of one bed in them.
  seaterRooms: { type: [{ _id: false, seats: { type: Number, min: 1, max: 5, required: true }, rooms: { type: Number, min: 0, required: true }, pricePerBed: { type: Number, min: 0, required: true } }], default: undefined },
  mealsPerDay: { type: Number, min: 0, max: 3 }, universities: { type: [String], default: undefined },
  rooms: { type: [roomSchema], default: undefined }, areas: { type: [areaSchema], default: undefined },
  // Set when the owner described the building floor by floor: price is the cheapest seat and maxPrice the dearest.
  maxPrice: { type: Number, min: 0 },
  pricing: { type: new Schema({ mode: { type: String, enum: ['STANDARD', 'CUSTOM'], required: true }, rates: { type: [{ _id: false, seats: Number, price: Number }], default: undefined }, attachedBathExtra: Number }, { _id: false }), default: undefined },
  images: [{ _id: false, publicId: String, url: String, seats: { type: Number, min: 1, max: 5 } }], coverImage: String,
  // Video tours are hosted on YouTube (usually unlisted); only the video ID is kept here.
  youtubeId: { type: String, match: /^[A-Za-z0-9_-]{11}$/ },
  status: { type: String, enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'], default: 'DRAFT' },
  featured: { type: Boolean, default: false },
  moderationReason: String, moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  moderatedAt: Date, deletedAt: Date,
}, { timestamps: true, optimisticConcurrency: true });
hostelSchema.index({ status: 1, city: 1, price: 1 });
hostelSchema.index({ owner: 1, createdAt: -1 });
export const Hostel = model('Hostel', hostelSchema);

const conversationSchema = new Schema({
  hostel: ref('Hostel'), student: ref('User'), owner: ref('User'),
}, { timestamps: true });
conversationSchema.index({ hostel: 1, student: 1 }, { unique: true });
conversationSchema.index({ owner: 1, updatedAt: -1 });
export const Conversation = model('Conversation', conversationSchema);

const messageSchema = new Schema({
  conversation: ref('Conversation'), sender: ref('User'), recipient: ref('User'),
  text: { type: String, required: true, maxlength: 4000 }, readAt: Date,
}, { timestamps: true });
messageSchema.index({ conversation: 1, _id: -1 });
messageSchema.index({ recipient: 1, readAt: 1 });
export const Message = model('Message', messageSchema);

const sessionSchema = new Schema({
  _id: String, user: ref('User'), expiresAt: { type: Date, required: true },
});
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = model('Session', sessionSchema);

const phoneCodeSchema = new Schema({
  _id: String, codeHash: { type: String, required: true }, attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
phoneCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PhoneCode = model('PhoneCode', phoneCodeSchema);

// Listing photos kept in MongoDB when no Cloudinary account is configured.
const imageFileSchema = new Schema({ _id: String, data: { type: Buffer, required: true }, contentType: { type: String, required: true } }, { timestamps: true });
export const ImageFile = model('ImageFile', imageFileSchema);
