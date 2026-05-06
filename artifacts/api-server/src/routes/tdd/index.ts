import { Router, type IRouter } from "express";
import generateRouter from "./generate";
import exportRouter from "./export";
import cidrRouter from "./cidr";
import namingRouter from "./naming";
import sectionRegenerateRouter from "./section-regenerate";
import submissionsRouter from "./submissions";
import { authenticate } from "../../middleware/authenticate.js";

const router: IRouter = Router();

// All TDD routes require a valid session — protects expensive OpenAI calls.
router.use(authenticate);

router.use(generateRouter);
router.use(exportRouter);
router.use(cidrRouter);
router.use(namingRouter);
router.use(sectionRegenerateRouter);
router.use(submissionsRouter);

export default router;
