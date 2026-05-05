import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tddRouter from "./tdd";
import authRouter from "./auth";
import requestsRouter from "./requests";
import usersRouter from "./users";
import settingsRouter from "./settings";
import iacRouter from "./iac";
import confluenceRouter from "./confluence";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/tdd", tddRouter);
router.use("/requests", requestsRouter);
router.use("/users", usersRouter);
router.use("/settings", settingsRouter);
router.use("/iac", iacRouter);
router.use("/confluence", confluenceRouter);

export default router;
