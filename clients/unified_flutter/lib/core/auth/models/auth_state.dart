import 'package:freezed_annotation/freezed_annotation.dart';

part 'auth_state.freezed.dart';
part 'auth_state.g.dart';

/// Authentication state representing current auth status
@freezed
class AuthState with _$AuthState {
  const factory AuthState.unauthenticated() = Unauthenticated;
  const factory AuthState.authenticating() = Authenticating;
  const factory AuthState.authenticated(AuthUser user) = Authenticated;
  const factory AuthState.error(String message) = AuthError;
}

/// User model containing profile information from Keycloak
@freezed
class AuthUser with _$AuthUser {
  const factory AuthUser({
    required String id,
    required String username,
    String? email,
    String? firstName,
    String? lastName,
    String? fullName,
    List<String>? roles,
    Map<String, dynamic>? attributes,
  }) = _AuthUser;

  factory AuthUser.fromJson(Map<String, dynamic> json) =>
      _$AuthUserFromJson(json);
}

/// Token response model containing OAuth tokens
/// Named StoredTokens to avoid conflict with flutter_appauth's TokenResponse
@freezed
class StoredTokens with _$StoredTokens {
  const factory StoredTokens({
    required String accessToken,
    required String idToken,
    String? refreshToken,
    required DateTime accessTokenExpirationDateTime,
    Map<String, dynamic>? idTokenClaims,
  }) = _StoredTokens;

  factory StoredTokens.fromJson(Map<String, dynamic> json) =>
      _$StoredTokensFromJson(json);
}

/// Authentication exception types
class AuthException implements Exception {
  final String message;
  final String? code;
  final dynamic originalError;

  AuthException(this.message, {this.code, this.originalError});

  @override
  String toString() => 'AuthException: $message${code != null ? ' (code: $code)' : ''}';
}

class TokenRefreshException extends AuthException {
  TokenRefreshException(super.message, {super.code, super.originalError});
}

class LoginCancelledException extends AuthException {
  LoginCancelledException() : super('Login was cancelled by user', code: 'USER_CANCELLED');
}

class NetworkAuthException extends AuthException {
  NetworkAuthException(super.message, {super.originalError}) : super(code: 'NETWORK_ERROR');
}
