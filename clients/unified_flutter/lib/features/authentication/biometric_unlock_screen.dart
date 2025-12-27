import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/services/biometric_service.dart';
import '../../core/auth/providers/auth_provider.dart';

/// Biometric unlock screen
///
/// Displayed when the app has a saved refresh token and biometric
/// authentication is enabled. Allows users to unlock with Face ID,
/// Touch ID, or Windows Hello instead of re-entering credentials.
class BiometricUnlockScreen extends ConsumerStatefulWidget {
  const BiometricUnlockScreen({super.key});

  @override
  ConsumerState<BiometricUnlockScreen> createState() =>
      _BiometricUnlockScreenState();
}

class _BiometricUnlockScreenState extends ConsumerState<BiometricUnlockScreen> {
  final BiometricService _biometricService = BiometricService();
  BiometricDisplayType _biometricType = BiometricDisplayType.generic;
  bool _isAuthenticating = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadBiometricType();
    // Auto-trigger biometric prompt on screen load
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _authenticate();
    });
  }

  Future<void> _loadBiometricType() async {
    final type = await _biometricService.getPrimaryBiometricType();
    if (mounted) {
      setState(() {
        _biometricType = type;
      });
    }
  }

  Future<void> _authenticate() async {
    if (_isAuthenticating) return;

    setState(() {
      _isAuthenticating = true;
      _errorMessage = null;
    });

    try {
      final success = await _biometricService.authenticate(
        reason: 'Authenticate to access Tamshai Enterprise AI',
      );

      if (success) {
        // Trigger biometric unlock in auth provider
        await ref.read(authNotifierProvider.notifier).unlockWithBiometric();
      } else {
        setState(() {
          _errorMessage = 'Authentication failed. Please try again.';
        });
      }
    } on BiometricAuthException catch (e) {
      setState(() {
        _errorMessage = e.message;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'An unexpected error occurred.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isAuthenticating = false;
        });
      }
    }
  }

  Future<void> _logout() async {
    await ref.read(authNotifierProvider.notifier).logout();
  }

  IconData _getBiometricIcon() {
    switch (_biometricType) {
      case BiometricDisplayType.faceId:
      case BiometricDisplayType.face:
      case BiometricDisplayType.windowsHelloFace:
        return Icons.face;
      case BiometricDisplayType.touchId:
      case BiometricDisplayType.fingerprint:
      case BiometricDisplayType.windowsHelloFingerprint:
        return Icons.fingerprint;
      case BiometricDisplayType.windowsHello:
        return Icons.security;
      default:
        return Icons.lock_open;
    }
  }

  String _getBiometricLabel() {
    switch (_biometricType) {
      case BiometricDisplayType.faceId:
        return 'Use Face ID';
      case BiometricDisplayType.touchId:
        return 'Use Touch ID';
      case BiometricDisplayType.windowsHello:
      case BiometricDisplayType.windowsHelloFace:
      case BiometricDisplayType.windowsHelloFingerprint:
        return 'Use Windows Hello';
      case BiometricDisplayType.face:
        return 'Use Face Recognition';
      case BiometricDisplayType.fingerprint:
        return 'Use Fingerprint';
      default:
        return 'Unlock';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // App icon/logo
                Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Icon(
                    Icons.smart_toy,
                    size: 50,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 32),

                // Welcome message
                Text(
                  'Welcome Back',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Tamshai Enterprise AI',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 48),

                // Biometric button
                SizedBox(
                  width: 200,
                  height: 200,
                  child: ElevatedButton(
                    onPressed: _isAuthenticating ? null : _authenticate,
                    style: ElevatedButton.styleFrom(
                      shape: const CircleBorder(),
                      padding: const EdgeInsets.all(24),
                      backgroundColor: theme.colorScheme.primaryContainer,
                      foregroundColor: theme.colorScheme.primary,
                    ),
                    child: _isAuthenticating
                        ? const CircularProgressIndicator()
                        : Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                _getBiometricIcon(),
                                size: 64,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _getBiometricLabel(),
                                textAlign: TextAlign.center,
                                style: theme.textTheme.labelLarge,
                              ),
                            ],
                          ),
                  ),
                ),
                const SizedBox(height: 24),

                // Error message
                if (_errorMessage != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.error_outline,
                          color: theme.colorScheme.error,
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            _errorMessage!,
                            style: TextStyle(
                              color: theme.colorScheme.onErrorContainer,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Retry button (shown after error)
                if (_errorMessage != null && !_isAuthenticating)
                  TextButton.icon(
                    onPressed: _authenticate,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Try Again'),
                  ),

                const Spacer(),

                // Logout option
                TextButton(
                  onPressed: _isAuthenticating ? null : _logout,
                  child: Text(
                    'Log out and sign in with a different account',
                    style: TextStyle(
                      color: theme.colorScheme.secondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
