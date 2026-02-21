import * as exportService from './export.service';
import pool from '../db';
import * as fs from 'fs';

jest.mock('../db', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    createWriteStream: jest.fn(),
    unlinkSync: jest.fn(),
}));

describe('Export Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should initiate export and update status', async () => {
        const exportId = 'test-id';
        const filters = { delimiter: ',', quoteChar: '"' };

        (pool.query as jest.Mock).mockResolvedValueOnce({}); // Initial status update

        // This is a partial test since processExport is very complex with streaming
        // In a real scenario, we'd mock the cursor and stream
        // For now, we verify it at least tries to update the DB
        await exportService.processExport(exportId, filters);

        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE exports SET status'),
            expect.arrayContaining(['processing', exportId])
        );
    });

    it('should handle cancellation', async () => {
        const exportId = 'test-id';
        (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ status: 'processing' }] });

        await exportService.cancelExport(exportId);

        expect(pool.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE exports SET status'),
            expect.arrayContaining(['cancelled', exportId])
        );
    });
});
