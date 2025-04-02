import { Router } from "express";
import { AdminController } from "../controllers/admin.controller";
import { SourceController } from "../controllers/source.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { body } from "express-validator";

const router = Router();
const adminController = AdminController.getInstance();
const sourceController = SourceController.getInstance();
const authMiddleware = AuthMiddleware.getInstance();

router.post(
  "/login",
  [
    body("accessToken")
      .trim()
      .notEmpty()
      .withMessage("Access token is required"),
  ],
  adminController.login
);

if (process.env.NODE_ENV === "development") {
  router.get("/access-token", adminController.getAccessToken);
}

router.get("/stats", authMiddleware.requireAuth, adminController.getStats);

router.get("/sources", authMiddleware.requireAuth, sourceController.getSources);
router.post(
  "/sources",
  authMiddleware.requireAuth,
  sourceController.createSource
);
router.put(
  "/sources/:id",
  authMiddleware.requireAuth,
  sourceController.updateSource
);
router.delete(
  "/sources/:id",
  authMiddleware.requireAuth,
  sourceController.deleteSource
);
router.post(
  "/sources/priorities",
  authMiddleware.requireAuth,
  sourceController.updatePriorities
);

export default router;
