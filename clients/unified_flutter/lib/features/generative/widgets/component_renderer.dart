import 'package:flutter/material.dart';
import '../../../core/theme/color_extensions.dart';
import '../models/component_response.dart';
import '../models/employee.dart' as emp;
import 'org_chart_component.dart';
import 'customer_detail_card.dart';
import 'leads_data_table.dart' as ldt;
import 'forecast_chart.dart' as fc;
import 'budget_summary_card.dart' as bsc;
import 'approvals_queue.dart' as aq;
import 'quarterly_report_dashboard.dart' as qrd;

/// Widget that renders the appropriate component based on ComponentResponse type.
///
/// This widget maps component type strings to widget constructors and falls back
/// to [UnknownComponentFallback] for unrecognized types. It supports voice-enabled
/// components and passes action callbacks to child widgets.
///
/// Example usage:
/// ```dart
/// ComponentRenderer(
///   component: ComponentResponse(
///     type: 'OrgChartComponent',
///     props: {'self': {'id': 'user-123', 'name': 'Marcus Johnson'}},
///   ),
///   onAction: (action) => handleAction(action),
///   voiceEnabled: true,
/// )
/// ```
class ComponentRenderer extends StatelessWidget {
  /// The component response from MCP UI Service
  final ComponentResponse component;

  /// Callback when user performs an action on the component
  final void Function(ActionEvent) onAction;

  /// Whether voice/TTS is enabled for narration
  final bool voiceEnabled;

  const ComponentRenderer({
    super.key,
    required this.component,
    required this.onAction,
    this.voiceEnabled = false,
  });

  /// Map of component type strings to widget builders
  static final Map<String, Widget Function(ComponentRendererContext)>
      _componentMap = {
    'OrgChartComponent': _buildOrgChartComponent,
    'CustomerDetailCard': _buildCustomerDetailCard,
    'LeadsDataTable': _buildLeadsDataTable,
    'ForecastChart': _buildForecastChart,
    'BudgetSummaryCard': _buildBudgetSummaryCard,
    'ApprovalsQueue': _buildApprovalsQueue,
    'QuarterlyReportDashboard': _buildQuarterlyReportDashboard,
  };

  // =========================================================================
  // COMPONENT BUILDERS - Parse props and create typed components
  // =========================================================================

  static Widget _buildOrgChartComponent(ComponentRendererContext ctx) {
    try {
      final props = ctx.props;

      // Parse self (required)
      final selfMap = props['self'] as Map<String, dynamic>?;
      if (selfMap == null) {
        return _buildError('OrgChartComponent requires "self" prop');
      }
      final self = _parseEmployee(selfMap);

      // Parse manager (optional)
      final managerMap = props['manager'] as Map<String, dynamic>?;
      final manager = managerMap != null ? _parseEmployee(managerMap) : null;

      // Parse peers (optional)
      final peersList = props['peers'] as List<dynamic>? ?? [];
      final peers = peersList
          .map((p) => _parseEmployee(p as Map<String, dynamic>))
          .toList();

      // Parse direct reports (optional)
      final reportsList = props['directReports'] as List<dynamic>? ?? [];
      final directReports = reportsList
          .map((p) => _parseEmployee(p as Map<String, dynamic>))
          .toList();

      return OrgChartComponent(
        self: self,
        manager: manager,
        peers: peers,
        directReports: directReports,
        onEmployeeClick: (employee) {
          ctx.onAction(ActionEvent(
            actionId: 'view-employee-${employee.id}',
            actionType: 'navigate',
            targetId: employee.id,
            payload: {'employeeId': employee.id},
          ));
        },
      );
    } catch (e) {
      return _buildError('OrgChartComponent: ${e.toString()}');
    }
  }

