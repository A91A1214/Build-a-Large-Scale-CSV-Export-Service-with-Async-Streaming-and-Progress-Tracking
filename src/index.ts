import express from 'express';
import pool from './db';
import exportRouter from './routes/export.routes';

const app = express();
const port = process.env.API_PORT || 8080;

app.use(express.json());

// Healthcheck endpoint
app.get('/health', async (req, res) => {
    try {
        // Basic DB check
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        res.status(503).json({ status: 'error', message: 'Database unreachable' });
    }
});

// Routes
app.use('/exports', exportRouter);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled Error:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        pool.end(() => {
            console.log('Database pool closed');
            process.exit(0);
        });
    });
});
