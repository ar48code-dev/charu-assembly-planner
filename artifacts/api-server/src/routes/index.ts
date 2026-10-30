import { Router, type IRouter } from "express";
import healthRouter from "./health";
import assemblyPlansRouter from "./assembly-plans";

const router: IRouter = Router();

router.use(healthRouter);
router.use(assemblyPlansRouter);

export default router;
