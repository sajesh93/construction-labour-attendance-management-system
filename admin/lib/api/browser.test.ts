import { describe, expect, it } from 'vitest';
import { apiErrorMessage, BrowserApiError } from './browser';

const err = (body: BrowserApiError['body'], status = 400) => new BrowserApiError(status, body);

describe('apiErrorMessage', () => {
  it('shows the per-field validation errors a ValidationPipe 400 carries', () => {
    // This is the "New user" failure: the API said why, the UI showed the class name.
    const e = err({
      title: 'BadRequestException',
      code: 'VALIDATION_ERROR',
      meta: { errors: ['password must be longer than or equal to 8 characters'] },
    });
    expect(apiErrorMessage(e, 'Failed to save user')).toBe(
      'password must be longer than or equal to 8 characters',
    );
  });

  it('joins several field errors', () => {
    const e = err({
      title: 'BadRequestException',
      meta: { errors: ['email must be an email', 'password is too short'] },
    });
    expect(apiErrorMessage(e, 'x')).toBe('email must be an email; password is too short');
  });

  it('prefers the business-rule message over everything else', () => {
    const e = err({
      title: 'Business rule violation',
      detail: 'detail text',
      meta: { message: 'Watchman accounts need a user ID (username).' },
    });
    expect(apiErrorMessage(e, 'x')).toBe('Watchman accounts need a user ID (username).');
  });

  it('falls back to detail when there are no field errors', () => {
    expect(apiErrorMessage(err({ title: 'Access denied', detail: 'Not your site' }), 'x')).toBe(
      'Not your site',
    );
  });

  it('uses a human title when the server sent one', () => {
    expect(apiErrorMessage(err({ title: 'Worker not found' }), 'x')).toBe('Worker not found');
  });

  it('never shows a bare exception class name', () => {
    expect(apiErrorMessage(err({ title: 'BadRequestException' }), 'Failed to save user')).toBe(
      'Failed to save user',
    );
    expect(apiErrorMessage(err({ title: 'InternalServerErrorException' }, 500), 'Oops')).toBe('Oops');
  });

  it('falls back for non-API errors', () => {
    expect(apiErrorMessage(new Error('network down'), 'Failed')).toBe('Failed');
  });
});
