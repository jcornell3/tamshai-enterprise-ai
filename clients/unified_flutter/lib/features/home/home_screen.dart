import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/providers/auth_provider.dart';
import '../../core/auth/services/biometric_service.dart';
import '../../core/widgets/dialogs.dart';

/// Home screen shown after successful authentication
/// 
/// Displays user information and logout button
/// This is a placeholder - replace with your actual app UI
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tamshai Enterprise AI'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => AppDialogs.showLogoutDialog(context, ref),
            tooltip: 'Logout',
          ),
        ],
      ),
      body: user == null
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Welcome message
                  Text(
                    'Welcome back!',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    user.fullName ?? user.username,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 32),

                  // User info card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'User Information',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const Divider(height: 24),
                          _buildInfoRow(
                            context,
                            'Username',
                            user.username,
                          ),
                          if (user.email != null)
                            _buildInfoRow(
                              context,
                              'Email',
                              user.email!,
                            ),
                          if (user.firstName != null)
                            _buildInfoRow(
                              context,
                              'First Name',
                              user.firstName!,
                            ),
                          if (user.lastName != null)
                            _buildInfoRow(
                              context,
                              'Last Name',
                              user.lastName!,
                            ),
                          _buildInfoRow(
                            context,
                            'User ID',
                            user.id,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Roles card
                  if (user.roles != null && user.roles!.isNotEmpty)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Roles',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const Divider(height: 24),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: user.roles!
                                  .map((role) => Chip(
                                        label: Text(role),
                                        backgroundColor:
                                            Theme.of(context).primaryColor.withOpacity(0.1),
                                      ))
                                  .toList(),
                            ),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),

                  // Biometric settings card
                  _BiometricSettingsCard(),
                  const SizedBox(height: 32),

                  // AI Assistant quick action
                  Card(
                    color: Theme.of(context).primaryColor,
                    child: InkWell(
                      onTap: () => context.go('/chat'),
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.2),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.smart_toy,
                                size: 32,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'AI Assistant',
                                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.bold,
                                        ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Ask questions about your enterprise data',
                                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                          color: Colors.white.withOpacity(0.9),
                                        ),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(
                              Icons.arrow_forward_ios,
                              color: Colors.white,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Status indicator
                  Center(
                    child: Column(
                      children: [
                        Icon(
                          Icons.check_circle_outline,
                          size: 48,
                          color: Colors.green[400],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Connected to MCP Gateway',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Colors.grey[600],
                              ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildInfoRow(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[700],
                  ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }

}

/// Biometric settings card widget
class _BiometricSettingsCard extends ConsumerStatefulWidget {
  @override
  ConsumerState<_BiometricSettingsCard> createState() =>
      _BiometricSettingsCardState();
}

class _BiometricSettingsCardState extends ConsumerState<_BiometricSettingsCard> {
  bool _isLoading = false;
  bool _isEnabled = false;
  bool _isAvailable = false;
  BiometricDisplayType _biometricType = BiometricDisplayType.generic;

  @override
  void initState() {
    super.initState();
    _loadBiometricStatus();
  }

  Future<void> _loadBiometricStatus() async {
    final biometricService = ref.read(biometricServiceProvider);
    final authNotifier = ref.read(authNotifierProvider.notifier);

    final isAvailable = await biometricService.isBiometricAvailable();
    final isEnabled = await authNotifier.isBiometricUnlockEnabled();
    final biometricType = await biometricService.getPrimaryBiometricType();

    if (mounted) {
      setState(() {
        _isAvailable = isAvailable;
        _isEnabled = isEnabled;
        _biometricType = biometricType;
      });
    }
  }

  Future<void> _toggleBiometric(bool value) async {
    if (_isLoading) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final authNotifier = ref.read(authNotifierProvider.notifier);

      if (value) {
        // Enable biometric unlock
        final biometricService = ref.read(biometricServiceProvider);
        final success = await biometricService.authenticate(
          reason: 'Authenticate to enable biometric unlock',
        );

        if (success) {
          await authNotifier.enableBiometricUnlock();
          setState(() {
            _isEnabled = true;
          });
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Biometric unlock enabled'),
                backgroundColor: Colors.green,
              ),
            );
          }
        }
      } else {
        // Disable biometric unlock
        await authNotifier.disableBiometricUnlock();
        setState(() {
          _isEnabled = false;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Biometric unlock disabled'),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  String _getBiometricName() {
    switch (_biometricType) {
      case BiometricDisplayType.faceId:
        return 'Face ID';
      case BiometricDisplayType.touchId:
        return 'Touch ID';
      case BiometricDisplayType.windowsHello:
      case BiometricDisplayType.windowsHelloFace:
      case BiometricDisplayType.windowsHelloFingerprint:
        return 'Windows Hello';
      case BiometricDisplayType.face:
        return 'Face Recognition';
      case BiometricDisplayType.fingerprint:
        return 'Fingerprint';
      default:
        return 'Biometric';
    }
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
        return Icons.lock;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isAvailable) {
      return const SizedBox.shrink();
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Security',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const Divider(height: 24),
            Row(
              children: [
                Icon(
                  _getBiometricIcon(),
                  size: 32,
                  color: Theme.of(context).primaryColor,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${_getBiometricName()} Unlock',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        _isEnabled
                            ? 'Quick access enabled'
                            : 'Enable for faster login',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey[600],
                            ),
                      ),
                    ],
                  ),
                ),
                if (_isLoading)
                  const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Switch(
                    value: _isEnabled,
                    onChanged: _toggleBiometric,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
