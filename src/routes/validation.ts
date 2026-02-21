import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const exportSchema = z.object({
    query: z.object({
        country_code: z.string().length(2).optional(),
        subscription_tier: z.enum(['free', 'basic', 'premium', 'pro']).optional(),
        min_ltv: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).optional(),
        columns: z.string().optional(),
        delimiter: z.string().length(1).optional(),
        quoteChar: z.string().length(1).optional(),
    }),
});

export const validateRequest = (schema: z.AnyZodObject) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const validated = await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            req.body = validated.body;
            req.query = validated.query;
            req.params = validated.params;
            return next();
        } catch (error: unknown) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.errors.map((e: z.ZodIssue) => ({ path: e.path, message: e.message }))
                });
            }
            return res.status(500).json({ error: 'Internal server error' });
        }
    };
};
