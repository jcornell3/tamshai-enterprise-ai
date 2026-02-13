import 'package:freezed_annotation/freezed_annotation.dart';

part 'component_response.freezed.dart';
part 'component_response.g.dart';

// =============================================================================
// CORE RESPONSE MODELS
// =============================================================================

/// Response from MCP UI Service containing component definition and data
@freezed
sealed class ComponentResponse with _$ComponentResponse {
  const factory ComponentResponse({
    /// Component type identifier (e.g., 'OrgChartComponent', 'ApprovalsQueue')
    required String type,

    /// Component-specific props/data
    required Map<String, dynamic> props,

    /// Available actions for this component
    @Default([]) List<ComponentAction> actions,

    /// Voice narration for TTS
    Narration? narration,

    /// Metadata about the response
    ComponentMetadata? metadata,
  }) = _ComponentResponse;

  factory ComponentResponse.fromJson(Map<String, dynamic> json) =>
      _$ComponentResponseFromJson(json);
}

/// Voice narration for component (text and optional SSML)
@freezed
sealed class Narration with _$Narration {
  const factory Narration({
    /// Plain text narration
    required String text,

    /// SSML-formatted narration for enhanced TTS
    String? ssml,
  }) = _Narration;

  factory Narration.fromJson(Map<String, dynamic> json) =>
      _$NarrationFromJson(json);
}

/// Action available on a component (navigate, drill-down, approve, etc.)
@freezed
sealed class ComponentAction with _$ComponentAction {
  const factory ComponentAction({
    /// Unique action identifier
    required String id,

    /// Action label for UI
    required String label,

    /// Optional icon name
    String? icon,

    /// Button variant: 'primary', 'secondary', 'danger', etc.
    @Default('primary') String variant,

    /// Target for navigation actions (e.g., '/hr/employees/:id')
    String? target,

    /// Display directive for expand/drilldown actions
    String? directive,
  }) = _ComponentAction;

  factory ComponentAction.fromJson(Map<String, dynamic> json) =>
      _$ComponentActionFromJson(json);
}

/// Metadata about the component response
@freezed
sealed class ComponentMetadata with _$ComponentMetadata {
  const factory ComponentMetadata({
    /// When the data was fetched
    DateTime? dataFreshness,

    /// Whether the data was truncated
    @Default(false) bool truncated,

    /// Total count as string (e.g., "50+")
    String? totalCount,

    /// Warning message if truncated or issues
    String? warning,
  }) = _ComponentMetadata;

  factory ComponentMetadata.fromJson(Map<String, dynamic> json) =>
      _$ComponentMetadataFromJson(json);
}

// =============================================================================
// HR DOMAIN MODELS
// =============================================================================

/// Employee for org chart and approvals
@freezed
sealed class Employee with _$Employee {
  const factory Employee({
    required String id,
    required String name,
    required String title,
    String? email,
    String? avatarUrl,
    String? department,
  }) = _Employee;

  factory Employee.fromJson(Map<String, dynamic> json) =>
      _$EmployeeFromJson(json);
}

