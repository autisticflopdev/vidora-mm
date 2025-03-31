import mongoose from "mongoose";

export interface ISource extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  originalName: string;
  natoName: string;
  isRgaio: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sourceSchema = new mongoose.Schema<ISource>(
  {
    originalName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    natoName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    isRgaio: {
      type: Boolean,
      default: false,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

sourceSchema.index({ originalName: 1 });
sourceSchema.index({ natoName: 1 });
sourceSchema.index({ isRgaio: 1 });
sourceSchema.index({ enabled: 1 });

export const Source = mongoose.model<ISource>("Source", sourceSchema);
