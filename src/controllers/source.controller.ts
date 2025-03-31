import { Request, Response } from "express";
import { SourceService } from "../services/source.service";

export class SourceController {
  private static instance: SourceController;
  private sourceService: SourceService;

  private constructor() {
    this.sourceService = SourceService.getInstance();
  }

  public static getInstance(): SourceController {
    if (!SourceController.instance) {
      SourceController.instance = new SourceController();
    }
    return SourceController.instance;
  }

  public getSources = async (_: Request, res: Response): Promise<void> => {
    try {
      const sources = await this.sourceService.getAllSources();
      res.json(sources);
    } catch (error) {
      console.error("Error getting sources:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  public createSource = async (req: Request, res: Response): Promise<void> => {
    try {
      const { originalName, natoName, isRgaio } = req.body;

      if (!originalName || !natoName) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      const source = await this.sourceService.createSource({
        originalName,
        natoName,
        isRgaio: !!isRgaio,
      });

      res.json(source);
    } catch (error) {
      console.error("Error creating source:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  public updateSource = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { originalName, natoName, isRgaio, enabled } = req.body;

      const source = await this.sourceService.updateSource(id, {
        originalName,
        natoName,
        isRgaio,
        enabled,
      });

      if (!source) {
        res.status(404).json({ error: "Source not found" });
        return;
      }

      res.json(source);
    } catch (error) {
      console.error("Error updating source:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  public deleteSource = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const source = await this.sourceService.deleteSource(id);

      if (!source) {
        res.status(404).json({ error: "Source not found" });
        return;
      }

      res.json({ message: "Source deleted successfully" });
    } catch (error) {
      console.error("Error deleting source:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  public updatePriorities = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { updates } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({ error: "Invalid updates format" });
        return;
      }

      const isValid = updates.every(
        (update) =>
          typeof update.id === "string" &&
          typeof update.natoName === "string" &&
          update.natoName.trim() !== ""
      );

      if (!isValid) {
        res.status(400).json({ error: "Invalid update data" });
        return;
      }

      await this.sourceService.updatePriorities(updates);
      const sources = await this.sourceService.getAllSources();
      res.json(sources);
    } catch (error) {
      console.error("Error updating priorities:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
