import { config } from "../config";
import { RequestPayload, ApiResponse } from "../types";
import { EncryptionService } from "./encryption.service";
import { StatsService } from "./stats.service";
import { SourceService } from "./source.service";

export class ApiService {
  private static instance: ApiService;
  private statsService: StatsService;
  private sourceService: SourceService;

  private constructor() {
    this.statsService = StatsService.getInstance();
    this.sourceService = SourceService.getInstance();
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  public async processRequest(payload: RequestPayload): Promise<ApiResponse> {
    const startTime = Date.now();
    const isValid = await EncryptionService.verifyRequest(payload);
    if (!isValid) {
      throw new Error("Invalid request");
    }

    let apiPath = "";
    if (payload.mediaType === "movie") {
      apiPath = `/xxxlol/movie/${payload.tmdbId}`;
    } else if (payload.mediaType === "tv") {
      apiPath = `/xxxlol/tv/${payload.tmdbId}/${payload.seasonId}/${payload.episodeId}`;
    } else {
      throw new Error("Invalid media type");
    }

    const response = await fetch(`${config.baseUrl}${apiPath}`);
    
    if (!response.ok) {
      const errorStatus = response.status;
      const errorMessage = `API request failed: ${errorStatus} ${response.statusText}`;
      
      if (errorStatus === 403) {
        console.error(`403 Forbidden error detected for ${config.baseUrl}${apiPath}`);
        throw new Error(`Access forbidden (403) to the streaming API. Domain may be blocked or credentials invalid.`);
      }
      
      throw new Error(errorMessage);
    }

    const data = (await response.json()) as ApiResponse;
    const responseTime = Date.now() - startTime;

    if (data && data.sources) {
      this.statsService
        .updateStats(data.sources, responseTime)
        .catch((error) => {
          console.error("Error updating stats:", error);
        });
    }

    const transformedData = await this.sourceService.transformSourceResponse(
      data
    );
    return transformedData;
  }
}
