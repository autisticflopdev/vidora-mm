import { Request, Response } from "express";
import { ApiService } from "../services/api.service";
import { EncryptionService } from "../services/encryption.service";
import { config } from "../config";

export class ApiController {
  private static instance: ApiController;
  private apiService: ApiService;

  private constructor() {
    this.apiService = ApiService.getInstance();
  }

  public static getInstance(): ApiController {
    if (!ApiController.instance) {
      ApiController.instance = new ApiController();
    }
    return ApiController.instance;
  }

  public handleRequest = async (req: Request, res: Response) => {
    try {
      const {
        sourceStats: encryptedRequest,
        sourceKey: requestKey,
        sessionId: requestSession,
      } = req.body;

      if (!encryptedRequest || !requestKey || !requestSession) {
        return res.status(400).json({ error: "Invalid request format" });
      }

      const decryptedData = await EncryptionService.decryptRequest(
        encryptedRequest,
        requestKey,
        requestSession
      );

      if (Date.now() - decryptedData._timestamp > config.maxAge) {
        return res.status(403).json({ error: "Request expired" });
      }

      const response = await this.apiService.processRequest(decryptedData);
      const encryptedResponse = await EncryptionService.encryptResponse(
        response
      );

      res.json({
        sourceStats: encryptedResponse.encryptedData,
        sourceKey: encryptedResponse.iv,
        sessionId: encryptedResponse.authTag,
      });
    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  public handleHealthCheck = (_: Request, res: Response) => {
    res.json({ status: "ok" });
  };
}
