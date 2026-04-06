import mongoose from 'mongoose';
import dns from 'node:dns';
import { ENV } from '../env';

export async function connectDatabase(): Promise<void> {
  dns.setServers(['8.8.8.8', '8.8.4.4']);

  try {
    await mongoose.connect(ENV.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log(`✓ MongoDB connected: ${mongoose.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  } catch (err: any) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}
