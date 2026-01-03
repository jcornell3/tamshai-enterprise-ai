# Tamshai Enterprise AI - Keycloak Authentication Scaffold

Production-ready Flutter authentication implementation using Keycloak with TOTP support.

## Features

✅ **Keycloak OAuth 2.0 / OIDC Integration**
- Authorization Code Flow with PKCE
- Automatic TOTP handling (via Keycloak UI)
- Secure token storage (Windows Credential Manager)
- Automatic token refresh
- Session management

✅ **State Management**
- Riverpod for reactive state
- Type-safe authentication states
- Automatic UI updates

✅ **API Integration**
- Dio HTTP client with automatic token injection
- 401 detection and token refresh
- Request retry after refresh

✅ **Security**
- PKCE prevents authorization code interception
- Secure storage for tokens
- No tokens in logs
- Proper logout (local + server session)

## Prerequisites

1. **Flutter SDK** (3.0.0 or higher)
   ```bash
   flutter --version
   ```

2. **Visual Studio 2022** (for Windows desktop)
   - Install "Desktop development with C++"

3. **Keycloak Server** with:
   - Realm configured
   - Public client created with PKCE enabled
   - TOTP authentication enabled (optional)
   - Redirect URIs configured

## Keycloak Setup

### 1. Create Realm
1. Login to Keycloak Admin Console
2. Create new realm (e.g., "tamshai")

### 2. Create Client
1. Go to Clients → Create Client
2. Configure:
   - **Client ID**: `tamshai-flutter-client`
   - **Client type**: OpenID Connect
   - **Client authentication**: OFF (Public client)
   - **Authorization**: OFF
   - **Authentication flow**: 
     - ✅ Standard flow
     - ✅ Direct access grants
   - **Valid redirect URIs**: 
     - `http://localhost:*`
     - `http://localhost:*/callback`
   - **Web origins**: `+` (allow all redirect URIs)

3. Advanced Settings:
   - **Proof Key for Code Exchange (PKCE)**: S256 Required

### 3. Enable TOTP (Optional)
1. Go to Realm Settings → Authentication
2. Click on "Browser" flow
3. Add "OTP Form" execution
4. Set to REQUIRED

### 4. Create Test User
1. Go to Users → Add user
2. Set username, email, etc.
3. Go to Credentials tab
4. Set password (disable temporary)
5. If TOTP enabled:
   - Login as user
   - Configure TOTP authenticator app

## Installation

### 1. Clone/Copy the scaffold

```bash
# If starting new project
flutter create tamshai_app
cd tamshai_app

# Copy scaffold files into your project
# Replace lib/ folder with scaffold lib/ folder
```

### 2. Install dependencies

```bash
flutter pub get
```

### 3. Generate code (for Freezed models)

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

### 4. Configure Keycloak settings

Edit `lib/core/auth/models/keycloak_config.dart`:

```dart
static KeycloakConfig getDevelopmentConfig() {
  return const KeycloakConfig(
    issuer: 'https://YOUR-KEYCLOAK-SERVER/realms/YOUR-REALM',
    clientId: 'YOUR-CLIENT-ID',
    redirectUrl: 'http://localhost:0/callback',
    endSessionRedirectUrl: 'http://localhost:0/logout',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
  );
}
```

Replace:
- `YOUR-KEYCLOAK-SERVER`: Your Keycloak server URL
- `YOUR-REALM`: Your realm name
- `YOUR-CLIENT-ID`: Your client ID

### 5. Configure API base URL

Edit `lib/core/api/token_interceptor.dart`:

```dart
final dio = Dio(
  BaseOptions(
    baseUrl: 'https://YOUR-API-URL',  // <-- Change this
    ...
  ),
);
```

## Running the App

### Windows Desktop

```bash
flutter run -d windows
```

### Android (future)

```bash
flutter run -d android
```

### iOS (future - requires macOS)

```bash
flutter run -d ios
```

## Project Structure

