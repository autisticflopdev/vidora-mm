import { Request, Response } from "express";
import { StatsService } from "../services/stats.service";

export class StatsController {
  private static instance: StatsController;
  private statsService: StatsService;

  private constructor() {
    this.statsService = StatsService.getInstance();
  }

  public static getInstance(): StatsController {
    if (!StatsController.instance) {
      StatsController.instance = new StatsController();
    }
    return StatsController.instance;
  }

  public handleStats = (req: Request, res: Response) => {
    try {
      const acceptsSSE = req.headers.accept?.includes("text/event-stream");

      if (acceptsSSE) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no"
        });

        const sanitizedStats = this.statsService.getStats();
        res.write(`data: ${JSON.stringify(sanitizedStats)}\n\n`);
        
        const heartbeatInterval = setInterval(() => {
          if (res.writableEnded) {
            clearInterval(heartbeatInterval);
            return;
          }
          res.write(":heartbeat\n\n");
        }, 30000);

        this.statsService.addClient(res);

        req.on("close", () => {
          clearInterval(heartbeatInterval);
          this.statsService.removeClient(res);
        });
        
        res.on("error", (err) => {
          console.error("Error in SSE connection:", err);
          clearInterval(heartbeatInterval);
          this.statsService.removeClient(res);
        });
      } else {
        const sanitizedStats = this.statsService.getStats();
        res.set({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.json(sanitizedStats);
      }
    } catch (error) {
      console.error("Error handling stats request:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error processing stats request" });
      }
    }
  };


  public handleServerSelection = async (req: Request, res: Response) => {
    try {
      const { serverName, successful, data } = req.body;
      
      if (!serverName) {
        return res.status(400).json({ error: "Server name is required" });
      }
      
      console.log(`Received server selection update: ${serverName}, successful: ${successful}`);
      
      const sourceData = data || {
        file: successful !== false ? "user-selected" : null,
        error: successful === false ? "User selection failed" : null
      };
      
      const sourceObject = {
        server: serverName,
        provider: serverName,
        currentServer: serverName,
        data: sourceData
      };
      
      await this.statsService.updateStats(sourceObject, 0);
      
      const result = await this.statsService.updateServerSelection(
        serverName, 
        successful !== false
      );
      
      if (result) {
        res.json({ 
          success: true, 
          message: "Server stats updated",
          serverName,
          timestamp: Date.now()
        });
      } else {
        res.status(500).json({ error: "Failed to update server stats" });
      }
    } catch (error) {
      console.error("Error handling server selection update:", error);
      res.status(500).json({ error: "Error processing server selection update" });
    }
  };
}
