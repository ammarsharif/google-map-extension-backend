import { Request, Response, NextFunction } from 'express';
import { ENV } from '../env';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Health endpoint is always public
  if (req.path === '/health') return next();

  const key = req.headers['x-api-key'];
  if (!key || key !== ENV.API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}
