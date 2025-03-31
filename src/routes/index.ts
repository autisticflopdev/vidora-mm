import { Router } from "express";
import { ApiController } from "../controllers/api.controller";
import { StatsController } from "../controllers/stats.controller";
import adminRoutes from "./admin.routes";

const router = Router();
const apiController = ApiController.getInstance();
const statsController = StatsController.getInstance();

router.post("/", apiController.handleRequest);
router.get("/health", apiController.handleHealthCheck);

router.get("/stats.json", statsController.handleStats);
router.post("/stats/server-selection", statsController.handleServerSelection);

router.use("/admin", adminRoutes);

export default router;
