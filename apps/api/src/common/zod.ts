import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';
import { RejectError } from './errors';

function describe(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
}

/** Validate a REST request body. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(describe(r.error));
  return r.data;
}

/** Validate sync mutation data. */
export function parseMutationData<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new RejectError('invalid', describe(r.error));
  return r.data;
}
