// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'component_response.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ComponentResponse _$ComponentResponseFromJson(Map<String, dynamic> json) =>
    _ComponentResponse(
      type: json['type'] as String,
      props: json['props'] as Map<String, dynamic>,
      actions:
          (json['actions'] as List<dynamic>?)
              ?.map((e) => ComponentAction.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      narration: json['narration'] == null
          ? null
          : Narration.fromJson(json['narration'] as Map<String, dynamic>),
      metadata: json['metadata'] == null
          ? null
          : ComponentMetadata.fromJson(
              json['metadata'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$ComponentResponseToJson(_ComponentResponse instance) =>
    <String, dynamic>{
      'type': instance.type,
      'props': instance.props,
      'actions': instance.actions,
      'narration': instance.narration,
      'metadata': instance.metadata,
    };

_Narration _$NarrationFromJson(Map<String, dynamic> json) =>
    _Narration(text: json['text'] as String, ssml: json['ssml'] as String?);

Map<String, dynamic> _$NarrationToJson(_Narration instance) =>
    <String, dynamic>{'text': instance.text, 'ssml': instance.ssml};

_ComponentAction _$ComponentActionFromJson(Map<String, dynamic> json) =>
    _ComponentAction(
      id: json['id'] as String,
      label: json['label'] as String,
      icon: json['icon'] as String?,
      variant: json['variant'] as String? ?? 'primary',
      target: json['target'] as String?,
      directive: json['directive'] as String?,
    );

Map<String, dynamic> _$ComponentActionToJson(_ComponentAction instance) =>
    <String, dynamic>{
      'id': instance.id,
      'label': instance.label,
      'icon': instance.icon,
      'variant': instance.variant,
      'target': instance.target,
      'directive': instance.directive,
    };

_ComponentMetadata _$ComponentMetadataFromJson(Map<String, dynamic> json) =>
    _ComponentMetadata(
      dataFreshness: json['dataFreshness'] == null
          ? null
          : DateTime.parse(json['dataFreshness'] as String),
      truncated: json['truncated'] as bool? ?? false,
      totalCount: json['totalCount'] as String?,
      warning: json['warning'] as String?,
    );

Map<String, dynamic> _$ComponentMetadataToJson(_ComponentMetadata instance) =>
    <String, dynamic>{
      'dataFreshness': instance.dataFreshness?.toIso8601String(),
      'truncated': instance.truncated,
      'totalCount': instance.totalCount,
      'warning': instance.warning,
    };

_Employee _$EmployeeFromJson(Map<String, dynamic> json) => _Employee(
  id: json['id'] as String,
  name: json['name'] as String,
  title: json['title'] as String,
  email: json['email'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  department: json['department'] as String?,
);

Map<String, dynamic> _$EmployeeToJson(_Employee instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'title': instance.title,
  'email': instance.email,
  'avatarUrl': instance.avatarUrl,
  'department': instance.department,
};

_TimeOffRequest _$TimeOffRequestFromJson(Map<String, dynamic> json) =>
    _TimeOffRequest(
      id: json['id'] as String,
      employeeName: json['employeeName'] as String,
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
      type: json['type'] as String,
      reason: json['reason'] as String?,
      employeeId: json['employeeId'] as String?,
      status: json['status'] as String? ?? 'pending',
      submittedAt: json['submittedAt'] == null
          ? null
          : DateTime.parse(json['submittedAt'] as String),
    );

Map<String, dynamic> _$TimeOffRequestToJson(_TimeOffRequest instance) =>
    <String, dynamic>{
      'id': instance.id,
      'employeeName': instance.employeeName,
      'startDate': instance.startDate.toIso8601String(),
      'endDate': instance.endDate.toIso8601String(),
      'type': instance.type,
      'reason': instance.reason,
      'employeeId': instance.employeeId,
      'status': instance.status,
      'submittedAt': instance.submittedAt?.toIso8601String(),
    };

_OrgChartData _$OrgChartDataFromJson(Map<String, dynamic> json) =>
    _OrgChartData(
      manager: json['manager'] == null
          ? null
          : Employee.fromJson(json['manager'] as Map<String, dynamic>),
      self: Employee.fromJson(json['self'] as Map<String, dynamic>),
      peers:
          (json['peers'] as List<dynamic>?)
              ?.map((e) => Employee.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      directReports:
          (json['directReports'] as List<dynamic>?)
              ?.map((e) => Employee.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$OrgChartDataToJson(_OrgChartData instance) =>
    <String, dynamic>{
      'manager': instance.manager,
      'self': instance.self,
      'peers': instance.peers,
      'directReports': instance.directReports,
    };

_ExpenseReport _$ExpenseReportFromJson(Map<String, dynamic> json) =>
    _ExpenseReport(
      id: json['id'] as String,
      employeeName: json['employeeName'] as String,
      amount: (json['amount'] as num).toDouble(),
      date: DateTime.parse(json['date'] as String),
      description: json['description'] as String,
      itemCount: (json['itemCount'] as num).toInt(),
      employeeId: json['employeeId'] as String?,
      status: json['status'] as String? ?? 'SUBMITTED',
      submittedAt: json['submittedAt'] == null
          ? null
          : DateTime.parse(json['submittedAt'] as String),
    );

Map<String, dynamic> _$ExpenseReportToJson(_ExpenseReport instance) =>
    <String, dynamic>{
      'id': instance.id,
      'employeeName': instance.employeeName,
      'amount': instance.amount,
      'date': instance.date.toIso8601String(),
      'description': instance.description,
      'itemCount': instance.itemCount,
      'employeeId': instance.employeeId,
      'status': instance.status,
      'submittedAt': instance.submittedAt?.toIso8601String(),
    };

_BudgetAmendment _$BudgetAmendmentFromJson(Map<String, dynamic> json) =>
    _BudgetAmendment(
      id: json['id'] as String,
      department: json['department'] as String,
      currentBudget: (json['currentBudget'] as num).toDouble(),
      requestedBudget: (json['requestedBudget'] as num).toDouble(),
      reason: json['reason'] as String,
      submittedBy: json['submittedBy'] as String?,
      status: json['status'] as String? ?? 'pending',
      submittedAt: json['submittedAt'] == null
          ? null
          : DateTime.parse(json['submittedAt'] as String),
    );

Map<String, dynamic> _$BudgetAmendmentToJson(_BudgetAmendment instance) =>
    <String, dynamic>{
      'id': instance.id,
      'department': instance.department,
      'currentBudget': instance.currentBudget,
      'requestedBudget': instance.requestedBudget,
      'reason': instance.reason,
      'submittedBy': instance.submittedBy,
      'status': instance.status,
      'submittedAt': instance.submittedAt?.toIso8601String(),
    };

_BudgetData _$BudgetDataFromJson(Map<String, dynamic> json) => _BudgetData(
  department: json['department'] as String,
  year: (json['year'] as num).toInt(),
  totalBudget: (json['totalBudget'] as num).toDouble(),
  spent: (json['spent'] as num).toDouble(),
  remaining: (json['remaining'] as num).toDouble(),
  percentUsed: (json['percentUsed'] as num).toDouble(),
  categories:
      (json['categories'] as List<dynamic>?)
          ?.map((e) => CategorySpend.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  warnings:
      (json['warnings'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const [],
  status: json['status'] as String? ?? 'APPROVED',
);

Map<String, dynamic> _$BudgetDataToJson(_BudgetData instance) =>
    <String, dynamic>{
      'department': instance.department,
      'year': instance.year,
      'totalBudget': instance.totalBudget,
      'spent': instance.spent,
      'remaining': instance.remaining,
      'percentUsed': instance.percentUsed,
      'categories': instance.categories,
      'warnings': instance.warnings,
      'status': instance.status,
    };

_CategorySpend _$CategorySpendFromJson(Map<String, dynamic> json) =>
    _CategorySpend(
      category: json['category'] as String,
      allocated: (json['allocated'] as num).toDouble(),
      spent: (json['spent'] as num).toDouble(),
      percentUsed: (json['percentUsed'] as num).toDouble(),
    );

Map<String, dynamic> _$CategorySpendToJson(_CategorySpend instance) =>
    <String, dynamic>{
      'category': instance.category,
      'allocated': instance.allocated,
      'spent': instance.spent,
      'percentUsed': instance.percentUsed,
    };

_QuarterlyReport _$QuarterlyReportFromJson(Map<String, dynamic> json) =>
    _QuarterlyReport(
      quarter: json['quarter'] as String,
      year: (json['year'] as num).toInt(),
      revenue: (json['revenue'] as num).toDouble(),
      arr: (json['arr'] as num).toDouble(),
      netIncome: (json['netIncome'] as num).toDouble(),
      revenueGrowth: (json['revenueGrowth'] as num?)?.toDouble(),
      arrGrowth: (json['arrGrowth'] as num?)?.toDouble(),
      netIncomeGrowth: (json['netIncomeGrowth'] as num?)?.toDouble(),
      arrMovement: json['arrMovement'] == null
          ? null
          : ARRMovement.fromJson(json['arrMovement'] as Map<String, dynamic>),
      revenueBySegment:
          (json['revenueBySegment'] as List<dynamic>?)
              ?.map((e) => SegmentRevenue.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      kpis:
          (json['kpis'] as List<dynamic>?)
              ?.map((e) => KPI.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$QuarterlyReportToJson(_QuarterlyReport instance) =>
    <String, dynamic>{
      'quarter': instance.quarter,
      'year': instance.year,
      'revenue': instance.revenue,
      'arr': instance.arr,
      'netIncome': instance.netIncome,
      'revenueGrowth': instance.revenueGrowth,
      'arrGrowth': instance.arrGrowth,
      'netIncomeGrowth': instance.netIncomeGrowth,
      'arrMovement': instance.arrMovement,
      'revenueBySegment': instance.revenueBySegment,
      'kpis': instance.kpis,
    };

_ARRMovement _$ARRMovementFromJson(Map<String, dynamic> json) => _ARRMovement(
  starting: (json['starting'] as num).toDouble(),
  newBusiness: (json['newBusiness'] as num).toDouble(),
  expansion: (json['expansion'] as num).toDouble(),
  churn: (json['churn'] as num).toDouble(),
  contraction: (json['contraction'] as num).toDouble(),
  ending: (json['ending'] as num).toDouble(),
);

Map<String, dynamic> _$ARRMovementToJson(_ARRMovement instance) =>
    <String, dynamic>{
      'starting': instance.starting,
      'newBusiness': instance.newBusiness,
      'expansion': instance.expansion,
      'churn': instance.churn,
      'contraction': instance.contraction,
      'ending': instance.ending,
    };

_SegmentRevenue _$SegmentRevenueFromJson(Map<String, dynamic> json) =>
    _SegmentRevenue(
      segment: json['segment'] as String,
      revenue: (json['revenue'] as num).toDouble(),
      percent: (json['percent'] as num).toDouble(),
    );

Map<String, dynamic> _$SegmentRevenueToJson(_SegmentRevenue instance) =>
    <String, dynamic>{
      'segment': instance.segment,
      'revenue': instance.revenue,
      'percent': instance.percent,
    };

_KPI _$KPIFromJson(Map<String, dynamic> json) => _KPI(
  name: json['name'] as String,
  value: json['value'] as String,
  change: json['change'] as String?,
  trend: json['trend'] as String?,
  unit: json['unit'] as String?,
);

Map<String, dynamic> _$KPIToJson(_KPI instance) => <String, dynamic>{
  'name': instance.name,
  'value': instance.value,
  'change': instance.change,
  'trend': instance.trend,
  'unit': instance.unit,
};

_WaterfallItem _$WaterfallItemFromJson(Map<String, dynamic> json) =>
    _WaterfallItem(
      label: json['label'] as String,
      value: (json['value'] as num).toDouble(),
      isTotal: json['isTotal'] as bool,
      isSubtotal: json['isSubtotal'] as bool? ?? false,
      color: json['color'] as String?,
    );

Map<String, dynamic> _$WaterfallItemToJson(_WaterfallItem instance) =>
    <String, dynamic>{
      'label': instance.label,
      'value': instance.value,
      'isTotal': instance.isTotal,
      'isSubtotal': instance.isSubtotal,
      'color': instance.color,
    };

_Customer _$CustomerFromJson(Map<String, dynamic> json) => _Customer(
  id: json['id'] as String,
  name: json['name'] as String,
  industry: json['industry'] as String?,
  annualRevenue: (json['annualRevenue'] as num?)?.toDouble(),
  employeeCount: (json['employeeCount'] as num?)?.toInt(),
  website: json['website'] as String?,
  status: json['status'] as String? ?? 'active',
  logoUrl: json['logoUrl'] as String?,
  createdAt: json['createdAt'] == null
      ? null
      : DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$CustomerToJson(_Customer instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'industry': instance.industry,
  'annualRevenue': instance.annualRevenue,
  'employeeCount': instance.employeeCount,
  'website': instance.website,
  'status': instance.status,
  'logoUrl': instance.logoUrl,
  'createdAt': instance.createdAt?.toIso8601String(),
};

_Contact _$ContactFromJson(Map<String, dynamic> json) => _Contact(
  id: json['id'] as String,
  name: json['name'] as String,
  email: json['email'] as String?,
  phone: json['phone'] as String?,
  title: json['title'] as String?,
  isPrimary: json['isPrimary'] as bool? ?? false,
  customerId: json['customerId'] as String?,
);

Map<String, dynamic> _$ContactToJson(_Contact instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'email': instance.email,
  'phone': instance.phone,
  'title': instance.title,
  'isPrimary': instance.isPrimary,
  'customerId': instance.customerId,
};

_Opportunity _$OpportunityFromJson(Map<String, dynamic> json) => _Opportunity(
  id: json['id'] as String,
  name: json['name'] as String,
  amount: (json['amount'] as num).toDouble(),
  stage: json['stage'] as String,
  customerId: json['customerId'] as String?,
  customerName: json['customerName'] as String?,
  closeDate: json['closeDate'] == null
      ? null
      : DateTime.parse(json['closeDate'] as String),
  probability: (json['probability'] as num?)?.toDouble(),
);

Map<String, dynamic> _$OpportunityToJson(_Opportunity instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'amount': instance.amount,
      'stage': instance.stage,
      'customerId': instance.customerId,
      'customerName': instance.customerName,
      'closeDate': instance.closeDate?.toIso8601String(),
      'probability': instance.probability,
    };

_Lead _$LeadFromJson(Map<String, dynamic> json) => _Lead(
  id: json['id'] as String,
  name: json['name'] as String,
  company: json['company'] as String?,
  score: (json['score'] as num?)?.toInt(),
  status: $enumDecode(_$LeadStatusEnumMap, json['status']),
  source: json['source'] as String?,
  email: json['email'] as String?,
  phone: json['phone'] as String?,
  createdAt: json['createdAt'] == null
      ? null
      : DateTime.parse(json['createdAt'] as String),
  ownerId: json['ownerId'] as String?,
  ownerName: json['ownerName'] as String?,
);

Map<String, dynamic> _$LeadToJson(_Lead instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'company': instance.company,
  'score': instance.score,
  'status': _$LeadStatusEnumMap[instance.status]!,
  'source': instance.source,
  'email': instance.email,
  'phone': instance.phone,
  'createdAt': instance.createdAt?.toIso8601String(),
  'ownerId': instance.ownerId,
  'ownerName': instance.ownerName,
};

const _$LeadStatusEnumMap = {
  LeadStatus.newLead: 'NEW',
  LeadStatus.contacted: 'CONTACTED',
  LeadStatus.qualified: 'QUALIFIED',
  LeadStatus.unqualified: 'UNQUALIFIED',
  LeadStatus.converted: 'CONVERTED',
};

_LeadFilters _$LeadFiltersFromJson(Map<String, dynamic> json) => _LeadFilters(
  status: $enumDecodeNullable(_$LeadStatusEnumMap, json['status']),
  source: json['source'] as String?,
  minScore: (json['minScore'] as num?)?.toInt(),
  ownerId: json['ownerId'] as String?,
  search: json['search'] as String?,
);

Map<String, dynamic> _$LeadFiltersToJson(_LeadFilters instance) =>
    <String, dynamic>{
      'status': _$LeadStatusEnumMap[instance.status],
      'source': instance.source,
      'minScore': instance.minScore,
      'ownerId': instance.ownerId,
      'search': instance.search,
    };

_ForecastData _$ForecastDataFromJson(Map<String, dynamic> json) =>
    _ForecastData(
      period: json['period'] as String,
      quota: (json['quota'] as num).toDouble(),
      commit: (json['commit'] as num).toDouble(),
      bestCase: (json['bestCase'] as num).toDouble(),
      closed: (json['closed'] as num).toDouble(),
      byRep:
          (json['byRep'] as List<dynamic>?)
              ?.map((e) => RepForecast.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      pipeline:
          (json['pipeline'] as List<dynamic>?)
              ?.map((e) => PipelineStage.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$ForecastDataToJson(_ForecastData instance) =>
    <String, dynamic>{
      'period': instance.period,
      'quota': instance.quota,
      'commit': instance.commit,
      'bestCase': instance.bestCase,
      'closed': instance.closed,
      'byRep': instance.byRep,
      'pipeline': instance.pipeline,
    };

_Period _$PeriodFromJson(Map<String, dynamic> json) => _Period(
  label: json['label'] as String,
  start: DateTime.parse(json['start'] as String),
  end: DateTime.parse(json['end'] as String),
  quarter: json['quarter'] as String?,
  year: (json['year'] as num?)?.toInt(),
);

Map<String, dynamic> _$PeriodToJson(_Period instance) => <String, dynamic>{
  'label': instance.label,
  'start': instance.start.toIso8601String(),
  'end': instance.end.toIso8601String(),
  'quarter': instance.quarter,
  'year': instance.year,
};

_RepForecast _$RepForecastFromJson(Map<String, dynamic> json) => _RepForecast(
  repId: json['repId'] as String,
  repName: json['repName'] as String,
  quota: (json['quota'] as num).toDouble(),
  closed: (json['closed'] as num).toDouble(),
  commit: (json['commit'] as num).toDouble(),
  percentToQuota: (json['percentToQuota'] as num?)?.toDouble(),
);

Map<String, dynamic> _$RepForecastToJson(_RepForecast instance) =>
    <String, dynamic>{
      'repId': instance.repId,
      'repName': instance.repName,
      'quota': instance.quota,
      'closed': instance.closed,
      'commit': instance.commit,
      'percentToQuota': instance.percentToQuota,
    };

_PipelineStage _$PipelineStageFromJson(Map<String, dynamic> json) =>
    _PipelineStage(
      stage: json['stage'] as String,
      amount: (json['amount'] as num).toDouble(),
      dealCount: (json['dealCount'] as num).toInt(),
      probability: (json['probability'] as num?)?.toDouble(),
      weightedAmount: (json['weightedAmount'] as num?)?.toDouble(),
    );

Map<String, dynamic> _$PipelineStageToJson(_PipelineStage instance) =>
    <String, dynamic>{
      'stage': instance.stage,
      'amount': instance.amount,
      'dealCount': instance.dealCount,
      'probability': instance.probability,
      'weightedAmount': instance.weightedAmount,
    };

_PendingApprovals _$PendingApprovalsFromJson(Map<String, dynamic> json) =>
    _PendingApprovals(
      timeOffRequests:
          (json['timeOffRequests'] as List<dynamic>?)
              ?.map((e) => TimeOffRequest.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      expenseReports:
          (json['expenseReports'] as List<dynamic>?)
              ?.map((e) => ExpenseReport.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      budgetAmendments:
          (json['budgetAmendments'] as List<dynamic>?)
              ?.map((e) => BudgetAmendment.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      totalCount: (json['totalCount'] as num?)?.toInt(),
      oldestSubmission: json['oldestSubmission'] == null
          ? null
          : DateTime.parse(json['oldestSubmission'] as String),
    );

Map<String, dynamic> _$PendingApprovalsToJson(_PendingApprovals instance) =>
    <String, dynamic>{
      'timeOffRequests': instance.timeOffRequests,
      'expenseReports': instance.expenseReports,
      'budgetAmendments': instance.budgetAmendments,
      'totalCount': instance.totalCount,
      'oldestSubmission': instance.oldestSubmission?.toIso8601String(),
    };

_PaginationState _$PaginationStateFromJson(Map<String, dynamic> json) =>
    _PaginationState(
      cursor: json['cursor'] as String?,
      hasMore: json['hasMore'] as bool? ?? false,
      totalCount: (json['totalCount'] as num?)?.toInt(),
      currentPage: (json['currentPage'] as num?)?.toInt() ?? 1,
      pageSize: (json['pageSize'] as num?)?.toInt() ?? 20,
    );

Map<String, dynamic> _$PaginationStateToJson(_PaginationState instance) =>
    <String, dynamic>{
      'cursor': instance.cursor,
      'hasMore': instance.hasMore,
      'totalCount': instance.totalCount,
      'currentPage': instance.currentPage,
      'pageSize': instance.pageSize,
    };

_ActionEvent _$ActionEventFromJson(Map<String, dynamic> json) => _ActionEvent(
  actionId: json['actionId'] as String,
  actionType: json['actionType'] as String,
  targetId: json['targetId'] as String?,
  payload: json['payload'] as Map<String, dynamic>?,
);

Map<String, dynamic> _$ActionEventToJson(_ActionEvent instance) =>
    <String, dynamic>{
      'actionId': instance.actionId,
      'actionType': instance.actionType,
      'targetId': instance.targetId,
      'payload': instance.payload,
    };
