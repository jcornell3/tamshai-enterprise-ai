# Quick Start Guide - 5 Minutes to Running App

Get the Tamshai authentication working in 5 minutes.

## Prerequisites Check

✅ Flutter installed: `flutter doctor`  
✅ Visual Studio 2022 with C++ workload  
✅ Docker installed (for Keycloak)

## Step 1: Start Keycloak (1 minute)

```bash
docker run -d \
  --name keycloak \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest \
  start-dev
```

Wait 30 seconds for Keycloak to start, then open: http://localhost:8080

## Step 2: Configure Keycloak (2 minutes)

### Create Realm
1. Login with `admin` / `admin`
2. Click "Master" dropdown → "Create Realm"
3. Name: `tamshai`
4. Click "Create"

### Create Client
1. Go to Clients → "Create client"
2. **Client ID**: `tamshai-flutter-client`
3. Click "Next"
4. **Client authentication**: OFF
5. **Standard flow**: ON
6. **Direct access grants**: ON
7. Click "Next"
8. **Valid redirect URIs**: `http://localhost:*`
9. **Web origins**: `+`
10. Click "Save"
11. Go to "Advanced" tab
12. **Proof Key for Code Exchange**: `S256`
13. Click "Save"

### Add offline_access scope
1. Go to "Client scopes" tab
2. Click "Add client scope"
3. Select "offline_access"
4. Click "Add" → "Default"

### Create Test User
1. Go to Users → "Add user"
2. **Username**: `test`
3. Click "Create"
4. Go to "Credentials" tab
5. Click "Set password"
6. **Password**: `test`
7. **Temporary**: OFF
8. Click "Save"

## Step 3: Configure Flutter App (1 minute)

### Install dependencies
```bash
cd tamshai_auth_scaffold
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

### Update Keycloak config
Edit `lib/core/auth/models/keycloak_config.dart`:

```dart
static KeycloakConfig getDevelopmentConfig() {
  return const KeycloakConfig(
    issuer: 'http://localhost:8080/realms/tamshai',  // ← Update this
    clientId: 'tamshai-flutter-client',
    redirectUrl: 'http://localhost:0/callback',
    endSessionRedirectUrl: 'http://localhost:0/logout',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
  );
}
```

## Step 4: Run the App (1 minute)

```bash
flutter run -d windows
```

### Test Login
1. Click "Sign In with Keycloak"
2. Login with: `test` / `test`
3. Should see home screen with user info
4. Click logout to test logout

## That's It! 🎉

Your Keycloak authentication is working!

## Common Issues

### "Error: No devices found"
**Solution**: Run with explicit device
```bash
flutter devices  # List devices
flutter run -d windows
```

### "Browser doesn't open"
**Solution**: Check Windows Firewall, allow Flutter app

### "Invalid redirect URI"
**Solution**: Add `http://localhost:*` to Keycloak client redirect URIs

### "PKCE verification failed"
**Solution**: Set PKCE to `S256` in client Advanced settings

## Next Steps

1. ✅ **Add TOTP**: See KEYCLOAK_SETUP.md for TOTP configuration
2. ✅ **Configure API**: Update API base URL in `token_interceptor.dart`
3. ✅ **Production Setup**: See README.md for production checklist
4. ✅ **Build Features**: Start building your app features!

## File Structure Reference

```
lib/
├── core/auth/
│   ├── models/keycloak_config.dart    ← Configure Keycloak here
│   ├── providers/auth_provider.dart   ← Auth state management
│   └── services/keycloak_auth_service.dart
├── core/api/token_interceptor.dart    ← Configure API URL here
├── features/
│   ├── authentication/login_screen.dart
│   └── home/home_screen.dart          ← Replace with your app
└── main.dart
```

## Verification Commands

```bash
# Check Flutter
flutter doctor -v

# Check Keycloak is running
curl http://localhost:8080/realms/tamshai/.well-known/openid-configuration

# Check app dependencies
flutter pub outdated

# Rebuild generated files
flutter pub run build_runner build --delete-conflicting-outputs

# Run with verbose logging
flutter run -d windows -v
```

## Using the Auth in Your App

### Check if user is logged in
```dart
final isAuthenticated = ref.watch(isAuthenticatedProvider);
```

### Get current user
```dart
final user = ref.watch(currentUserProvider);
print('Hello ${user?.username}');
```

### Trigger login
```dart
ref.read(authNotifierProvider.notifier).login();
```

### Trigger logout
```dart
ref.read(authNotifierProvider.notifier).logout();
```

### Make authenticated API call
```dart
final dio = ref.read(dioProvider);
final response = await dio.get('/api/endpoint');
// Token automatically added and refreshed!
```

## Help

- **README.md**: Full documentation
- **KEYCLOAK_SETUP.md**: Detailed Keycloak configuration
- **Check logs**: `flutter logs`
- **Keycloak logs**: `docker logs keycloak`

Happy coding! 🚀
