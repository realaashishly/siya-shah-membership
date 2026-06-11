import { Schema, model, Document } from 'mongoose';

export interface IMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface IChatHistory extends Document {
  igAccountId: string;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  role: { 
    type: String, 
    enum: ['user', 'assistant', 'system'], 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

const ChatHistorySchema = new Schema<IChatHistory>({
  igAccountId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true  
  },
  messages: [MessageSchema]
}, {
  timestamps: true
});

export const ChatHistory = model<IChatHistory>('ChatHistory', ChatHistorySchema);