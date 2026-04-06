import mongoose, { Schema, Document } from 'mongoose';

export interface IBusiness extends Document {
  placeId: string;
  nameAddressHash: string;
  name: string;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  scrapedAt: Date;
  seenCount: number;
  searchIdentifier: string | null;
}

const BusinessSchema = new Schema({
  placeId: { type: String, required: true, unique: true, index: true },
  nameAddressHash: { type: String, index: true },
  name: { type: String, required: true },
  rating: { type: Number, default: null },
  reviewCount: { type: Number, default: null },
  category: { type: String, default: null },
  address: { type: String },
  phone: { type: String },
  website: { type: String },
  mapsUrl: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  scrapedAt: { type: Date, default: Date.now },
  seenCount: { type: Number, default: 1 },
  searchIdentifier: { type: String, index: true },
});

export const Business = mongoose.model<IBusiness>('Business', BusinessSchema);
