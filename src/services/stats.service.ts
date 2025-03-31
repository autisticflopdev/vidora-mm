import { StatsStore, ServerStats, HistoricalStats } from "../types";
import { Source, ISource } from "../models/source.model";
import { Stats } from "../models/stats.model";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const createHistoricalStats = (
  startTime: number,
  endTime: number
): HistoricalStats => ({
  requests: 0,
  successful_requests: 0,
  sources_found: 0,
  avg_response_time: 0,
  start_time: startTime,
  end_time: endTime,
});

export class StatsService {
  private static instance: StatsService;
  private statsStore: StatsStore;
  private sourceMap: Map<string, string> = new Map();
  private initialized: boolean = false;

  private constructor() {
    this.statsStore = {
      server_stats: [],
      global_stats: {
        total_requests: 0,
        successful_requests: 0,
        total_sources_found: 0,
        avg_response_time: 0,
        last_updated: now,
        uptime_start: now,
        daily: createHistoricalStats(now - DAY, now),
        weekly: createHistoricalStats(now - 7 * DAY, now),
        monthly: createHistoricalStats(now - 30 * DAY, now),
        yearly: createHistoricalStats(now - 365 * DAY, now),
        alltime: createHistoricalStats(now, now),
      },
      clients: new Set(),
    };
    this.initializeStats().catch((err) => {
      console.error("Failed to initialize stats service:", err);
    });
  }

  private async initializeStats() {
    try {
      console.log("Initializing stats service...");
      const sources = await Source.find({});
      this.sourceMap.clear();
      
      const newServerStats: ServerStats[] = [];

      console.log(`Found ${sources.length} sources in database`);
      sources.forEach((source) => {
        this.sourceMap.set(source.originalName.toLowerCase(), source.natoName);
        if (source.isRgaio) {
          this.sourceMap.set(`rgaio_${source.originalName.toLowerCase()}`, source.natoName);
        }

        console.log(`Mapped source: ${source.originalName} → ${source.natoName}`);
        
        newServerStats.push({
          originalName: source.originalName,
          natoName: source.natoName,
          successRate: 0,
          working: 0,
          total: 0,
          lastChecked: now,
          uptime: 100,
          status: "operational",
          errors: {
            total: 0,
            rate: 0,
          },
        });
      });

      const latestStats = await Stats.findOne().sort({ createdAt: -1 });
      if (latestStats) {
        console.log("Found existing stats record, merging with current sources");
        
        this.statsStore.global_stats = latestStats.global_stats;

        const existingStatsByOriginalName = new Map();
        latestStats.server_stats.forEach(stat => {
          if (stat.originalName) {
            existingStatsByOriginalName.set(stat.originalName.toLowerCase(), stat);
          }
        });
        
        this.statsStore.server_stats = newServerStats.map(newStat => {
          const existingStat = existingStatsByOriginalName.get(newStat.originalName.toLowerCase());
          if (existingStat) {
            return {
              ...existingStat,
              originalName: newStat.originalName,
              natoName: newStat.natoName
            };
          }
          return newStat;
        });
        
        console.log(`Merged stats for ${this.statsStore.server_stats.length} servers`);
      } else {
        console.log("No existing stats found, creating new stats");
        this.statsStore.server_stats = newServerStats;
      }

      this.statsStore.server_stats.sort((a, b) =>
        a.originalName.localeCompare(b.originalName)
      );

      this.initialized = true;
      console.log(
        "Stats service initialized with sources:",
        this.statsStore.server_stats.map((s) => `${s.originalName} (${s.natoName}) - ${s.total} requests`).join(", ")
      );
    } catch (error) {
      console.error("Error initializing stats:", error);
      throw error;
    }
  }

  public static getInstance(): StatsService {
    if (!StatsService.instance) {
      StatsService.instance = new StatsService();
    }
    return StatsService.instance;
  }