```
lib/
├── core/
│   ├── auth/
│   │   ├── models/
│   │   │   ├── auth_state.dart          # Auth state models
│   │   │   └── keycloak_config.dart     # Keycloak config
│   │   ├── providers/
│   │   │   └── auth_provider.dart       # Riverpod auth provider
│   │   └── services/
│   │       └── keycloak_auth_service.dart  # Auth service
│   ├── api/
│   │   └── token_interceptor.dart       # Dio token interceptor
│   └── storage/
│       └── secure_storage_service.dart  # Secure storage
├── features/
│   ├── authentication/
│   │   └── login_screen.dart            # Login UI
│   └── home/
│       └── home_screen.dart             # Home screen
└── main.dart                             # App entry point
```

## Authentication Flow

```
1. App starts → Check for valid session
   ├─ Yes → Navigate to Home
   └─ No → Navigate to Login

2. User clicks "Sign In" → Opens Keycloak in browser
   
3. Keycloak prompts for:
   ├─ Username/Password
   └─ TOTP code (if enabled)

4. After successful authentication:
   ├─ Keycloak redirects to app with auth code
   ├─ App exchanges code for tokens (PKCE)
   ├─ Tokens stored securely
   └─ Navigate to Home

5. During app usage:
   ├─ Token added to all API requests
   ├─ On 401 response → Refresh token
   └─ On token expiry → Refresh token

6. Logout:
   ├─ End Keycloak session
   └─ Clear local tokens
```

## Testing

### Test Login Flow

1. Run the app
2. Click "Sign In with Keycloak"
3. Enter credentials in Keycloak
4. Enter TOTP code (if enabled)
5. Should redirect back to app
6. Should see Home screen with user info

### Test Token Refresh

1. Login successfully
2. Wait for token to expire (or manually set short expiry)
3. Make an API call
4. Should automatically refresh and retry

### Test Logout

1. Login successfully
2. Click logout button
3. Should return to login screen
4. Tokens should be cleared from secure storage

## Common Issues

### Issue: "No registered redirect URI"
**Solution**: Add `http://localhost:*` to Valid Redirect URIs in Keycloak client

### Issue: "PKCE verification failed"
**Solution**: Ensure PKCE is enabled in Keycloak client settings

### Issue: "Browser doesn't open on login"
**Solution**: 
- Check Windows firewall settings
- Ensure no antivirus blocking

### Issue: "Token refresh fails"
**Solution**: 
- Verify `offline_access` scope is included
- Check refresh token is being stored
- Verify client has "Standard flow enabled"

## Security Notes

### Production Checklist

- [ ] Change Keycloak URLs to production
- [ ] Configure production redirect URIs
- [ ] Enable certificate pinning in Dio
- [ ] Remove debug logging
- [ ] Configure proper CORS on API
- [ ] Enable HTTPS only
- [ ] Review token expiry times
- [ ] Implement rate limiting
- [ ] Add security headers
- [ ] Enable Keycloak security features (brute force detection, etc.)

### Token Storage

Tokens are stored using `flutter_secure_storage`:
- **Windows**: Windows Credential Manager
- **iOS**: Keychain
- **Android**: KeyStore

Never:
- Store tokens in SharedPreferences
- Log tokens to console
- Store tokens in plain text files

## Next Steps

1. **Add error handling UI**: Better error messages and retry mechanisms
2. **Implement loading states**: Skeleton screens during token refresh
3. **Add biometric authentication**: Use local_auth for biometric login
4. **Implement offline support**: Queue requests when offline
5. **Add analytics**: Track auth events (with privacy)
6. **Add unit tests**: Test auth flows and token refresh
7. **Add integration tests**: Test full auth flow

## API Integration Example

```dart
// Example: Making authenticated API call

final dio = ref.read(dioProvider);

try {
  final response = await dio.get('/api/user/profile');
  // Token automatically added by interceptor
  // Automatically refreshes on 401
  print(response.data);
} catch (e) {
  // Handle error
}
```

## Resources

- [Flutter AppAuth](https://pub.dev/packages/flutter_appauth)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [OAuth 2.0 PKCE](https://oauth.net/2/pkce/)
- [Riverpod Documentation](https://riverpod.dev/)

## Support

For issues or questions:
1. Check Keycloak server logs
2. Check Flutter logs: `flutter logs`
3. Review auth state in debug mode
4. Check secure storage contents

## License

[Add your license here]
