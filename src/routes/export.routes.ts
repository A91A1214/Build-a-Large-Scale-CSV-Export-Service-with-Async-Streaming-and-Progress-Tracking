import { Router } from 'express';
import * as exportController from '../controllers/export.controller';
import { validateRequest, exportSchema } from './validation';

const router = Router();

router.post('/csv', validateRequest(exportSchema), exportController.initiateExport);
router.get('/:exportId/status', exportController.getExportStatus);
router.get('/:exportId/download', exportController.downloadExport);
router.delete('/:exportId', exportController.cancelExport);

export default router;