  static Widget _buildCustomerDetailCard(ComponentRendererContext ctx) {
    try {
      final props = ctx.props;

      // Parse customer (required)
      final customerMap = props['customer'] as Map<String, dynamic>?;
      if (customerMap == null) {
        return _buildError('CustomerDetailCard requires "customer" prop');
      }
      final customer = _parseCustomer(customerMap);

      // Parse contacts (optional)
      final contactsList = props['contacts'] as List<dynamic>? ?? [];
      final contacts = contactsList
          .map((c) => _parseContact(c as Map<String, dynamic>))
          .toList();

      // Parse opportunities (optional)
      final oppsList = props['opportunities'] as List<dynamic>? ?? [];
      final opportunities = oppsList
          .map((o) => _parseOpportunity(o as Map<String, dynamic>))
          .toList();

      return CustomerDetailCard(
        customer: customer,
        contacts: contacts,
        opportunities: opportunities,
        onContactClick: (contact) {
          ctx.onAction(ActionEvent(
            actionId: 'view-contact-${contact.id}',
            actionType: 'navigate',
            targetId: contact.id,
            payload: {'contactId': contact.id},
          ));
        },
        onOpportunityClick: (opp) {
          ctx.onAction(ActionEvent(
            actionId: 'view-opportunity-${opp.id}',
            actionType: 'navigate',
            targetId: opp.id,
            payload: {'opportunityId': opp.id},
          ));
        },
        onAction: (action) {
          ctx.onAction(ActionEvent(
            actionId: 'customer-action-$action',
            actionType: action,
            targetId: customer.id,
            payload: {'customerId': customer.id, 'action': action},
          ));
        },
      );
    } catch (e) {
      return _buildError('CustomerDetailCard: ${e.toString()}');
    }
  }

  static Widget _buildLeadsDataTable(ComponentRendererContext ctx) {
    try {
      final props = ctx.props;

      // Parse leads (required)
      final leadsList = props['leads'] as List<dynamic>? ?? [];
      final leads = leadsList
          .map((l) => _parseLead(l as Map<String, dynamic>))
          .toList();

      // Parse filters (optional)
      final filtersMap = props['filters'] as Map<String, dynamic>?;
      final filters = filtersMap != null
          ? LeadFilters.fromJson(filtersMap)
          : const LeadFilters();

      // Parse available sources (optional)
      final sourcesList = props['availableSources'] as List<dynamic>? ?? [];
      final availableSources =
          sourcesList.map((s) => s.toString()).toList();

      return ldt.LeadsDataTable(
        leads: leads,
        filters: filters,
        availableSources: availableSources,
        onLeadClick: (leadId) {
          ctx.onAction(ActionEvent(
            actionId: 'view-lead-$leadId',
            actionType: 'navigate',
            targetId: leadId,
            payload: {'leadId': leadId},
          ));
        },
        onFilterChange: (newFilters) {
          ctx.onAction(ActionEvent(
            actionId: 'filter-leads',
            actionType: 'filter',
            payload: newFilters.toJson(),
          ));
        },
        onBulkAction: (action, leadIds) {
          ctx.onAction(ActionEvent(
            actionId: 'bulk-${action.name}',
            actionType: action.name,
            payload: {'leadIds': leadIds, 'action': action.name},
          ));
        },
        onSort: (field, ascending) {
          ctx.onAction(ActionEvent(
            actionId: 'sort-leads',
            actionType: 'sort',
            payload: {'field': field.name, 'ascending': ascending},
          ));
        },
      );
    } catch (e) {
      return _buildError('LeadsDataTable: ${e.toString()}');
    }
  }

  static Widget _buildForecastChart(ComponentRendererContext ctx) {
    try {
      final props = ctx.props;

      // Parse forecast data
      final periods = props['periods'] as List<dynamic>? ?? [];
      final target = (props['target'] as num?)?.toDouble() ?? 0;
      final achieved = (props['achieved'] as num?)?.toDouble() ?? 0;
      final projected = (props['projected'] as num?)?.toDouble() ?? 0;

      final parsedPeriods = periods.map((p) {
        final periodMap = p as Map<String, dynamic>;
        return fc.ForecastPeriodData(
          label: periodMap['label']?.toString() ?? '',
          actual: (periodMap['actual'] as num?)?.toDouble() ?? 0,
          forecast: (periodMap['forecast'] as num?)?.toDouble() ?? 0,
        );
      }).toList();

      final forecast = fc.ForecastChartData(
        target: target,
        achieved: achieved,
        projected: projected,
        periods: parsedPeriods,
      );

      return fc.ForecastChart(
        forecast: forecast,
        selectedPeriodType: fc.ForecastPeriodType.monthly,
        onDrillDown: (period) {
          ctx.onAction(ActionEvent(
            actionId: 'drill-down-${period.label}',
            actionType: 'drilldown',
            payload: {'period': period.label},
          ));
        },
        onPeriodChange: (periodType) {
          ctx.onAction(ActionEvent(
            actionId: 'change-period-type',
            actionType: 'filter',
            payload: {'periodType': periodType.name},
          ));
        },
      );
    } catch (e) {
      return _buildError('ForecastChart: ${e.toString()}');
    }
  }

