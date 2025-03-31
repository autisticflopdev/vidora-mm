import { Source, ISource } from "../models/source.model";
import mongoose, { Document } from "mongoose";
import { StatsService } from "./stats.service";

export class SourceService {
  private static instance: SourceService;
  private sourceMap: Map<string, ISource> = new Map();
  private statsService: StatsService;

  private constructor() {
    this.statsService = StatsService.getInstance();
    this.initializeService();
  }

  private async initializeService() {
    try {
      const collection = mongoose.connection.collection("sources");
      const indexes = await collection.indexes();
      const priorityIndex = indexes.find((index) => index.key.priority);
      if (priorityIndex) {
        await collection.dropIndex("priority_1");
      }
      await this.updateSourceMap();
    } catch (error) {
      console.warn("Error during service initialization:", error);
    }
  }

  private async updateSourceMap() {
    try {
      const sources = await Source.find().lean();
      this.sourceMap.clear();
      sources.forEach((source) => {
        this.sourceMap.set(source.originalName, source);
      });
      console.log(
        "Source map updated:",
        Array.from(this.sourceMap.entries()).map(
          ([key, val]) => `${key} -> ${val.natoName}`
        )
      );
    } catch (error) {
      console.error("Error updating source map:", error);
    }
  }

  public static getInstance(): SourceService {
    if (!SourceService.instance) {
      SourceService.instance = new SourceService();
    }
    return SourceService.instance;
  }

  public async getAllSources(): Promise<ISource[]> {
    return Source.find().sort({ natoName: 1 });
  }

  public async getSource(id: string): Promise<ISource | null> {
    return Source.findById(id);
  }

  public async createSource(sourceData: Partial<ISource>): Promise<ISource> {
    const source = new Source(sourceData);
    await source.save();
    await this.updateSourceMap();
    await this.statsService.addNewSource(source);
    return source;
  }

  public async updateSource(
    id: string,
    sourceData: Partial<ISource>
  ): Promise<ISource | null> {
    const source = await Source.findByIdAndUpdate(id, sourceData, {
      new: true,
    });
    if (source) {
      await this.updateSourceMap();
      await this.statsService.refreshSourceMappings();
    }
    return source;
  }

  public async deleteSource(id: string): Promise<ISource | null> {
    try {
      const sourceToDelete = await Source.findById(id);
      if (!sourceToDelete) return null;

      await Source.findByIdAndDelete(id);

      const remainingSources = await Source.find().sort({ natoName: 1 });

      const NATO_ALPHABET = [
        "Alpha",
        "Bravo",
        "Charlie",
        "Delta",
        "Echo",
        "Foxtrot",
        "Golf",
        "Hotel",
        "India",
        "Juliet",
        "Kilo",
        "Lima",
        "Mike",
        "November",
        "Oscar",
        "Papa",
        "Quebec",
        "Romeo",
        "Sierra",
        "Tango",
        "Uniform",
        "Victor",
        "Whiskey",
        "X-Ray",
        "Yankee",
        "Zulu",
      ];

      for (const source of remainingSources) {
        await Source.findByIdAndUpdate(source._id, {
          natoName: `TEMP_${source.natoName}_${Date.now()}`,
        });
      }

      const updatePromises = remainingSources.map((source, index) =>
        Source.findByIdAndUpdate(source._id, {
          natoName: NATO_ALPHABET[index],
        })
      );
      await Promise.all(updatePromises);

      await this.statsService.removeSource(sourceToDelete.natoName);
      await this.statsService.refreshSourceMappings();

      await this.updateSourceMap();

      return sourceToDelete;
    } catch (error) {
      console.error("Error in deleteSource:", error);
      throw error;
    }
  }

