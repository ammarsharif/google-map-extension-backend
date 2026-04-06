import mongoose, { Schema, Document } from 'mongoose';

export interface ISession extends Document {
  sessionId: string;
  seenPlaceIds: string[];
  seenNameAddressHashes: string[];
  totalSearches: number;
  totalResultsCollected: number;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    seenPlaceIds: { type: [String], default: [] },
    seenNameAddressHashes: { type: [String], default: [] },
    totalSearches: { type: Number, default: 0 },
    totalResultsCollected: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Session = mongoose.model<ISession>('Session', SessionSchema);