  static Widget _buildBudgetSummaryCard(ComponentRendererContext ctx) {
    try {
      final props = ctx.props;

      // Parse budget data
      final budgetMap = props['budget'] as Map<String, dynamic>? ?? props;
      final budget = _parseBudgetData(budgetMap);

      // Parse trend (optional)
      final trendMap = props['trend'] as Map<String, dynamic>?;
      bsc.BudgetTrend? trend;
      if (trendMap != null) {
        final direction = trendMap['direction']?.toString() ?? 'neutral';
        trend = bsc.BudgetTrend(
          direction: direction == 'up'
              ? bsc.TrendDirection.up
              : direction == 'down'
                  ? bsc.TrendDirection.down
                  : bsc.TrendDirection.neutral,
          percentChange:
              (trendMap['percentChange'] as num?)?.toDouble() ?? 0,
          label: trendMap['label']?.toString() ?? '',
        );
      }

      return bsc.BudgetSummaryCard(
        budget: budget,
        trend: trend,
        onViewDetails: () {
          ctx.onAction(ActionEvent(
            actionId: 'view-budget-details',
            actionType: 'navigate',
            payload: {'department': budget.department, 'year': budget.year},
          ));
        },
        onRequestAmendment: () {
          ctx.onAction(ActionEvent(
            actionId: 'request-budget-amendment',
            actionType: 'edit',
            payload: {'department': budget.department, 'year': budget.year},
          ));
        },
      );
    } catch (e) {
      return _buildError('BudgetSummaryCard: ${e.toString()}');
    }
  }

  static Widget _buildApprovalsQueue(ComponentRendererContext ctx) {
    try {
      final props = ctx.props;

      // Parse time off requests
      final timeOffList =
          props['timeOffRequests'] as List<dynamic>? ?? [];
      final timeOffRequests = timeOffList.map((t) {
        final m = t as Map<String, dynamic>;
        return aq.TimeOffRequest(
          id: m['id']?.toString() ?? '',
          employeeName: m['employeeName']?.toString() ?? '',
          type: m['type']?.toString() ?? 'vacation',
          startDate: DateTime.tryParse(m['startDate']?.toString() ?? '') ??
              DateTime.now(),
          endDate: DateTime.tryParse(m['endDate']?.toString() ?? '') ??
              DateTime.now(),
          isUrgent: m['isUrgent'] == true,
        );
      }).toList();

      // Parse expense reports
      final expenseList = props['expenseReports'] as List<dynamic>? ?? [];
      final expenseReports = expenseList.map((e) {
        final m = e as Map<String, dynamic>;
        return aq.ExpenseReport(
          id: m['id']?.toString() ?? '',
          employeeName: m['employeeName']?.toString() ?? '',
          amount: (m['amount'] as num?)?.toDouble() ?? 0,
          description: m['description']?.toString() ?? '',
          isUrgent: m['isUrgent'] == true || (m['amount'] as num? ?? 0) > 5000,
        );
      }).toList();

      // Parse budget amendments
      final budgetList =
          props['budgetAmendments'] as List<dynamic>? ?? [];
      final budgetAmendments = budgetList.map((b) {
        final m = b as Map<String, dynamic>;
        return aq.BudgetAmendment(
          id: m['id']?.toString() ?? '',
          department: m['department']?.toString() ?? '',
          amount: (m['requestedBudget'] as num?)?.toDouble() ??
              (m['amount'] as num?)?.toDouble() ??
              0,
          reason: m['reason']?.toString() ?? '',
          isUrgent: m['isUrgent'] == true,
        );
      }).toList();

      return aq.ApprovalsQueue(
        timeOffRequests: timeOffRequests,
        expenseReports: expenseReports,
        budgetAmendments: budgetAmendments,
        onApprove: (id, type) {
          ctx.onAction(ActionEvent(
            actionId: 'approve-$id',
            actionType: 'approve',
            targetId: id,
            payload: {'itemId': id, 'itemType': type.name},
          ));
        },
        onReject: (id, type) {
          ctx.onAction(ActionEvent(
            actionId: 'reject-$id',
            actionType: 'reject',
            targetId: id,
            payload: {'itemId': id, 'itemType': type.name},
          ));
        },
        onViewDetails: (id, type) {
          ctx.onAction(ActionEvent(
            actionId: 'view-$id',
            actionType: 'viewDetails',
            targetId: id,
            payload: {'itemId': id, 'itemType': type.name},
          ));
        },
      );
    } catch (e) {
      return _buildError('ApprovalsQueue: ${e.toString()}');
    }
  }

