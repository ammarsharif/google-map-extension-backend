import mongoose, { Schema, Document } from 'mongoose';

export interface ISearchRecord extends Document {
  searchId: string;
  sessionId: string;
  placeName: string;
  location: string;
  requestedCount: number;
  returnedCount: number;
  excludedCount: number;
  scrapeMode: 'full' | 'fast';
  businessIds: mongoose.Types.ObjectId[];
  searchIdentifier: string | null;
  createdAt: Date;
}

const SearchRecordSchema = new Schema(
  {
    searchId: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true },
    placeName: { type: String, required: true },
    location: { type: String, required: true },
    requestedCount: { type: Number, required: true },
    returnedCount: { type: Number, default: 0 },
    excludedCount: { type: Number, default: 0 },
    scrapeMode: { type: String, enum: ['full', 'fast'], default: 'full' },
    searchIdentifier: { type: String, default: null },
    businessIds: [{ type: Schema.Types.ObjectId, ref: 'Business' }],
  },
  { timestamps: true }
);

export const SearchRecord = mongoose.model<ISearchRecord>('SearchRecord', SearchRecordSchema);
