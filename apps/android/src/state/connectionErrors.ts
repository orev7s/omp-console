import { ApiError } from '../api/client';

export interface ConnectionError {
  code: string;
  title: string;
  message: string;
  retryable: boolean;
}

const FALLBACK: ConnectionError = {
  code: 'unknown',
  title: 'Something went wrong',
  message: 'Try again. If it keeps happening, check the server logs.',
  retryable: true,
};

function looksLikeCertificate(message: string): boolean {
  return /ssl|tls|certificate|cert/i.test(message);
}

function looksLikeNetwork(message: string): boolean {
  return /network request failed|failed to fetch|network error|load failed/i.test(message);
}

/**
 * Turns any thrown value into one plain sentence plus the fix. The raw cause is
 * kept in `code` for the debug screen, never shown on a user surface.
 */
export function describeError(error: unknown): ConnectionError {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'unauthorized':
      case 'invalid_code':
      case 'expired_code':
        return {
          code: error.code,
          title: 'Code not accepted',
          message: 'That pairing code was not accepted. Check the code and try again.',
          retryable: true,
        };
      case 'rate_limited':
        return {
          code: error.code,
          title: 'Too many attempts',
          message: 'Wait a moment, then try the code again.',
          retryable: true,
        };
      case 'not_found':
        return {
          code: error.code,
          title: 'Server not found',
          message: 'The address answered, but not as an omp.console server. Check the address and port.',
          retryable: true,
        };
      default:
        if (error.status >= 500) {
          return {
            code: error.code,
            title: 'Server problem',
            message: 'Your server had a problem. Try again in a moment.',
            retryable: true,
          };
        }
        if (looksLikeCertificate(error.message)) {
          return {
            code: error.code,
            title: 'Secure connection failed',
            message:
              'Could not make a secure connection. Check the certificate setup, or use another connection type in Advanced.',
            retryable: true,
          };
        }
        return {
          code: error.code,
          title: 'Could not connect',
          message: 'The server refused the request. Check the address and try again.',
          retryable: error.retryable,
        };
    }
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return {
        code: 'timeout',
        title: 'Server took too long',
        message: 'Your server took too long to answer. Try again.',
        retryable: true,
      };
    }
    if (looksLikeCertificate(error.message)) {
      return {
        code: 'tls',
        title: 'Secure connection failed',
        message:
          'Could not make a secure connection. Check the certificate setup, or use another connection type in Advanced.',
        retryable: true,
      };
    }
    if (looksLikeNetwork(error.message)) {
      return {
        code: 'network',
        title: 'Could not reach the server',
        message: 'Check the address and that the server is running.',
        retryable: true,
      };
    }
  }

  return FALLBACK;
}