  static Widget _buildQuarterlyReportDashboard(ComponentRendererContext ctx) {
    try {
      final props = ctx.props;

      // Parse quarterly report
      final reportMap = props['report'] as Map<String, dynamic>? ?? props;
      final report = _parseQuarterlyReport(reportMap);

      // Parse highlights
      final highlightsList = props['highlights'] as List<dynamic>? ?? [];
      final highlights = highlightsList.map((h) => h.toString()).toList();

      return qrd.QuarterlyReportDashboard(
        report: report,
        highlights: highlights,
        onDrillDown: (kpiName) {
          ctx.onAction(ActionEvent(
            actionId: 'drill-down-$kpiName',
            actionType: 'drilldown',
            payload: {'kpi': kpiName},
          ));
        },
        onExport: (format) {
          ctx.onAction(ActionEvent(
            actionId: 'export-${format.name}',
            actionType: 'export',
            payload: {'format': format.name},
          ));
        },
      );
    } catch (e) {
      return _buildError('QuarterlyReportDashboard: ${e.toString()}');
    }
  }

  // =========================================================================
  // PARSING HELPERS
  // =========================================================================

  static emp.Employee _parseEmployee(Map<String, dynamic> m) {
    return emp.Employee(
      id: m['id']?.toString() ?? m['employee_id']?.toString() ?? '',
      name: m['name']?.toString() ?? m['full_name']?.toString() ?? '',
      title: m['title']?.toString() ?? m['job_title']?.toString() ?? '',
      email: m['email']?.toString(),
      avatarUrl: m['avatarUrl']?.toString() ?? m['avatar_url']?.toString(),
      department: m['department']?.toString(),
    );
  }

  static Customer _parseCustomer(Map<String, dynamic> m) {
    return Customer(
      id: m['id']?.toString() ?? m['_id']?.toString() ?? '',
      name: m['name']?.toString() ?? '',
      industry: m['industry']?.toString(),
      annualRevenue: (m['annualRevenue'] as num?)?.toDouble() ??
          (m['annual_revenue'] as num?)?.toDouble(),
      employeeCount: m['employeeCount'] as int? ?? m['employee_count'] as int?,
      website: m['website']?.toString(),
      status: m['status']?.toString() ?? 'active',
      logoUrl: m['logoUrl']?.toString() ?? m['logo_url']?.toString(),
    );
  }

  static Contact _parseContact(Map<String, dynamic> m) {
    return Contact(
      id: m['id']?.toString() ?? m['_id']?.toString() ?? '',
      name: m['name']?.toString() ?? '',
      email: m['email']?.toString(),
      phone: m['phone']?.toString(),
      title: m['title']?.toString() ?? m['role']?.toString(),
      isPrimary: m['isPrimary'] == true || m['is_primary'] == true,
    );
  }

  static Opportunity _parseOpportunity(Map<String, dynamic> m) {
    return Opportunity(
      id: m['id']?.toString() ?? m['_id']?.toString() ?? '',
      name: m['name']?.toString() ?? '',
      amount: (m['amount'] as num?)?.toDouble() ?? 0,
      stage: m['stage']?.toString() ?? '',
      probability: (m['probability'] as num?)?.toDouble(),
      closeDate: DateTime.tryParse(m['closeDate']?.toString() ??
          m['close_date']?.toString() ?? ''),
    );
  }

  static Lead _parseLead(Map<String, dynamic> m) {
    final statusStr = m['status']?.toString().toUpperCase() ?? 'NEW';
    LeadStatus status;
    switch (statusStr) {
      case 'CONTACTED':
        status = LeadStatus.contacted;
        break;
      case 'QUALIFIED':
        status = LeadStatus.qualified;
        break;
      case 'UNQUALIFIED':
        status = LeadStatus.unqualified;
        break;
      case 'CONVERTED':
        status = LeadStatus.converted;
        break;
      default:
        status = LeadStatus.newLead;
    }

    return Lead(
      id: m['id']?.toString() ?? m['_id']?.toString() ?? '',
      name: m['name']?.toString() ?? '',
      company: m['company']?.toString(),
      score: m['score'] as int?,
      status: status,
      source: m['source']?.toString(),
      email: m['email']?.toString(),
      phone: m['phone']?.toString(),
      createdAt: DateTime.tryParse(m['createdAt']?.toString() ??
          m['created_at']?.toString() ?? ''),
      ownerId: m['ownerId']?.toString() ?? m['owner_id']?.toString(),
      ownerName: m['ownerName']?.toString() ?? m['owner_name']?.toString(),
    );
  }