  private updateHistoricalStats(
    stats: HistoricalStats,
    responseTime: number,
    sourcesFound: number,
    isSuccessful: boolean
  ) {
    try {
      if (!stats) {
        console.error("Cannot update undefined historical stats");
        return;
      }
      
      if (typeof stats.requests !== 'number') stats.requests = 0;
      if (typeof stats.successful_requests !== 'number') stats.successful_requests = 0;
      if (typeof stats.sources_found !== 'number') stats.sources_found = 0;
      if (typeof stats.avg_response_time !== 'number') stats.avg_response_time = 0;
      
      stats.requests = this.sanitizeNumber(stats.requests) + 1;
      
      if (isSuccessful) {
        stats.successful_requests = this.sanitizeNumber(stats.successful_requests) + 1;
      }
      
      stats.sources_found = this.sanitizeNumber(stats.sources_found) + sourcesFound;
      
      const totalTime = this.sanitizeNumber(stats.avg_response_time) * (this.sanitizeNumber(stats.requests) - 1);
      stats.avg_response_time = Number(
        ((totalTime + this.sanitizeNumber(responseTime)) / this.sanitizeNumber(stats.requests)).toFixed(2)
      );
    } catch (error) {
      console.error("Error updating historical stats:", error);
    }
  }

  private rotateHistoricalStats() {
    try {
      const now = Date.now();
      const dayStart = now - DAY;
      const weekStart = now - 7 * DAY;
      const monthStart = now - 30 * DAY;
      const yearStart = now - 365 * DAY;

      if (!this.statsStore.global_stats) {
        this.statsStore.global_stats = {
          total_requests: 0,
          successful_requests: 0,
          total_sources_found: 0,
          avg_response_time: 0,
          last_updated: now,
          uptime_start: now,
          daily: createHistoricalStats(dayStart, now),
          weekly: createHistoricalStats(weekStart, now),
          monthly: createHistoricalStats(monthStart, now),
          yearly: createHistoricalStats(yearStart, now),
          alltime: createHistoricalStats(now, now),
        };
        return;
      }

      if (!this.statsStore.global_stats.daily) {
        this.statsStore.global_stats.daily = createHistoricalStats(dayStart, now);
      } else if (now > this.sanitizeNumber(this.statsStore.global_stats.daily.end_time)) {
        this.statsStore.global_stats.daily = createHistoricalStats(dayStart, now);
      }

      if (!this.statsStore.global_stats.weekly) {
        this.statsStore.global_stats.weekly = createHistoricalStats(weekStart, now);
      } else if (now > this.sanitizeNumber(this.statsStore.global_stats.weekly.end_time)) {
        this.statsStore.global_stats.weekly = createHistoricalStats(weekStart, now);
      }

      if (!this.statsStore.global_stats.monthly) {
        this.statsStore.global_stats.monthly = createHistoricalStats(monthStart, now);
      } else if (now > this.sanitizeNumber(this.statsStore.global_stats.monthly.end_time)) {
        this.statsStore.global_stats.monthly = createHistoricalStats(monthStart, now);
      }

      if (!this.statsStore.global_stats.yearly) {
        this.statsStore.global_stats.yearly = createHistoricalStats(yearStart, now);
      } else if (now > this.sanitizeNumber(this.statsStore.global_stats.yearly.end_time)) {
        this.statsStore.global_stats.yearly = createHistoricalStats(yearStart, now);
      }

      if (!this.statsStore.global_stats.alltime) {
        this.statsStore.global_stats.alltime = createHistoricalStats(now, now);
      }
    } catch (error) {
      console.error("Error rotating historical stats:", error);
      const now = Date.now();
      this.statsStore.global_stats = {
        total_requests: this.sanitizeNumber(this.statsStore.global_stats?.total_requests),
        successful_requests: this.sanitizeNumber(this.statsStore.global_stats?.successful_requests),
        total_sources_found: this.sanitizeNumber(this.statsStore.global_stats?.total_sources_found),
        avg_response_time: this.sanitizeNumber(this.statsStore.global_stats?.avg_response_time),
        last_updated: now,
        uptime_start: this.sanitizeNumber(this.statsStore.global_stats?.uptime_start, now),
        daily: createHistoricalStats(now - DAY, now),
        weekly: createHistoricalStats(now - 7 * DAY, now),
        monthly: createHistoricalStats(now - 30 * DAY, now),
        yearly: createHistoricalStats(now - 365 * DAY, now),
        alltime: createHistoricalStats(now, now),
      };
    }
  }

  private isValidSource(source: any): boolean {
    if (!source || typeof source !== "object") return false;

     if (source.file === "user-selected") {
      return true;
    }

    if (
      "file" in source &&
      typeof source.file === "string" &&
      source.file.trim() !== ""
    ) {
      return true;
    }

    if (
      "sources" in source &&
      Array.isArray(source.sources) &&
      source.sources.length > 0
    ) {
      return source.sources.some(
        (s: { file?: string }) =>
          s &&
          typeof s === "object" &&
          s.file &&
          typeof s.file === "string" &&
          s.file.trim() !== ""
      );
    }

    if (
      "url" in source &&
      typeof source.url === "string" &&
      source.url.trim() !== ""
    ) {
      return true;
    }

    return false;
  }

