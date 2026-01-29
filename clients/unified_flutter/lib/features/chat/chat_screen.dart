import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/chat/models/chat_state.dart';
import '../../core/chat/providers/chat_provider.dart';
import '../../core/widgets/dialogs.dart';
import 'widgets/message_bubble.dart';
import 'widgets/chat_input.dart';
import 'widgets/approval_card.dart';

/// Main chat screen for AI interactions
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _textController = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  @override
  void dispose() {
    _scrollController.dispose();
    _textController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    ref.read(chatNotifierProvider.notifier).sendMessage(text);
    _textController.clear();
    _focusNode.requestFocus();
    _scrollToBottom();
  }

  void _handleConfirmation(String messageId, String confirmationId, bool approved) {
    ref.read(chatNotifierProvider.notifier).confirmAction(
      messageId,
      confirmationId,
      approved: approved,
    );
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatNotifierProvider);
    final theme = Theme.of(context);

    // Auto-scroll when new messages arrive
    ref.listen<ChatState>(chatNotifierProvider, (previous, next) {
      if (previous?.messages.length != next.messages.length ||
          previous?.isStreaming != next.isStreaming) {
        _scrollToBottom();
      }
    });

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to Home',
          onPressed: () => context.go('/home'),
        ),
        title: const Text('AI Assistant'),
        actions: [
          if (chatState.isStreaming)
            IconButton(
              icon: const Icon(Icons.stop),
              tooltip: 'Stop generating',
              onPressed: () {
                ref.read(chatNotifierProvider.notifier).cancelStream();
              },
            ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Clear chat',
            onPressed: chatState.messages.isEmpty
                ? null
                : () async {
                    final confirmed = await AppDialogs.showConfirmationDialog(
                      context: context,
                      title: 'Clear Chat',
                      content: 'Are you sure you want to clear the chat history?',
                      confirmText: 'Clear',
                      isDangerous: true,
                    );
                    if (confirmed) {
                      ref.read(chatNotifierProvider.notifier).clearChat();
                    }
                  },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () => AppDialogs.showLogoutDialog(context, ref),
          ),
        ],
      ),
      body: Column(
        children: [
          // Error banner
          if (chatState.error != null)
            MaterialBanner(
              backgroundColor: theme.colorScheme.errorContainer,
              content: Text(
                chatState.error!,
                style: TextStyle(color: theme.colorScheme.onErrorContainer),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    // Clear error - would need to add this to the notifier
                  },
                  child: const Text('Dismiss'),
                ),
              ],
            ),

          // Message list
          Expanded(
            child: chatState.messages.isEmpty
                ? _buildEmptyState(theme)
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    itemCount: chatState.messages.length,
                    itemBuilder: (context, index) {
                      final message = chatState.messages[index];
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          MessageBubble(
                            message: message,
                            onCopy: () {
                              Clipboard.setData(
                                ClipboardData(text: message.content),
                              );
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Copied to clipboard'),
                                  duration: Duration(seconds: 2),
                                ),
                              );
                            },
                          ),
                          // Show approval card for pending confirmations
                          if (message.pendingConfirmation != null &&
                              !message.pendingConfirmation!.isExpired)
                            ApprovalCard(
                              confirmation: message.pendingConfirmation!,
                              onApprove: () => _handleConfirmation(
                                message.id,
                                message.pendingConfirmation!.confirmationId,
                                true,
                              ),
                              onReject: () => _handleConfirmation(
                                message.id,
                                message.pendingConfirmation!.confirmationId,
                                false,
                              ),
                            ),
                        ],
                      );
                    },
                  ),
          ),

          // Input area
          ChatInput(
            controller: _textController,
            focusNode: _focusNode,
            isLoading: chatState.isLoading,
            isStreaming: chatState.isStreaming,
            onSend: _sendMessage,
            onCancel: () {
              ref.read(chatNotifierProvider.notifier).cancelStream();
            },
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.chat_bubble_outline,
            size: 80,
            color: theme.colorScheme.primary.withOpacity(0.3),
          ),
          const SizedBox(height: 16),
          Text(
            'Start a conversation',
            style: theme.textTheme.headlineSmall?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.6),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Ask me anything about your enterprise data',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.5),
            ),
          ),
          const SizedBox(height: 32),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              _buildSuggestionChip('Show my team members', theme),
              _buildSuggestionChip('What\'s the budget status?', theme),
              _buildSuggestionChip('List open support tickets', theme),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSuggestionChip(String text, ThemeData theme) {
    return ActionChip(
      label: Text(text),
      onPressed: () {
        _textController.text = text;
        _sendMessage();
      },
    );
  }
}