  static BudgetData _parseBudgetData(Map<String, dynamic> m) {
    final categoriesList = m['categories'] as List<dynamic>? ?? [];
    final categories = categoriesList.map((c) {
      final cm = c as Map<String, dynamic>;
      return CategorySpend(
        category: cm['category']?.toString() ?? cm['name']?.toString() ?? '',
        allocated: (cm['allocated'] as num?)?.toDouble() ?? 0,
        spent: (cm['spent'] as num?)?.toDouble() ?? 0,
        percentUsed: (cm['percentUsed'] as num?)?.toDouble() ??
            (cm['percentage'] as num?)?.toDouble() ??
            0,
      );
    }).toList();

    final warningsList = m['warnings'] as List<dynamic>? ?? [];
    final warnings = warningsList.map((w) => w.toString()).toList();

    final totalBudget = (m['totalBudget'] as num?)?.toDouble() ??
        (m['allocated'] as num?)?.toDouble() ??
        0;
    final spent = (m['spent'] as num?)?.toDouble() ?? 0;
    final remaining = (m['remaining'] as num?)?.toDouble() ?? (totalBudget - spent);
    final percentUsed = (m['percentUsed'] as num?)?.toDouble() ??
        (m['percentage'] as num?)?.toDouble() ??
        (totalBudget > 0 ? (spent / totalBudget * 100) : 0);

    return BudgetData(
      department: m['department']?.toString() ??
          m['departmentName']?.toString() ?? '',
      year: m['year'] as int? ?? m['fiscalYear'] as int? ?? DateTime.now().year,
      totalBudget: totalBudget,
      spent: spent,
      remaining: remaining,
      percentUsed: percentUsed,
      categories: categories,
      warnings: warnings,
      status: m['status']?.toString() ?? 'APPROVED',
    );
  }

  static QuarterlyReport _parseQuarterlyReport(Map<String, dynamic> m) {
    // Parse ARR movement
    ARRMovement? arrMovement;
    final arrMap = m['arrMovement'] as Map<String, dynamic>? ??
        m['arr_movement'] as Map<String, dynamic>?;
    if (arrMap != null) {
      arrMovement = ARRMovement(
        starting: (arrMap['starting'] as num?)?.toDouble() ?? 0,
        newBusiness: (arrMap['newBusiness'] as num?)?.toDouble() ??
            (arrMap['new_business'] as num?)?.toDouble() ??
            0,
        expansion: (arrMap['expansion'] as num?)?.toDouble() ?? 0,
        churn: (arrMap['churn'] as num?)?.toDouble() ?? 0,
        contraction: (arrMap['contraction'] as num?)?.toDouble() ?? 0,
        ending: (arrMap['ending'] as num?)?.toDouble() ?? 0,
      );
    }

    // Parse revenue by segment
    final segmentsList = m['revenueBySegment'] as List<dynamic>? ??
        m['revenue_by_segment'] as List<dynamic>? ??
        [];
    final revenueBySegment = segmentsList.map((s) {
      final sm = s as Map<String, dynamic>;
      return SegmentRevenue(
        segment: sm['segment']?.toString() ?? '',
        revenue: (sm['revenue'] as num?)?.toDouble() ?? 0,
        percent: (sm['percent'] as num?)?.toDouble() ??
            (sm['percentage'] as num?)?.toDouble() ??
            0,
      );
    }).toList();

    // Parse KPIs
    final kpisList = m['kpis'] as List<dynamic>? ?? [];
    final kpis = kpisList.map((k) {
      final km = k as Map<String, dynamic>;
      return KPI(
        name: km['name']?.toString() ?? '',
        value: km['value']?.toString() ?? '0',
        change: km['change']?.toString(),
        trend: km['trend']?.toString(),
        unit: km['unit']?.toString(),
      );
    }).toList();

    return QuarterlyReport(
      quarter: m['quarter']?.toString() ?? 'Q1',
      year: m['year'] as int? ?? DateTime.now().year,
      revenue: (m['revenue'] as num?)?.toDouble() ?? 0,
      arr: (m['arr'] as num?)?.toDouble() ?? 0,
      netIncome: (m['netIncome'] as num?)?.toDouble() ??
          (m['net_income'] as num?)?.toDouble() ??
          0,
      revenueGrowth: (m['revenueGrowth'] as num?)?.toDouble() ??
          (m['revenue_growth'] as num?)?.toDouble(),
      arrGrowth: (m['arrGrowth'] as num?)?.toDouble() ??
          (m['arr_growth'] as num?)?.toDouble(),
      netIncomeGrowth: (m['netIncomeGrowth'] as num?)?.toDouble() ??
          (m['net_income_growth'] as num?)?.toDouble(),
      arrMovement: arrMovement,
      revenueBySegment: revenueBySegment,
      kpis: kpis,
    );
  }