  private sanitizeNumber(value: any, defaultValue: number = 0): number {
    if (value === undefined || value === null || isNaN(Number(value))) {
      return defaultValue;
    }
    return Number(value);
  }

  private createSafeServerStat(stat: ServerStats): ServerStats {
    return {
      originalName: stat.originalName || "unknown",
      natoName: stat.natoName || "unknown",
      successRate: this.sanitizeNumber(stat.successRate),
      working: this.sanitizeNumber(stat.working),
      total: this.sanitizeNumber(stat.total),
      lastChecked: this.sanitizeNumber(stat.lastChecked, Date.now()),
      uptime: this.sanitizeNumber(stat.uptime, 100),
      status: stat.status || "operational",
      errors: {
        total: this.sanitizeNumber(stat.errors?.total),
        rate: this.sanitizeNumber(stat.errors?.rate),
        lastError: stat.errors?.lastError || undefined
      }
    };
  }

  private createSafeHistoricalStats(stats: HistoricalStats): HistoricalStats {
    return {
      requests: this.sanitizeNumber(stats.requests),
      successful_requests: this.sanitizeNumber(stats.successful_requests),
      sources_found: this.sanitizeNumber(stats.sources_found),
      avg_response_time: this.sanitizeNumber(stats.avg_response_time),
      start_time: this.sanitizeNumber(stats.start_time, Date.now() - 86400000),
      end_time: this.sanitizeNumber(stats.end_time, Date.now())
    };
  }

  private createSafeGlobalStats(stats: any): any {
    try {
      if (!stats) {
        const now = Date.now();
        return {
          total_requests: 0,
          successful_requests: 0,
          total_sources_found: 0,
          avg_response_time: 0,
          last_updated: now,
          uptime_start: now,
          daily: createHistoricalStats(now - DAY, now),
          weekly: createHistoricalStats(now - 7 * DAY, now),
          monthly: createHistoricalStats(now - 30 * DAY, now),
          yearly: createHistoricalStats(now - 365 * DAY, now),
          alltime: createHistoricalStats(now, now),
        };
      }

      return {
        total_requests: this.sanitizeNumber(stats.total_requests),
        successful_requests: this.sanitizeNumber(stats.successful_requests),
        total_sources_found: this.sanitizeNumber(stats.total_sources_found),
        avg_response_time: this.sanitizeNumber(stats.avg_response_time),
        last_updated: this.sanitizeNumber(stats.last_updated, Date.now()),
        uptime_start: this.sanitizeNumber(stats.uptime_start, Date.now()),
        daily: stats.daily ? this.createSafeHistoricalStats(stats.daily) : createHistoricalStats(Date.now() - DAY, Date.now()),
        weekly: stats.weekly ? this.createSafeHistoricalStats(stats.weekly) : createHistoricalStats(Date.now() - 7 * DAY, Date.now()),
        monthly: stats.monthly ? this.createSafeHistoricalStats(stats.monthly) : createHistoricalStats(Date.now() - 30 * DAY, Date.now()),
        yearly: stats.yearly ? this.createSafeHistoricalStats(stats.yearly) : createHistoricalStats(Date.now() - 365 * DAY, Date.now()),
        alltime: stats.alltime ? this.createSafeHistoricalStats(stats.alltime) : createHistoricalStats(Date.now(), Date.now())
      };
    } catch (error) {
      console.error("Error creating safe global stats:", error);
      const now = Date.now();
      return {
        total_requests: 0,
        successful_requests: 0,
        total_sources_found: 0,
        avg_response_time: 0,
        last_updated: now,
        uptime_start: now,
        daily: createHistoricalStats(now - DAY, now),
        weekly: createHistoricalStats(now - 7 * DAY, now),
        monthly: createHistoricalStats(now - 30 * DAY, now),
        yearly: createHistoricalStats(now - 365 * DAY, now),
        alltime: createHistoricalStats(now, now),
      };
    }
  }