/// Extension for Employee utilities
extension EmployeeExtension on Employee {
  /// Get initials from name (e.g., "John Doe" -> "JD")
  String get initials {
    final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

/// Time-off request for approvals queue
@freezed
sealed class TimeOffRequest with _$TimeOffRequest {
  const factory TimeOffRequest({
    required String id,
    required String employeeName,
    required DateTime startDate,
    required DateTime endDate,
    required String type,
    String? reason,
    String? employeeId,
    @Default('pending') String status,
    DateTime? submittedAt,
  }) = _TimeOffRequest;

  factory TimeOffRequest.fromJson(Map<String, dynamic> json) =>
      _$TimeOffRequestFromJson(json);
}

/// Org chart data structure
@freezed
sealed class OrgChartData with _$OrgChartData {
  const factory OrgChartData({
    Employee? manager,
    required Employee self,
    @Default([]) List<Employee> peers,
    @Default([]) List<Employee> directReports,
  }) = _OrgChartData;

  factory OrgChartData.fromJson(Map<String, dynamic> json) =>
      _$OrgChartDataFromJson(json);
}

// =============================================================================
// FINANCE DOMAIN MODELS
// =============================================================================

/// Expense report for approvals queue
@freezed
sealed class ExpenseReport with _$ExpenseReport {
  const factory ExpenseReport({
    required String id,
    required String employeeName,
    required double amount,
    required DateTime date,
    required String description,
    required int itemCount,
    String? employeeId,
    @Default('SUBMITTED') String status,
    DateTime? submittedAt,
  }) = _ExpenseReport;

  factory ExpenseReport.fromJson(Map<String, dynamic> json) =>
      _$ExpenseReportFromJson(json);
}

/// Budget amendment for approvals queue
@freezed
sealed class BudgetAmendment with _$BudgetAmendment {
  const factory BudgetAmendment({
    required String id,
    required String department,
    required double currentBudget,
    required double requestedBudget,
    required String reason,
    String? submittedBy,
    @Default('pending') String status,
    DateTime? submittedAt,
  }) = _BudgetAmendment;

  factory BudgetAmendment.fromJson(Map<String, dynamic> json) =>
      _$BudgetAmendmentFromJson(json);
}

/// Budget summary data for BudgetSummaryCard
@freezed
sealed class BudgetData with _$BudgetData {
  const factory BudgetData({
    required String department,
    required int year,
    required double totalBudget,
    required double spent,
    required double remaining,
    required double percentUsed,
    @Default([]) List<CategorySpend> categories,
    @Default([]) List<String> warnings,
    @Default('APPROVED') String status,
  }) = _BudgetData;

  factory BudgetData.fromJson(Map<String, dynamic> json) =>
      _$BudgetDataFromJson(json);
}

/// Spending by category for budget breakdown
@freezed
sealed class CategorySpend with _$CategorySpend {
  const factory CategorySpend({
    required String category,
    required double allocated,
    required double spent,
    required double percentUsed,
  }) = _CategorySpend;

  factory CategorySpend.fromJson(Map<String, dynamic> json) =>
      _$CategorySpendFromJson(json);
}

/// Quarterly financial report data
@freezed
sealed class QuarterlyReport with _$QuarterlyReport {
  const factory QuarterlyReport({
    required String quarter,
    required int year,
    required double revenue,
    required double arr,
    required double netIncome,
    double? revenueGrowth,
    double? arrGrowth,
    double? netIncomeGrowth,
    ARRMovement? arrMovement,
    @Default([]) List<SegmentRevenue> revenueBySegment,
    @Default([]) List<KPI> kpis,
  }) = _QuarterlyReport;

  factory QuarterlyReport.fromJson(Map<String, dynamic> json) =>
      _$QuarterlyReportFromJson(json);
}

/// ARR movement (starting, new, expansion, churn, contraction, ending)
@freezed
sealed class ARRMovement with _$ARRMovement {
  const factory ARRMovement({
    required double starting,
    required double newBusiness,
    required double expansion,
    required double churn,
    required double contraction,
    required double ending,
  }) = _ARRMovement;

  factory ARRMovement.fromJson(Map<String, dynamic> json) =>
      _$ARRMovementFromJson(json);
}

/// Revenue breakdown by segment
@freezed
sealed class SegmentRevenue with _$SegmentRevenue {
  const factory SegmentRevenue({
    required String segment,
    required double revenue,
    required double percent,
  }) = _SegmentRevenue;

  factory SegmentRevenue.fromJson(Map<String, dynamic> json) =>
      _$SegmentRevenueFromJson(json);
}

/// Key performance indicator for dashboard
@freezed
sealed class KPI with _$KPI {
  const factory KPI({
    required String name,
    required String value,
    String? change,
    String? trend,
    String? unit,
  }) = _KPI;

  factory KPI.fromJson(Map<String, dynamic> json) => _$KPIFromJson(json);
}

/// Waterfall chart item (for ARR movement visualization)
@freezed
sealed class WaterfallItem with _$WaterfallItem {
  const factory WaterfallItem({
    required String label,
    required double value,
    required bool isTotal,
    @Default(false) bool isSubtotal,
    String? color,
  }) = _WaterfallItem;

  factory WaterfallItem.fromJson(Map<String, dynamic> json) =>
      _$WaterfallItemFromJson(json);
}

// =============================================================================
// SALES/CRM DOMAIN MODELS
// =============================================================================

/// Customer for CustomerDetailCard
@freezed
sealed class Customer with _$Customer {
  const factory Customer({
    required String id,
    required String name,
    String? industry,
    double? annualRevenue,
    int? employeeCount,
    String? website,
    @Default('active') String status,
    String? logoUrl,
    DateTime? createdAt,
  }) = _Customer;

  factory Customer.fromJson(Map<String, dynamic> json) =>
      _$CustomerFromJson(json);
}

/// Contact at a customer company
@freezed
sealed class Contact with _$Contact {
  const factory Contact({
    required String id,
    required String name,
    String? email,
    String? phone,
    String? title,
    @Default(false) bool isPrimary,
    String? customerId,
  }) = _Contact;

  factory Contact.fromJson(Map<String, dynamic> json) =>
      _$ContactFromJson(json);
}

/// Sales opportunity
@freezed
sealed class Opportunity with _$Opportunity {
  const factory Opportunity({
    required String id,
    required String name,
    required double amount,
    required String stage,
    String? customerId,
    String? customerName,
    DateTime? closeDate,
    double? probability,
  }) = _Opportunity;

  factory Opportunity.fromJson(Map<String, dynamic> json) =>
      _$OpportunityFromJson(json);
}

/// Sales lead for LeadsDataTable
@freezed
sealed class Lead with _$Lead {
  const factory Lead({
    required String id,
    required String name,
    String? company,
    int? score,
    required LeadStatus status,
    String? source,
    String? email,
    String? phone,
    DateTime? createdAt,
    String? ownerId,
    String? ownerName,
  }) = _Lead;

  factory Lead.fromJson(Map<String, dynamic> json) => _$LeadFromJson(json);
}

/// Lead status enum
enum LeadStatus {
  @JsonValue('NEW')
  newLead,
  @JsonValue('CONTACTED')
  contacted,
  @JsonValue('QUALIFIED')
  qualified,
  @JsonValue('UNQUALIFIED')
  unqualified,
  @JsonValue('CONVERTED')
  converted,
}

/// Lead filters for data table
@freezed
sealed class LeadFilters with _$LeadFilters {
  const factory LeadFilters({
    LeadStatus? status,
    String? source,
    int? minScore,
    String? ownerId,
    String? search,
  }) = _LeadFilters;

  factory LeadFilters.fromJson(Map<String, dynamic> json) =>
      _$LeadFiltersFromJson(json);
}

/// Sales forecast data for ForecastChart
@freezed
sealed class ForecastData with _$ForecastData {
  const factory ForecastData({
    required String period,
    required double quota,
    required double commit,
    required double bestCase,
    required double closed,
    @Default([]) List<RepForecast> byRep,
    @Default([]) List<PipelineStage> pipeline,
  }) = _ForecastData;

  factory ForecastData.fromJson(Map<String, dynamic> json) =>
      _$ForecastDataFromJson(json);
}

/// Period for date range filtering
@freezed
sealed class Period with _$Period {
  const factory Period({
    required String label,
    required DateTime start,
    required DateTime end,
    String? quarter,
    int? year,
  }) = _Period;

  factory Period.fromJson(Map<String, dynamic> json) => _$PeriodFromJson(json);
}

/// Forecast by sales rep
@freezed
sealed class RepForecast with _$RepForecast {
  const factory RepForecast({
    required String repId,
    required String repName,
    required double quota,
    required double closed,
    required double commit,
    double? percentToQuota,
  }) = _RepForecast;

  factory RepForecast.fromJson(Map<String, dynamic> json) =>
      _$RepForecastFromJson(json);
}

/// Pipeline stage with deals
@freezed
sealed class PipelineStage with _$PipelineStage {
  const factory PipelineStage({
    required String stage,
    required double amount,
    required int dealCount,
    double? probability,
    double? weightedAmount,
  }) = _PipelineStage;

  factory PipelineStage.fromJson(Map<String, dynamic> json) =>
      _$PipelineStageFromJson(json);
}

// =============================================================================
// APPROVALS AGGREGATED DATA
// =============================================================================

/// Aggregated pending approvals for ApprovalsQueue
@freezed
sealed class PendingApprovals with _$PendingApprovals {
  const factory PendingApprovals({
    @Default([]) List<TimeOffRequest> timeOffRequests,
    @Default([]) List<ExpenseReport> expenseReports,
    @Default([]) List<BudgetAmendment> budgetAmendments,
    int? totalCount,
    DateTime? oldestSubmission,
  }) = _PendingApprovals;

  factory PendingApprovals.fromJson(Map<String, dynamic> json) =>
      _$PendingApprovalsFromJson(json);
}

// =============================================================================
// PAGINATION
// =============================================================================

/// Pagination state for data tables
@freezed
sealed class PaginationState with _$PaginationState {
  const factory PaginationState({
    String? cursor,
    @Default(false) bool hasMore,
    int? totalCount,
    @Default(1) int currentPage,
    @Default(20) int pageSize,
  }) = _PaginationState;

  factory PaginationState.fromJson(Map<String, dynamic> json) =>
      _$PaginationStateFromJson(json);
}

// =============================================================================
// ACTION EVENTS
// =============================================================================

/// Event emitted when user interacts with component
@freezed
sealed class ActionEvent with _$ActionEvent {
  const factory ActionEvent({
    /// Action identifier
    required String actionId,

    /// Action type (e.g., 'navigate', 'approve', 'reject')
    required String actionType,

    /// ID of the item being acted upon
    String? targetId,

    /// Additional data for the action
    Map<String, dynamic>? payload,
  }) = _ActionEvent;

  factory ActionEvent.fromJson(Map<String, dynamic> json) =>
      _$ActionEventFromJson(json);
}

/// Action types for component interactions
enum ActionType {
  navigate,
  drilldown,
  approve,
  reject,
  expand,
  filter,
  sort,
  paginate,
  viewDetails,
  edit,
  delete,
}
