import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";

declare global {
  namespace Express {
    interface Request {
      admin?: {
        role: string;
      };
    }
  }
}

export class AuthMiddleware {
  private static instance: AuthMiddleware;
  private authService: AuthService;

  private constructor() {
    this.authService = AuthService.getInstance();
  }

  public static getInstance(): AuthMiddleware {
    if (!AuthMiddleware.instance) {
      AuthMiddleware.instance = new AuthMiddleware();
    }
    return AuthMiddleware.instance;
  }

  public requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const token = authHeader.split(" ")[1];
      const decoded = await this.authService.verifyToken(token);

      req.admin = {
        role: decoded.role,
      };

      next();
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  public requireSuperAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.requireAuth(req, res, () => {
        if (req.admin?.role !== "superadmin") {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        next();
      });
    } catch (error) {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}
