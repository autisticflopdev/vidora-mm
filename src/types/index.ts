export interface RequestPayload {
  mediaType: "movie" | "tv";
  tmdbId: string;
  seasonId?: string;
  episodeId?: string;
  timestamp: number;
  token: string;
}

export interface ServerStats {
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

export interface HistoricalStats {
  requests: number;
  successful_requests: number;
  sources_found: number;
  avg_response_time: number;
  start_time: number;
  end_time: number;
}

export interface GlobalStats {
  total_requests: number;
  successful_requests: number;
  total_sources_found: number;
  avg_response_time: number;
  last_updated: number;
  uptime_start: number;
  daily: HistoricalStats;
  weekly: HistoricalStats;
  monthly: HistoricalStats;
  yearly: HistoricalStats;
  alltime: HistoricalStats;
}

export interface StatsStore {
  server_stats: ServerStats[];
  global_stats: GlobalStats;
  clients: Set<any>;
}

export interface ApiResponse {
  sources: {
    [key: string]:
      | {
          file?: string;
          sources?: any[];
          [key: string]: any;
        }
      | {
          [key: string]: {
            file?: string;
            sources?: any[];
            [key: string]: any;
          };
        };
  };
  tmdb_id: number;
  total_scraping_time: number;
  type: string;
}

export interface EncryptedResponse {
  encryptedData: string;
  iv: string;
  authTag: string;
}
