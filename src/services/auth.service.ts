import jwt from "jsonwebtoken";
import { config } from "../config";
import { Token } from "../models/token.model";
import crypto from "crypto";

export class AuthService {
  private static instance: AuthService;
  private accessToken: string | null = null;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private generateAccessToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  public async initialize(): Promise<void> {
    try {
      const existingToken = await Token.findOne().sort({ createdAt: -1 });

      if (existingToken) {
        this.accessToken = existingToken.token;
      } else {
        const newToken = this.generateAccessToken();
        await Token.create({ token: newToken });
        this.accessToken = newToken;
        console.log("\x1b[32m%s\x1b[0m", "Generated new access token");
        console.log("\x1b[33m%s\x1b[0m", "Access Token:", newToken);
        console.log(
          "\x1b[33m%s\x1b[0m",
          "⚠️  Save this token securely - it will only be shown once!"
        );
      }
    } catch (error) {
      console.error("Error initializing auth service:", error);
      throw error;
    }
  }

  public async validateAdmin(accessToken: string): Promise<boolean> {
    if (!this.accessToken) {
      await this.initialize();
    }
    return accessToken === this.accessToken;
  }

  public generateToken(): string {
    return jwt.sign(
      {
        role: "admin",
      },
      config.jwtSecret,
      {
        expiresIn: config.jwtExpiresIn,
      }
    );
  }

  public async verifyToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, config.jwtSecret);
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  public async getAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      await this.initialize();
    }
    return this.accessToken;
  }
}
