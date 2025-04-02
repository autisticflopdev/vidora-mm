import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { config } from "./config";
import routes from "./routes";
import adminRoutes from "./routes/admin.routes";
import { AuthService } from "./services/auth.service";

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3001",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
      "https://vidora.su",
      "https://stats.vidora.su",
      "https://6942069.vidora.su",
      "https://6969.vidora.su",
      "https://beta.hexa.watch",
      "https://hexa.watch",
      "https://sisisi.hexa.watch",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Authorization"],
    maxAge: 86400,
  })
);

app.use(express.json());

app.use("/", routes);
app.use("/admin", adminRoutes);

app.get('/health', (_, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

const startServer = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log("Connected to MongoDB");

    const authService = AuthService.getInstance();
    await authService.initialize();
    console.log("Auth service initialized");

    app.listen(config.port, () => {
      console.log(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