  private updateServerStats(
    serverName: string,
    source: any,
    processedServers: Set<string>
  ): boolean {
    try {
      if (!serverName) {
        console.warn("Empty or undefined server name passed to updateServerStats");
        return false;
      }

      if (processedServers.has(serverName)) return false;
      processedServers.add(serverName);

      const normalizeServerName = (name: string): string => {
        if (!name) return "";
        let normalized = name.toLowerCase().trim();
        
        const isRgaio = normalized.startsWith('rgaio_');
        normalized = isRgaio ? normalized.slice(6) : normalized;
        
        normalized = normalized.replace(/(\d+|[_-]v\d+)$/, '');
        
        return normalized;
      };
      
      const normalizedServerName = normalizeServerName(serverName);
      console.log(`Processing server stats for: ${serverName} (normalized: ${normalizedServerName})`);
      
      let stat = null;
      try {
        const findMatchingServer = () => {
          if (!this.statsStore || !this.statsStore.server_stats || !Array.isArray(this.statsStore.server_stats)) {
            console.error("Invalid server_stats array in statsStore");
            return null;
          }
          
          let foundStat = this.statsStore.server_stats.find(
            s => s && s.originalName && normalizeServerName(s.originalName) === normalizedServerName
          );
          
          if (foundStat) return foundStat;
          
          foundStat = this.statsStore.server_stats.find(s => {
            if (!s || !s.originalName) return false;
            const normalizedStatName = normalizeServerName(s.originalName);
            return normalizedStatName.includes(normalizedServerName) || 
                  normalizedServerName.includes(normalizedStatName);
          });
          
          return foundStat || null;
        };
        
        stat = findMatchingServer();
      } catch (matchError) {
        console.error("Error finding matching server:", matchError);
        stat = null;
      }
      
      if (!stat) {
        console.warn(`No stats found for server: ${serverName} (normalized: ${normalizedServerName})`);
        
        const newStat: ServerStats = {
          originalName: serverName || "unknown",
          natoName: serverName || "unknown",
          successRate: 0,
          working: 0,
          total: 0,
          lastChecked: Date.now(),
          uptime: 100,
          status: "operational",
          errors: {
            total: 0,
            rate: 0,
          }
        };
        
        if (!this.statsStore.server_stats) {
          this.statsStore.server_stats = [];
        }
        
        this.statsStore.server_stats.push(newStat);
        console.log(`Created new stats entry for server: ${serverName}`);
        
        stat = newStat;
      }

      if (!stat) {
        console.error(`Failed to create or find stat for server: ${serverName}`);
        return false;
      }

      if (!stat.errors) {
        stat.errors = {
          total: 0,
          rate: 0
        };
      }

      console.log(`Updating stats for ${stat.originalName} (${stat.natoName}): working=${stat.working}, total=${stat.total}`);
      
      stat.total = this.sanitizeNumber(stat.total) + 1;
      const isWorking = this.isValidSource(source);

      if (isWorking) {
        stat.working = this.sanitizeNumber(stat.working) + 1;
      }

      stat.successRate = Number(((this.sanitizeNumber(stat.working) / this.sanitizeNumber(stat.total)) * 100).toFixed(2));
      stat.lastChecked = Date.now();

      if (stat.successRate >= 80) {
        stat.status = "operational";
      } else if (stat.successRate >= 50) {
        stat.status = "degraded";
      } else {
        stat.status = "down";
      }

      if (!isWorking) {
        if (!stat.errors) {
          stat.errors = { total: 0, rate: 0 };
        }
        
        stat.errors.total = this.sanitizeNumber(stat.errors.total) + 1;
        stat.errors.rate = Number(
          ((this.sanitizeNumber(stat.errors.total) / this.sanitizeNumber(stat.total)) * 100).toFixed(2)
        );
        
        if (source && source.error) {
          stat.errors.lastError = typeof source.error === 'string' 
            ? source.error 
            : JSON.stringify(source.error).substring(0, 500);
        }
      }

      const timeWeight = 0.7;
      stat.uptime = Number(
        (timeWeight * stat.successRate + (1 - timeWeight) * this.sanitizeNumber(stat.uptime)).toFixed(2)
      );
      
      console.log(`Updated stats for ${stat.originalName} (${stat.natoName}): working=${stat.working}, total=${stat.total}, success=${stat.successRate}%`);

      return isWorking;
    } catch (error) {
      console.error("Error in updateServerStats:", error);
      return false;
    }
  }