  public async updatePriorities(
    updates: { id: string; natoName: string }[]
  ): Promise<ISource[]> {
    try {
      const sources = await Source.find({
        _id: { $in: updates.map((u) => new mongoose.Types.ObjectId(u.id)) },
      });

      const oldNatoNames = new Map(
        sources.map((s) => [s._id.toString(), s.natoName])
      );

      const tempPromises = sources.map((source, i) =>
        Source.findByIdAndUpdate(source._id, {
          natoName: `TEMP_${source.natoName}_${Date.now()}_${i}`,
        })
      );
      await Promise.all(tempPromises);

      const updatePromises = updates.map((update) =>
        Source.findByIdAndUpdate(update.id, {
          natoName: update.natoName,
        })
      );
      await Promise.all(updatePromises);

      await this.updateSourceMap();
      await this.statsService.updateSourceNames(
        updates.map((update) => ({
          oldName: oldNatoNames.get(update.id) || "",
          newName: update.natoName,
        }))
      );

      return this.getAllSources();
    } catch (error) {
      console.error("Error updating priorities:", error);
      throw error;
    }
  }

  public async transformSourceResponse(response: any): Promise<any> {
    if (!response) return response;

    await this.updateSourceMap();

    const sortedSources = Array.from(this.sourceMap.entries()).sort(
      ([, a], [, b]) => a.natoName.localeCompare(b.natoName)
    );

    console.log(
      "Current source mappings (sorted):",
      sortedSources.map(([key, val]) => `${key} -> ${val.natoName}`)
    );

    const baseResponse = {
      sources: {} as Record<string, any>,
      rgaio: {} as Record<string, any>,
    };

    for (const [originalName, source] of sortedSources) {
      if (source.isRgaio) {
        if (!baseResponse.sources.rgaio) {
          baseResponse.sources.rgaio = {};
        }
        baseResponse.sources.rgaio[source.natoName] = {};
      } else {
        baseResponse.sources[source.natoName] = {};
      }
    }

    const transformValue = (value: any): any => {
      if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          return value.map((item) => transformValue(item));
        }

        const transformed: Record<string, any> = { ...baseResponse.sources };

        const regularSources = sortedSources.filter(
          ([, source]) => !source.isRgaio
        );
        for (const [originalName, source] of regularSources) {
          if (value[originalName] && typeof value[originalName] === "object") {
            console.log(
              `Processing regular source: ${originalName} -> ${source.natoName}`
            );
            transformed[source.natoName] = value[originalName];
          }
        }

        if (value.rgaio && typeof value.rgaio === "object") {
          const rgaioSources: Record<string, any> = {};
          const rgaioMappedSources = sortedSources.filter(
            ([, source]) => source.isRgaio
          );

          for (const [originalName, source] of rgaioMappedSources) {
            const rgKey = originalName.replace("rgaio_", "");
            if (value.rgaio[rgKey] && typeof value.rgaio[rgKey] === "object") {
              console.log(
                `Processing rgaio source: ${originalName} -> ${source.natoName}`
              );
              rgaioSources[source.natoName] = value.rgaio[rgKey];
            }
          }

          if (Object.keys(rgaioSources).length > 0) {
            transformed.rgaio = rgaioSources;
          }
        }

        return transformed;
      }
      return value;
    };

    const transformedResponse = { ...response };
    if (transformedResponse.sources) {
      transformedResponse.sources = transformValue(transformedResponse.sources);
    }

    console.log("Original sources:", Object.keys(response.sources));
    console.log(
      "Transformed response:",
      JSON.stringify(transformedResponse, null, 2)
    );
    return transformedResponse;
  }

  private getNextAvailableNatoName(): string | null {
    const NATO_ALPHABET = [
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
      "Foxtrot",
      "Golf",
      "Hotel",
      "India",
      "Juliet",
      "Kilo",
      "Lima",
      "Mike",
      "November",
      "Oscar",
      "Papa",
      "Quebec",
      "Romeo",
      "Sierra",
      "Tango",
      "Uniform",
      "Victor",
      "Whiskey",
      "X-Ray",
      "Yankee",
      "Zulu",
    ];

    const usedNames = new Set(
      Array.from(this.sourceMap.values()).map((s) => s.natoName)
    );
    return NATO_ALPHABET.find((name) => !usedNames.has(name)) || null;
  }
}
