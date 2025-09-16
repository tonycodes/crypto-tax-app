export type AuthErrorCode =
  | 'INVALID_EMAIL_FORMAT'
  | 'WEAK_PASSWORD'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'PLAN_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'INCORRECT_PASSWORD'
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  | 'TWO_FACTOR_NOT_ENABLED'
  | 'MISSING_TWO_FACTOR_TOKEN'
  | 'TWO_FACTOR_ALREADY_ENABLED';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'AuthError';
  }

  static invalidEmail(): AuthError {
    return new AuthError('INVALID_EMAIL_FORMAT', 'Invalid email format', 400);
  }

  static weakPassword(): AuthError {
    return new AuthError('WEAK_PASSWORD', 'Password must be at least 8 characters', 400);
  }

  static emailInUse(): AuthError {
    return new AuthError('EMAIL_ALREADY_REGISTERED', 'Email already registered', 409);
  }

  static planMissing(): AuthError {
    return new AuthError('PLAN_NOT_FOUND', 'Default plan configuration missing', 500);
  }

  static invalidCredentials(): AuthError {
    return new AuthError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  static userNotFound(): AuthError {
    return new AuthError('USER_NOT_FOUND', 'User not found', 404);
  }

  static incorrectPassword(): AuthError {
    return new AuthError('INCORRECT_PASSWORD', 'Incorrect password', 400);
  }

  static tokenExpired(): AuthError {
    return new AuthError('TOKEN_EXPIRED', 'Token expired', 401);
  }

  static invalidToken(): AuthError {
    return new AuthError('INVALID_TOKEN', 'Invalid token', 401);
  }

  static twoFactorNotEnabled(): AuthError {
    return new AuthError('TWO_FACTOR_NOT_ENABLED', 'Two-factor authentication is not enabled', 400);
  }

  static twoFactorAlreadyEnabled(): AuthError {
    return new AuthError(
      'TWO_FACTOR_ALREADY_ENABLED',
      'Two-factor authentication already enabled',
      400
    );
  }

  static missingTwoFactorToken(): AuthError {
    return new AuthError(
      'MISSING_TWO_FACTOR_TOKEN',
      'Two-factor authentication token is required',
      401
    );
  }
}
