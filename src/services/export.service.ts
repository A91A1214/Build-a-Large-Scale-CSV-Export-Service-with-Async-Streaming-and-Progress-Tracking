import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import * as zlib from 'zlib';
import pool from '../db';
import { ExportFilters } from '../types';
import Cursor from 'pg-cursor';

const EXPORT_DIR = process.env.EXPORT_STORAGE_PATH || '/app/exports';

// Ensure export directory exists
if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// In-memory set for job cancellation signaling
const cancellationSignals = new Set<string>();

export async function processExport(exportId: string, filters: ExportFilters) {
    const filePath = path.join(EXPORT_DIR, `export_${exportId}.csv`);
    let client;

    try {
        // 1. Mark as processing
        await pool.query('UPDATE exports SET status = $1 WHERE id = $2', ['processing', exportId]);

        client = await pool.connect();

        // 2. Build Query Dynamically
        const selectedColumns = filters.columns ? filters.columns.split(',') : ['id', 'name', 'email', 'signup_date', 'country_code', 'subscription_tier', 'lifetime_value'];

        let whereClause = '';
        const params: any[] = [];
        let paramIndex = 1;

        if (filters.country_code) {
            whereClause += ` AND country_code = $${paramIndex++}`;
            params.push(filters.country_code);
        }
        if (filters.subscription_tier) {
            whereClause += ` AND subscription_tier = $${paramIndex++}`;
            params.push(filters.subscription_tier);
        }
        if (filters.min_ltv !== undefined) {
            whereClause += ` AND lifetime_value >= $${paramIndex++}`;
            params.push(filters.min_ltv);
        }

        const sql = `SELECT ${selectedColumns.join(', ')} FROM users WHERE 1=1 ${whereClause}`;

        // 3. Get Total Count for progress
        const countSql = `SELECT count(*) FROM users WHERE 1=1 ${whereClause}`;
        const countResult = await client.query(countSql, params);
        const totalRows = parseInt(countResult.rows[0].count, 10);

        await pool.query('UPDATE exports SET total_rows = $1 WHERE id = $2', [totalRows, exportId]);

        // 4. Streaming setup
        const cursor = client.query(new Cursor(sql, params));
        const writeStream = fs.createWriteStream(filePath);

        const delimiter = filters.delimiter || ',';
        const quoteChar = filters.quoteChar || '"';

        // Write header
        writeStream.write(selectedColumns.map(c => `${quoteChar}${c}${quoteChar}`).join(delimiter) + '\n');

        let processedRows = 0;
        let keepReading = true;

        while (keepReading) {
            if (cancellationSignals.has(exportId)) {
                throw new Error('CancelledByUser');
            }

            // Read 1000 rows at a time
            const rows = await new Promise<any[]>((resolve, reject) => {
                cursor.read(1000, (err: Error | undefined, rows: any[]) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            if (!rows || rows.length === 0) {
                keepReading = false;
                break;
            }

            // Format to CSV
            let chunk = '';
            for (const row of rows) {
                chunk += selectedColumns.map(c => {
                    const val = row[c] !== null && row[c] !== undefined ? String(row[c]) : '';
                    return `${quoteChar}${val}${quoteChar}`;
                }).join(delimiter) + '\n';
            }

            // Handle Backpressure
            const canWrite = writeStream.write(chunk);
            if (!canWrite) {
                await new Promise<void>(resolve => writeStream.once('drain', resolve));
            }

            processedRows += rows.length;

            // Update progress periodically
            if (processedRows % 10000 === 0 || processedRows === totalRows) {
                await pool.query('UPDATE exports SET processed_rows = $1 WHERE id = $2', [processedRows, exportId]);
            }
        }

        // Close stream and cursor
        writeStream.end();
        await new Promise<void>((resolve, reject) => {
            cursor.close((err: Error | undefined) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // 5. Mark as completed
        await pool.query(
            'UPDATE exports SET status = $1, processed_rows = $2, completed_at = NOW(), file_path = $3 WHERE id = $4',
            ['completed', processedRows, filePath, exportId]
        );

    } catch (error: any) {
        let finalStatus = 'failed';
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage === 'CancelledByUser') {
            finalStatus = 'cancelled';
        }

        try {
            await pool.query('UPDATE exports SET status = $1, error = $2 WHERE id = $3',
                [finalStatus, errorMessage, exportId]);
        } catch (e) { }

        // Cleanup partial file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        console.error(`Job ${exportId} failed:`, error);
    } finally {
        if (client) {
            client.release();
        }
        cancellationSignals.delete(exportId);
    }
}

export async function cancelExport(exportId: string) {
    const result = await pool.query('SELECT status, file_path FROM exports WHERE id = $1', [exportId]);

    if (result.rows.length === 0) {
        throw new Error('Export not found');
    }

    const row = result.rows[0];

    if (row.status === 'processing' || row.status === 'pending') {
        cancellationSignals.add(exportId);
        await pool.query('UPDATE exports SET status = $1 WHERE id = $2', ['cancelled', exportId]);
    } else if (row.status === 'completed') {
        if (row.file_path && fs.existsSync(row.file_path)) {
            fs.unlinkSync(row.file_path);
        }
        await pool.query('UPDATE exports SET status = $1 WHERE id = $2', ['cancelled', exportId]);
    }
}

export async function handleDownload(req: Request, res: Response) {
    try {
        const { exportId } = req.params;
        const result = await pool.query('SELECT status, file_path FROM exports WHERE id = $1', [exportId]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Export not found' });
            return;
        }

        const row = result.rows[0];

        if (row.status !== 'completed') {
            res.status(425).json({ error: 'Export not yet complete' });
            return;
        }

        const filePath = row.file_path;
        if (!filePath || !fs.existsSync(filePath)) {
            res.status(404).json({ error: 'Export file not found' });
            return;
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;
        const acceptEncoding = req.headers['accept-encoding'] as string || '';

        if (range && !acceptEncoding.includes('gzip')) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize || start < 0 || end >= fileSize || start > end) {
                res.status(416).set('Content-Range', `bytes */${fileSize}`).send();
                return;
            }

            const chunksize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="export_${exportId}.csv"`,
                'Accept-Ranges': 'bytes',
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Content-Length': chunksize,
            });

            fs.createReadStream(filePath, { start, end }).pipe(res);

        } else if (acceptEncoding.includes('gzip')) {
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="export_${exportId}.csv"`,
                'Content-Encoding': 'gzip',
                'Transfer-Encoding': 'chunked'
            });

            const readStream = fs.createReadStream(filePath);
            const gzip = zlib.createGzip();
            pipeline(readStream, gzip, res).catch((err: Error) => {
                console.error('Error streaming gzip:', err);
                if (!res.headersSent) res.status(500).end();
            });
        } else {
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="export_${exportId}.csv"`,
                'Accept-Ranges': 'bytes',
                'Content-Length': fileSize
            });

            fs.createReadStream(filePath).pipe(res);
        }

    } catch (error) {
        console.error('Error handling download:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
}
