/// Generative UI components for AI-driven dynamic interface rendering.
///
/// This library provides widgets and models for rendering rich, interactive
/// UI components based on AI responses. The ComponentRenderer widget maps
/// component type strings to Flutter widgets and handles the routing of
/// user actions back to the AI.
///
/// Example usage:
/// ```dart
/// import 'package:unified_flutter/features/generative/generative.dart';
///
/// ComponentRenderer(
///   component: ComponentResponse(
///     type: 'OrgChartComponent',
///     props: {'self': {'id': 'user-123', 'name': 'Marcus Johnson'}},
///   ),
///   onAction: (action) => print('Action: ${action.actionType}'),
///   voiceEnabled: true,
/// )
/// ```
library generative;

// Models
// component_response.dart is the source of truth for domain models (Employee, TimeOffRequest, etc.)
// Note: employee.dart is not exported - its Employee class duplicates the one in component_response.dart
// The EmployeeExtension (initials getter) has been moved to component_response.dart
export 'models/component_response.dart';

// Services
export 'services/display_service.dart';

// Widgets
export 'widgets/component_renderer.dart';
export 'widgets/org_chart_component.dart';
// approvals_queue.dart has widget-local TimeOffRequest, ExpenseReport, BudgetAmendment - hide to avoid ambiguity
export 'widgets/approvals_queue.dart' hide TimeOffRequest, ExpenseReport, BudgetAmendment;
export 'widgets/customer_detail_card.dart';
export 'widgets/budget_summary_card.dart';
export 'widgets/leads_data_table.dart';