  public async updateStats(sources: any, responseTime: number): Promise<void> {
    try {
      if (!this.initialized) {
        console.log("Stats service not initialized yet, waiting...");
        try {
          await this.initializeStats();
        } catch (initError) {
          console.error("Failed to initialize stats service:", initError);
          this.statsStore = {
            server_stats: [],
            global_stats: {
              total_requests: 0,
              successful_requests: 0,
              total_sources_found: 0,
              avg_response_time: 0,
              last_updated: Date.now(),
              uptime_start: Date.now(),
              daily: createHistoricalStats(Date.now() - DAY, Date.now()),
              weekly: createHistoricalStats(Date.now() - 7 * DAY, Date.now()),
              monthly: createHistoricalStats(Date.now() - 30 * DAY, Date.now()),
              yearly: createHistoricalStats(Date.now() - 365 * DAY, Date.now()),
              alltime: createHistoricalStats(Date.now(), Date.now()),
            },
            clients: new Set(),
          };
          this.initialized = true;
        }
      }

      if (!this.statsStore) {
        console.error("StatsStore is undefined, recreating it");
        this.statsStore = {
          server_stats: [],
          global_stats: {
            total_requests: 0,
            successful_requests: 0,
            total_sources_found: 0,
            avg_response_time: 0,
            last_updated: Date.now(),
            uptime_start: Date.now(),
            daily: createHistoricalStats(Date.now() - DAY, Date.now()),
            weekly: createHistoricalStats(Date.now() - 7 * DAY, Date.now()),
            monthly: createHistoricalStats(Date.now() - 30 * DAY, Date.now()),
            yearly: createHistoricalStats(Date.now() - 365 * DAY, Date.now()),
            alltime: createHistoricalStats(Date.now(), Date.now()),
          },
          clients: new Set(),
        };
      }

      if (!this.statsStore.server_stats) {
        console.error("server_stats array is undefined, recreating it");
        this.statsStore.server_stats = [];
      }

      if (!this.statsStore.global_stats) {
        console.error("global_stats is undefined, recreating it");
        this.statsStore.global_stats = {
          total_requests: 0,
          successful_requests: 0,
          total_sources_found: 0,
          avg_response_time: 0,
          last_updated: Date.now(),
          uptime_start: Date.now(),
          daily: createHistoricalStats(Date.now() - DAY, Date.now()),
          weekly: createHistoricalStats(Date.now() - 7 * DAY, Date.now()),
          monthly: createHistoricalStats(Date.now() - 30 * DAY, Date.now()),
          yearly: createHistoricalStats(Date.now() - 365 * DAY, Date.now()),
          alltime: createHistoricalStats(Date.now(), Date.now()),
        };
      }

      if (!sources || typeof sources !== "object") {
        console.log("Invalid sources format, skipping stats update");
        return;
      }

      console.log("Updating stats with response time:", responseTime);
      console.log("Sources structure:", Object.keys(sources).join(", "));

      const now = Date.now();
      this.rotateHistoricalStats();

      this.statsStore.global_stats.total_requests = this.sanitizeNumber(this.statsStore.global_stats.total_requests) + 1;
      let sourcesFound = 0;
      const processedServers = new Set<string>();

      try {
        if (sources.sources && typeof sources.sources === "object") {
          console.log("Processing API response format:", Object.keys(sources.sources).join(", "));
          
          Object.entries(sources.sources).forEach(([server, source]) => {
            if (server && server !== "rgaio") {
              const isValid = this.updateServerStats(server, source, processedServers);
              if (isValid) {
                sourcesFound++;
                console.log(`Valid source found for ${server}`);
              }
            }
          });

          if (sources.sources.rgaio && typeof sources.sources.rgaio === "object") {
            console.log("Processing rgaio nested sources");
            
            Object.entries(sources.sources.rgaio).forEach(([nestedServer, source]) => {
              if (nestedServer) {
                const serverName = `rgaio_${nestedServer}`;
                const isValid = this.updateServerStats(serverName, source, processedServers);
                if (isValid) {
                  sourcesFound++;
                  console.log(`Valid source found for ${serverName}`);
                }
              }
            });
          }
        }
        else if (sources.server || sources.provider || sources.currentServer) {
          console.log("Processing direct player source format");
          const serverName = sources.server || sources.provider || sources.currentServer;
          
          if (serverName) {
            const serverData = sources.data || sources;
            const isValid = this.updateServerStats(serverName, serverData, processedServers);
            if (isValid) {
              sourcesFound++;
              console.log(`Valid direct source found for ${serverName}`);
            }
          }
        }
        else {
          console.log("Processing legacy format:", Object.keys(sources).join(", "));
          
          Object.entries(sources).forEach(([server, source]) => {
            if (server && server !== "rgaio" && server !== "tmdb_id" && server !== "type" && 
                server !== "total_scraping_time") {
              const isValid = this.updateServerStats(server, source, processedServers);
              if (isValid) {
                sourcesFound++;
                console.log(`Valid source found for ${server}`);
              }
            }
          });

          if (sources.rgaio && typeof sources.rgaio === "object") {
            console.log("Processing rgaio sources in legacy mode");
            
            Object.entries(sources.rgaio).forEach(([nestedServer, source]) => {
              if (nestedServer) {
                const serverName = `rgaio_${nestedServer}`;
                const isValid = this.updateServerStats(serverName, source, processedServers);
                if (isValid) {
                  sourcesFound++;
                  console.log(`Valid source found for ${serverName}`);
                }
              }
            });
          }
        }
      } catch (error) {
        console.error("Error processing sources:", error);
      }

      console.log(`Found ${sourcesFound} valid sources in total`);
      
      const isSuccessful = sourcesFound > 0;
      this.statsStore.global_stats.successful_requests = this.sanitizeNumber(this.statsStore.global_stats.successful_requests) + (isSuccessful ? 1 : 0);
      this.statsStore.global_stats.total_sources_found = this.sanitizeNumber(this.statsStore.global_stats.total_sources_found) + sourcesFound;
      
      const sanitizedResponseTime = this.sanitizeNumber(responseTime);
      if (this.statsStore.global_stats.total_requests > 1) {
        const totalRequests = this.sanitizeNumber(this.statsStore.global_stats.total_requests);
        const avgResponseTime = this.sanitizeNumber(this.statsStore.global_stats.avg_response_time);
        
        const totalTime = avgResponseTime * (totalRequests - 1);
        this.statsStore.global_stats.avg_response_time = Number(
          ((totalTime + sanitizedResponseTime) / totalRequests).toFixed(2)
        );
      } else {
        this.statsStore.global_stats.avg_response_time = sanitizedResponseTime;
      }
      
      this.statsStore.global_stats.last_updated = now;

      if (!this.statsStore.global_stats.daily) {
        this.statsStore.global_stats.daily = createHistoricalStats(now - DAY, now);
      }
      if (!this.statsStore.global_stats.weekly) {
        this.statsStore.global_stats.weekly = createHistoricalStats(now - 7 * DAY, now);
      }
      if (!this.statsStore.global_stats.monthly) {
        this.statsStore.global_stats.monthly = createHistoricalStats(now - 30 * DAY, now);
      }
      if (!this.statsStore.global_stats.yearly) {
        this.statsStore.global_stats.yearly = createHistoricalStats(now - 365 * DAY, now);
      }
      if (!this.statsStore.global_stats.alltime) {
        this.statsStore.global_stats.alltime = createHistoricalStats(now, now);
      }

      this.updateHistoricalStats(
        this.statsStore.global_stats.daily,
        sanitizedResponseTime,
        sourcesFound,
        isSuccessful
      );
      this.updateHistoricalStats(
        this.statsStore.global_stats.weekly,
        sanitizedResponseTime,
        sourcesFound,
        isSuccessful
      );
      this.updateHistoricalStats(
        this.statsStore.global_stats.monthly,
        sanitizedResponseTime,
        sourcesFound,
        isSuccessful
      );
      this.updateHistoricalStats(
        this.statsStore.global_stats.yearly,
        sanitizedResponseTime,
        sourcesFound,
        isSuccessful
      );
      this.updateHistoricalStats(
        this.statsStore.global_stats.alltime,
        sanitizedResponseTime,
        sourcesFound,
        isSuccessful
      );

      try {
        console.log("Saving updated stats to database");
        
        const safeServerStats = this.statsStore.server_stats
          .filter(stat => stat && stat.originalName)
          .map(stat => this.createSafeServerStat(stat));
          
        const safeGlobalStats = this.createSafeGlobalStats(this.statsStore.global_stats);
        
        const stats = new Stats({
          server_stats: safeServerStats,
          global_stats: safeGlobalStats,
        });
        
        await stats.save();
        console.log("Stats saved successfully");
      } catch (error) {
        console.error("Error saving stats to database:", error);
      }

      this.broadcastStats();
    } catch (error) {
      console.error("Error updating stats:", error);
    }
  }

