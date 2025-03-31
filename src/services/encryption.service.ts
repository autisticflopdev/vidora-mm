import { Buffer } from "buffer";
import { subtle } from "crypto";
import crypto from "crypto";
import { config } from "../config";
import { RequestPayload, EncryptedResponse } from "../types";

export class EncryptionService {
  private static async deriveServerKey(
    baseKey: string,
    salt: string
  ): Promise<any> {
    const encoder = new TextEncoder();
    const baseKeyBuffer = encoder.encode(baseKey + salt + config.pepper);

    const intermediateKey = await subtle.importKey(
      "raw",
      baseKeyBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    return await subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt + config.pepper),
        iterations: config.iterations,
        hash: "SHA-512",
      },
      intermediateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  public static async generateToken(
    data: Partial<RequestPayload>
  ): Promise<string> {
    const entropyBase = `${data.mediaType}:${data.tmdbId}:${
      data.seasonId || ""
    }:${data.episodeId || ""}:${data.timestamp}:${config.encryptionKey}`;

    const entropyHash = Array.from(new TextEncoder().encode(entropyBase))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const tokenData = JSON.stringify({
      mediaType: data.mediaType,
      tmdbId: data.tmdbId,
      seasonId: data.seasonId || "",
      episodeId: data.episodeId || "",
      timestamp: data.timestamp,
      secret: config.encryptionKey,
      entropy: entropyHash,
    });

    const encoder = new TextEncoder();
    const msgBuffer = encoder.encode(tokenData + config.pepper);
    const firstHash = await subtle.digest("SHA-256", msgBuffer);
    const secondHash = await subtle.digest("SHA-512", firstHash);
    const hashArray = Array.from(new Uint8Array(secondHash));

    return hashArray
      .slice(0, 32)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  public static async verifyRequest(payload: RequestPayload): Promise<boolean> {
    try {
      const { timestamp, token, ...rest } = payload;
      const currentTime = Date.now();
      const timeDiff = currentTime - timestamp;

      if (timeDiff > 5 * 60 * 1000) {
        console.log("Request too old");
        return false;
      }

      const basePayload = {
        mediaType: rest.mediaType,
        tmdbId: rest.tmdbId,
        seasonId: rest.seasonId || "",
        episodeId: rest.episodeId || "",
        timestamp,
      };

      const expectedToken = await this.generateToken(basePayload);
      const tokensMatch = token === expectedToken;

      if (!tokensMatch) {
        console.log("Token mismatch:", {
          received: token,
          expected: expectedToken,
          payload: basePayload,
        });
      }

      return tokensMatch;
    } catch (error) {
      console.error("Error verifying request:", error);
      return false;
    }
  }

  public static async decryptRequest(
    encryptedData: string,
    iv: string,
    authTag: string
  ): Promise<any> {
    try {
      const derivedKey = await this.deriveServerKey(
        config.encryptionKey,
        config.salt
      );

      const ivBytes = Buffer.from(iv, "hex");
      const encryptedBytes = Buffer.from(encryptedData, "hex");
      const authTagBytes = Buffer.from(authTag, "hex");

      const aad = new TextEncoder().encode(config.pepper + iv);
      const combinedBytes = Buffer.concat([encryptedBytes, authTagBytes]);

      const decryptedBytes = await subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBytes,
          additionalData: aad,
          tagLength: 128,
        },
        derivedKey,
        combinedBytes
      );

      const decryptedText = new TextDecoder().decode(decryptedBytes);
      return JSON.parse(decryptedText);
    } catch (error) {
      console.error("Error decrypting request:", error);
      throw new Error("Failed to decrypt request");
    }
  }

  public static async encryptResponse(data: any): Promise<EncryptedResponse> {
    const iv = crypto.randomBytes(16);
    const derivedKey = await this.deriveServerKey(
      config.encryptionKey,
      config.salt
    );

    const enhancedData = {
      ...data,
      _nonce: crypto.randomBytes(32).toString("hex"),
      _timestamp: Date.now(),
      _entropy: crypto.randomBytes(16).toString("hex"),
    };

    const dataBytes = new TextEncoder().encode(JSON.stringify(enhancedData));
    const aad = new TextEncoder().encode(
      config.pepper + Buffer.from(iv).toString("hex")
    );

    const encryptedResult = await subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: aad,
        tagLength: 128,
      },
      derivedKey,
      dataBytes
    );

    const encryptedBytes = new Uint8Array(encryptedResult);
    const authTag = encryptedBytes.slice(-16);
    const ciphertext = encryptedBytes.slice(0, -16);

    return {
      encryptedData: Buffer.from(ciphertext).toString("hex"),
      iv: Buffer.from(iv).toString("hex"),
      authTag: Buffer.from(authTag).toString("hex"),
    };
  }
}
