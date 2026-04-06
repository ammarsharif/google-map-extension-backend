import { Request, Response, NextFunction } from 'express';
import { ENV } from '../env';

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);

  const status = err.status || err.statusCode || 500;
  const response: any = {
    success: false,
    error: err.message || 'Internal server error',
    code: status,
  };

  if (ENV.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(status).json(response);
}
