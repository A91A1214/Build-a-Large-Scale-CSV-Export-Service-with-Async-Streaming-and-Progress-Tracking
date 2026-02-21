import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { ExportFilters } from '../types';
import * as exportService from '../services/export.service';

export const initiateExport = async (req: Request, res: Response): Promise<void> => {
    try {
        const exportId = uuidv4();
        const filters: ExportFilters = {
            country_code: req.query.country_code as string,
            subscription_tier: req.query.subscription_tier as string,
            min_ltv: req.query.min_ltv ? parseFloat(req.query.min_ltv as string) : undefined,
            columns: req.query.columns as string,
            delimiter: req.query.delimiter as string || ',',
            quoteChar: req.query.quoteChar as string || '"',
        };

        // Insert pending job into DB
        await pool.query(
            `INSERT INTO exports (id, status, created_at) VALUES ($1, 'pending', NOW())`,
            [exportId]
        );

        // Start background job
        exportService.processExport(exportId, filters).catch((err) => {
            console.error(`Export job ${exportId} failed:`, err);
        });

        res.status(202).json({
            exportId,
            status: 'pending'
        });
    } catch (error: unknown) {
        console.error('Error initiating export:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getExportStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { exportId } = req.params;

        const result = await pool.query(
            `SELECT id, status, total_rows, processed_rows, error, created_at, completed_at FROM exports WHERE id = $1`,
            [exportId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Export not found' });
            return;
        }

        const row = result.rows[0];

        const percentage = row.total_rows > 0 ? Math.round((row.processed_rows / row.total_rows) * 100) : 0;

        res.status(200).json({
            exportId: row.id,
            status: row.status,
            progress: {
                totalRows: row.total_rows,
                processedRows: row.processed_rows,
                percentage
            },
            error: row.error,
            createdAt: row.created_at,
            completedAt: row.completed_at
        });
    } catch (error: unknown) {
        console.error('Error fetching export status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const downloadExport = async (req: Request, res: Response): Promise<void> => {
    // Logic to handle download with range requests and gzip compression
    // Defined later in export.service / handled here
    exportService.handleDownload(req, res);
};

export const cancelExport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { exportId } = req.params;
        await exportService.cancelExport(exportId);
        res.status(204).send();
    } catch (error: unknown) {
        console.error('Error canceling export:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
