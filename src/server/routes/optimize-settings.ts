import { Router, Response } from 'express';
import { serverError } from '../utils/errors';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  ALLOWED_CONFIDENCE_LEVELS,
  getOptimizeSettings,
  saveOptimizeSettings,
} from '../services/optimizeSettings';
import { DEFAULT_SIGNIFICANCE_OPTIONS } from '../utils/abStats';

const router = Router();

router.use(authenticateToken);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      settings: await getOptimizeSettings(),
      defaults: DEFAULT_SIGNIFICANCE_OPTIONS,
      allowedConfidenceLevels: ALLOWED_CONFIDENCE_LEVELS,
    });
  } catch (error: any) {
    serverError(res, error);
  }
});

// Changing the bar affects how running tests are judged from here on. Existing
// sigReachedAt stamps are deliberately left alone — they record when a test
// crossed the bar that was in force at the time.
router.put('/', async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  try {
    const { confidenceThreshold, minViewsPerArm, minTotalConversions } = req.body || {};
    if (
      confidenceThreshold !== undefined &&
      !(ALLOWED_CONFIDENCE_LEVELS as number[]).includes(Number(confidenceThreshold))
    ) {
      res.status(400).json({
        error: `confidenceThreshold must be one of ${ALLOWED_CONFIDENCE_LEVELS.join(', ')}`,
      });
      return;
    }
    res.json({ settings: await saveOptimizeSettings({ confidenceThreshold, minViewsPerArm, minTotalConversions }) });
  } catch (error: any) {
    serverError(res, error);
  }
});

export default router;
