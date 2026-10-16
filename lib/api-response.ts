import { NextResponse } from 'next/server';
import { apiError } from './api-error';

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** Same contract as apiError: the real error is logged with a correlation id, the caller gets a safe message + `ref`. */
export function serverError(err: unknown, scope = 'api') {
  return apiError(scope, err);
}