  public addClient(client: any) {
    this.statsStore.clients.add(client);
  }

  public removeClient(client: any) {
    this.statsStore.clients.delete(client);
  }

  public getStats() {
    try {
      const sanitizedServerStats = this.statsStore.server_stats
        .filter(stat => stat && stat.originalName)
        .map((stat) => {
          const safeStat = this.createSafeServerStat(stat);
          
          return {
            name: safeStat.originalName,
            natoName: safeStat.natoName,
            successRate: safeStat.successRate,
            working: safeStat.working,
            total: safeStat.total,
            lastChecked: safeStat.lastChecked,
            uptime: safeStat.uptime,
            status: safeStat.status,
            errors: {
              total: safeStat.errors.total,
              rate: safeStat.errors.rate,
              lastError: safeStat.errors.lastError,
            },
          };
        });

      return {
        server_stats: sanitizedServerStats,
        global_stats: this.createSafeGlobalStats(this.statsStore.global_stats),
      };
    } catch (error) {
      console.error("Error in getStats:", error);
      return {
        server_stats: [],
        global_stats: createHistoricalStats(Date.now() - DAY, Date.now())
      };
    }
  }

  private broadcastStats() {
    try {
      const sanitizedStats = this.getStats();
      this.statsStore.clients.forEach((client) => {
        try {
          if (client && typeof client.write === 'function') {
            client.write(`data: ${JSON.stringify(sanitizedStats)}\n\n`);
          }
        } catch (error) {
          console.error("Error broadcasting to client:", error);
          if (client) {
            this.statsStore.clients.delete(client);
          }
        }
      });
    } catch (error) {
      console.error("Error in broadcastStats:", error);
    }
  }

