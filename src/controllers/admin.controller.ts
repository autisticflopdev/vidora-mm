import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { StatsService } from "../services/stats.service";
import { validationResult } from "express-validator";

export class AdminController {
  private static instance: AdminController;
  private authService: AuthService;
  private statsService: StatsService;

  private constructor() {
    this.authService = AuthService.getInstance();
    this.statsService = StatsService.getInstance();
  }

  public static getInstance(): AdminController {
    if (!AdminController.instance) {
      AdminController.instance = new AdminController();
    }
    return AdminController.instance;
  }

  public login = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { accessToken } = req.body;

      if (!accessToken) {
        res.status(400).json({ error: "Access token is required" });
        return;
      }

      const isValid = await this.authService.validateAdmin(accessToken);
      if (!isValid) {
        res.status(401).json({ error: "Invalid access token" });
        return;
      }

      const token = this.authService.generateToken();
      
      res.status(200).json({
        token,
        admin: {
          role: "admin",
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  public getStats = async (_: Request, res: Response): Promise<void> => {
    try {
      const stats = this.statsService.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Get stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  public getAccessToken = async (_: Request, res: Response): Promise<void> => {
    try {
      const token = await this.authService.getAccessToken();
      if (!token) {
        res.status(500).json({ error: "Access token not initialized" });
        return;
      }
      res.json({ token });
    } catch (error) {
      console.error("Get access token error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