  static Widget _buildError(String message) {
    return Builder(
      builder: (context) {
        final theme = Theme.of(context);
        return Card(
          color: theme.colorScheme.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(Icons.error, color: theme.colorScheme.error),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    message,
                    style: TextStyle(color: theme.colorScheme.onErrorContainer),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final builder = _componentMap[component.type];

    if (builder == null) {
      return UnknownComponentFallback(componentType: component.type);
    }

    final ctx = ComponentRendererContext(
      props: component.props,
      actions: component.actions,
      narration: component.narration,
      metadata: component.metadata,
      onAction: onAction,
      voiceEnabled: voiceEnabled,
    );

    return builder(ctx);
  }
}

/// Context passed to component builders
class ComponentRendererContext {
  final Map<String, dynamic> props;
  final List<ComponentAction> actions;
  final Narration? narration;
  final ComponentMetadata? metadata;
  final void Function(ActionEvent) onAction;
  final bool voiceEnabled;

  const ComponentRendererContext({
    required this.props,
    required this.actions,
    required this.narration,
    required this.metadata,
    required this.onAction,
    required this.voiceEnabled,
  });
}

/// Fallback widget displayed when component type is unknown.
///
/// This widget provides visual feedback that a component type was received
/// but is not recognized by the current client version.
class UnknownComponentFallback extends StatelessWidget {
  /// The unrecognized component type
  final String componentType;

  const UnknownComponentFallback({
    super.key,
    required this.componentType,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      color: theme.colorScheme.warningContainer,
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.onWarningContainer.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.warning_amber_rounded,
                    color: theme.colorScheme.onWarningContainer,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Unknown Component',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.onWarningContainer,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Component type "$componentType" is not supported in this version.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color:
                              theme.colorScheme.onWarningContainer.withOpacity(0.8),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Please update your app to view this component.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onWarningContainer.withOpacity(0.7),
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Placeholder widget for components that are not yet implemented.
///
/// This is a temporary widget used during development to indicate where
/// real components will be rendered. It shows the component type and props.
class ComponentPlaceholder extends StatelessWidget {
  /// The component type name
  final String componentType;

  /// Component props
  final Map<String, dynamic> props;

  /// Action callback
  final void Function(ActionEvent) onAction;

  const ComponentPlaceholder({
    super.key,
    required this.componentType,
    required this.props,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      color: theme.colorScheme.surfaceContainerHighest,
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.widgets_outlined,
                    color: theme.colorScheme.primary,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        componentType,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.onSurface,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${props.length} props provided',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withOpacity(0.7),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Placeholder content
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: theme.colorScheme.outlineVariant,
                  style: BorderStyle.solid,
                ),
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _getIconForType(componentType),
                      size: 48,
                      color: theme.colorScheme.onSurface.withOpacity(0.3),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Component placeholder',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.5),
                      ),
                    ),
                    Text(
                      'Full implementation coming soon',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.4),
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Action button for testing
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonal(
                key: const Key('trigger-action'),
                onPressed: () => onAction(
                  ActionEvent(
                    actionId: 'placeholder-action-${componentType.toLowerCase()}',
                    actionType: 'placeholder_action',
                    payload: {'componentType': componentType},
                  ),
                ),
                child: const Text('Test Action'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _getIconForType(String type) {
    switch (type) {
      case 'OrgChartComponent':
        return Icons.account_tree_outlined;
      case 'CustomerDetailCard':
        return Icons.business_outlined;
      case 'LeadsDataTable':
        return Icons.table_chart_outlined;
      case 'ForecastChart':
        return Icons.trending_up_outlined;
      case 'BudgetSummaryCard':
        return Icons.account_balance_wallet_outlined;
      case 'ApprovalsQueue':
        return Icons.pending_actions_outlined;
      case 'QuarterlyReportDashboard':
        return Icons.dashboard_outlined;
      default:
        return Icons.widgets_outlined;
    }
  }
}