  public async refreshSourceMappings() {
    await this.initializeStats();
  }

  public async addNewSource(source: ISource): Promise<void> {
    if (!this.initialized) {
      await this.initializeStats();
    }

    this.sourceMap.set(source.originalName, source.natoName);
    if (source.isRgaio) {
      this.sourceMap.set(`rgaio_${source.originalName}`, source.natoName);
    }

    const newStats: ServerStats = {
      originalName: source.originalName,
      natoName: source.natoName,
      successRate: 0,
      working: 0,
      total: 0,
      lastChecked: now,
      uptime: 100,
      status: "operational",
      errors: {
        total: 0,
        rate: 0,
      },
    };

    this.statsStore.server_stats.push(newStats);

    this.statsStore.server_stats.sort((a, b) =>
      a.originalName.localeCompare(b.originalName)
    );

    try {
      const stats = new Stats({
        server_stats: this.statsStore.server_stats,
        global_stats: this.statsStore.global_stats,
      });
      await stats.save();
      this.broadcastStats();
    } catch (error) {
      console.error("Error saving stats after adding new source:", error);
    }
  }

  public async removeSource(originalName: string): Promise<void> {
    if (!this.initialized) {
      await this.initializeStats();
    }

    this.statsStore.server_stats = this.statsStore.server_stats.filter(
      (stat) => stat.originalName !== originalName
    );

    for (const [key, value] of this.sourceMap.entries()) {
      if (key === originalName || key === `rgaio_${originalName}`) {
        this.sourceMap.delete(key);
      }
    }

    try {
      const stats = new Stats({
        server_stats: this.statsStore.server_stats,
        global_stats: this.statsStore.global_stats,
      });
      await stats.save();
      this.broadcastStats();
    } catch (error) {
      console.error("Error saving stats after removing source:", error);
    }
  }

  public async updateSourceNames(
    updates: { oldName: string; newName: string }[]
  ): Promise<void> {
    if (!this.initialized) {
      await this.initializeStats();
    }

    for (const update of updates) {
      const stat = this.statsStore.server_stats.find(
        (s) => s.originalName === update.oldName
      );
      if (stat) {
        stat.originalName = update.newName;
      }
    }

    this.statsStore.server_stats.sort((a, b) =>
      a.originalName.localeCompare(b.originalName)
    );

    try {
      const stats = new Stats({
        server_stats: this.statsStore.server_stats,
        global_stats: this.statsStore.global_stats,
      });
      await stats.save();
      this.broadcastStats();
    } catch (error) {
      console.error("Error saving stats after updating source names:", error);
    }
  }

