import mongoose from "mongoose";

interface IHistoricalStats {
  requests: number;
  successful_requests: number;
  sources_found: number;
  avg_response_time: number;
  start_time: number;
  end_time: number;
}

interface IServerStats {
  originalName: string;
  natoName: string;
  successRate: number;
  working: number;
  total: number;
  lastChecked: number;
  uptime: number;
  status: "operational" | "degraded" | "down";
  errors: {
    total: number;
    rate: number;
    lastError?: string;
  };
}

interface IGlobalStats {
  total_requests: number;
  successful_requests: number;
  total_sources_found: number;
  avg_response_time: number;
  last_updated: number;
  uptime_start: number;
  daily: IHistoricalStats;
  weekly: IHistoricalStats;
  monthly: IHistoricalStats;
  yearly: IHistoricalStats;
  alltime: IHistoricalStats;
}

export interface IStats extends mongoose.Document {
  server_stats: IServerStats[];
  global_stats: IGlobalStats;
  createdAt: Date;
  updatedAt: Date;
}

const historicalStatsSchema = new mongoose.Schema<IHistoricalStats>({
  requests: { type: Number, default: 0 },
  successful_requests: { type: Number, default: 0 },
  sources_found: { type: Number, default: 0 },
  avg_response_time: { type: Number, default: 0 },
  start_time: { type: Number, required: true },
  end_time: { type: Number, required: true },
});

const serverStatsSchema = new mongoose.Schema<IServerStats>({
  originalName: { type: String, required: true },
  natoName: { type: String, required: true },
  successRate: { type: Number, default: 0 },
  working: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  lastChecked: { type: Number, required: true },
  uptime: { type: Number, default: 100 },
  status: {
    type: String,
    enum: ["operational", "degraded", "down"],
    default: "operational",
  },
  errors: {
    total: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    lastError: { type: String },
  },
});

const globalStatsSchema = new mongoose.Schema<IGlobalStats>({
  total_requests: { type: Number, default: 0 },
  successful_requests: { type: Number, default: 0 },
  total_sources_found: { type: Number, default: 0 },
  avg_response_time: { type: Number, default: 0 },
  last_updated: { type: Number, required: true },
  uptime_start: { type: Number, required: true },
  daily: { type: historicalStatsSchema, required: true },
  weekly: { type: historicalStatsSchema, required: true },
  monthly: { type: historicalStatsSchema, required: true },
  yearly: { type: historicalStatsSchema, required: true },
  alltime: { type: historicalStatsSchema, required: true },
});

const statsSchema = new mongoose.Schema<IStats>(
  {
    server_stats: [serverStatsSchema],
    global_stats: { type: globalStatsSchema, required: true },
  },
  {
    timestamps: true,
  }
);

statsSchema.index({ createdAt: 1 });
statsSchema.index({ "server_stats.originalName": 1 });
statsSchema.index({ "server_stats.natoName": 1 });
statsSchema.index({ "global_stats.last_updated": 1 });

export const Stats = mongoose.model<IStats>("Stats", statsSchema);
