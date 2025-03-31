import mongoose from "mongoose";

export interface IToken extends mongoose.Document {
  token: string;
  createdAt: Date;
}

const tokenSchema = new mongoose.Schema<IToken>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Token = mongoose.model<IToken>("Token", tokenSchema);