  public async updateServerSelection(serverName: string, isSuccessful: boolean): Promise<boolean> {
    if (!this.initialized) {
      try {
        await this.initializeStats();
      } catch (error) {
        console.error("Failed to initialize stats service:", error);
        this.statsStore = {
          server_stats: [],
          global_stats: {
            total_requests: 0,
            successful_requests: 0,
            total_sources_found: 0,
            avg_response_time: 0,
            last_updated: Date.now(),
            uptime_start: Date.now(),
            daily: createHistoricalStats(Date.now() - DAY, Date.now()),
            weekly: createHistoricalStats(Date.now() - 7 * DAY, Date.now()),
            monthly: createHistoricalStats(Date.now() - 30 * DAY, Date.now()),
            yearly: createHistoricalStats(Date.now() - 365 * DAY, Date.now()),
            alltime: createHistoricalStats(Date.now(), Date.now()),
          },
          clients: new Set(),
        };
        this.initialized = true;
      }
    }
    
    if (!serverName) {
      console.error("Server name is required for updateServerSelection");
      return false;
    }
    
    try {
      console.log(`Processing direct server selection: ${serverName}, successful: ${isSuccessful}`);
      
      if (!this.statsStore) {
        console.error("StatsStore is undefined in updateServerSelection, creating it");
        this.statsStore = {
          server_stats: [],
          global_stats: {
            total_requests: 0,
            successful_requests: 0,
            total_sources_found: 0,
            avg_response_time: 0,
            last_updated: Date.now(),
            uptime_start: Date.now(),
            daily: createHistoricalStats(Date.now() - DAY, Date.now()),
            weekly: createHistoricalStats(Date.now() - 7 * DAY, Date.now()),
            monthly: createHistoricalStats(Date.now() - 30 * DAY, Date.now()),
            yearly: createHistoricalStats(Date.now() - 365 * DAY, Date.now()),
            alltime: createHistoricalStats(Date.now(), Date.now()),
          },
          clients: new Set(),
        };
      }

      if (!this.statsStore.server_stats) {
        console.error("server_stats array is undefined in updateServerSelection, creating it");
        this.statsStore.server_stats = [];
      }

      if (!this.statsStore.global_stats) {
        console.error("global_stats is undefined in updateServerSelection, creating it");
        this.statsStore.global_stats = {
          total_requests: 0,
          successful_requests: 0,
          total_sources_found: 0,
          avg_response_time: 0,
          last_updated: Date.now(),
          uptime_start: Date.now(),
          daily: createHistoricalStats(Date.now() - DAY, Date.now()),
          weekly: createHistoricalStats(Date.now() - 7 * DAY, Date.now()),
          monthly: createHistoricalStats(Date.now() - 30 * DAY, Date.now()),
          yearly: createHistoricalStats(Date.now() - 365 * DAY, Date.now()),
          alltime: createHistoricalStats(Date.now(), Date.now()),
        };
      }
      
      const processedServers = new Set<string>();
      const source = isSuccessful 
        ? { file: "user-selected" } 
        : { error: "User selection failed" };
      
      const result = this.updateServerStats(serverName, source, processedServers);
      
      if (isSuccessful) {
        this.statsStore.global_stats.successful_requests = this.sanitizeNumber(this.statsStore.global_stats.successful_requests) + 1;
        this.statsStore.global_stats.total_sources_found = this.sanitizeNumber(this.statsStore.global_stats.total_sources_found) + 1;
      }
      
      this.statsStore.global_stats.last_updated = Date.now();
      
      try {
        if (!this.statsStore.server_stats || !Array.isArray(this.statsStore.server_stats)) {
          console.error("server_stats is still undefined or not an array before saving");
          this.statsStore.server_stats = [];
          return false;
        }
        
        const safeServerStats = this.statsStore.server_stats
          .filter(stat => stat && stat.originalName)
          .map(stat => this.createSafeServerStat(stat));
          
        const safeGlobalStats = this.createSafeGlobalStats(this.statsStore.global_stats);
        
        const stats = new Stats({
          server_stats: safeServerStats.length > 0 ? safeServerStats : [],
          global_stats: safeGlobalStats,
        });
        
        await stats.save();
        console.log("Server selection stats saved successfully");
        
        this.broadcastStats();
        
        return true;
      } catch (error) {
        console.error("Error saving server selection stats:", error);
        return false;
      }
    } catch (error) {
      console.error("Error in updateServerSelection:", error);
      return false;
    }
  }
}
