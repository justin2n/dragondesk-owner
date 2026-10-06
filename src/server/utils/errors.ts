import { Response } from 'express';

export const serverError = (res: Response, err: unknown): void => {
  console.error(err);
  const message =
    process.env.NODE_ENV !== 'production' && err instanceof Error
      ? err.message
      : 'Internal server error';
  res.status(500).json({ error: message });
};
