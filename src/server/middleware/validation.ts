import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';

const requestSchema = z.object({
  body: z.unknown().optional(),
  query: z.unknown().optional(),
  params: z.unknown().optional()
});

type RequestShape = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

export function validateRequest(shape: RequestShape) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsedRequest = requestSchema.parse({
      body: req.body,
      query: req.query,
      params: req.params
    });

    try {
      if (shape.body) {
        req.body = shape.body.parse(parsedRequest.body);
      }
      if (shape.query) {
        req.query = shape.query.parse(parsedRequest.query);
      }
      if (shape.params) {
        req.params = shape.params.parse(parsedRequest.params);
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new Error('Validation failed');
        (validationError as Error & { statusCode: number; code: string; details: unknown }).statusCode = 422;
        (validationError as Error & { statusCode: number; code: string; details: unknown }).code =
          'VALIDATION_ERROR';
        (validationError as Error & { recoverable: boolean }).recoverable = true;
        (validationError as Error & { statusCode: number; code: string; details: unknown }).details =
          error.issues;
        next(validationError);
        return;
      }
      next(error);
    }
  };
}
