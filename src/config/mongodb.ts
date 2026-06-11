import mongoose from 'mongoose';
import 'dotenv/config';

export const connectMongoDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('CRITICAL: MONGODB_URI is not defined in the environment variables.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('== MongoDB connected successfully ==');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};