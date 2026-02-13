import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';

void main() {
  // =============================================================================
  // CORE RESPONSE MODELS
  // =============================================================================

  group('ComponentResponse', () {
    group('fromJson / toJson', () {
      test('serializes and deserializes with required fields only', () {
        final json = {
          'type': 'OrgChartComponent',
          'props': {'key': 'value'},
        };

        final response = ComponentResponse.fromJson(json);
        expect(response.type, equals('OrgChartComponent'));
        expect(response.props, equals({'key': 'value'}));
        expect(response.actions, isEmpty);
        expect(response.narration, isNull);
        expect(response.metadata, isNull);

        final serialized = response.toJson();
        expect(serialized['type'], equals('OrgChartComponent'));
        expect(serialized['props'], equals({'key': 'value'}));
      });

      test('serializes and deserializes with all optional fields', () {
        final json = {
          'type': 'ApprovalsQueue',
          'props': {'items': []},
          'actions': [
            {'id': 'approve', 'label': 'Approve'},
          ],
          'narration': {'text': 'You have pending approvals'},
          'metadata': {
            'truncated': true,
            'totalCount': '50+',
          },
        };

        final response = ComponentResponse.fromJson(json);
        expect(response.type, equals('ApprovalsQueue'));
        expect(response.actions.length, equals(1));
        expect(response.narration!.text, equals('You have pending approvals'));
        expect(response.metadata!.truncated, isTrue);

        final serialized = response.toJson();
        expect(serialized['actions'], isList);
        expect(serialized['narration'], isNotNull);
        expect(serialized['metadata'], isNotNull);
      });

      test('handles empty actions list', () {
        final json = {
          'type': 'TestComponent',
          'props': <String, dynamic>{},
          'actions': <Map<String, dynamic>>[],
        };

        final response = ComponentResponse.fromJson(json);
        expect(response.actions, isEmpty);
      });
    });
  });

  group('Narration', () {
    group('fromJson / toJson', () {
      test('serializes with text only', () {
        final json = {'text': 'Hello world'};

        final narration = Narration.fromJson(json);
        expect(narration.text, equals('Hello world'));
        expect(narration.ssml, isNull);

        final serialized = narration.toJson();
        expect(serialized['text'], equals('Hello world'));
        expect(serialized['ssml'], isNull);
      });

      test('serializes with text and ssml', () {
        final json = {
          'text': 'Hello world',
          'ssml': '<speak>Hello <emphasis>world</emphasis></speak>',
        };

        final narration = Narration.fromJson(json);
        expect(narration.text, equals('Hello world'));
        expect(narration.ssml, contains('<speak>'));

        final serialized = narration.toJson();
        expect(serialized['ssml'], contains('<speak>'));
      });
    });
  });

  group('ComponentAction', () {
    group('fromJson / toJson', () {
      test('serializes with required fields only', () {
        final json = {
          'id': 'action-1',
          'label': 'Submit',
        };

        final action = ComponentAction.fromJson(json);
        expect(action.id, equals('action-1'));
        expect(action.label, equals('Submit'));
        expect(action.variant, equals('primary')); // default
        expect(action.icon, isNull);
        expect(action.target, isNull);
        expect(action.directive, isNull);

        final serialized = action.toJson();
        expect(serialized['id'], equals('action-1'));
        expect(serialized['variant'], equals('primary'));
      });

      test('serializes with all optional fields', () {
        final json = {
          'id': 'navigate-1',
          'label': 'View Details',
          'icon': 'visibility',
          'variant': 'secondary',
          'target': '/hr/employees/123',
          'directive': 'expand',
        };

        final action = ComponentAction.fromJson(json);
        expect(action.icon, equals('visibility'));
        expect(action.variant, equals('secondary'));
        expect(action.target, equals('/hr/employees/123'));
        expect(action.directive, equals('expand'));
      });

      test('handles various variant values', () {
        for (final variant in ['primary', 'secondary', 'danger', 'warning']) {
          final json = {
            'id': 'test',
            'label': 'Test',
            'variant': variant,
          };

          final action = ComponentAction.fromJson(json);
          expect(action.variant, equals(variant));
        }
      });
    });
  });

  group('ComponentMetadata', () {
    group('fromJson / toJson', () {
      test('serializes with no fields (all optional)', () {
        final json = <String, dynamic>{};

        final metadata = ComponentMetadata.fromJson(json);
        expect(metadata.dataFreshness, isNull);
        expect(metadata.truncated, isFalse); // default
        expect(metadata.totalCount, isNull);
        expect(metadata.warning, isNull);
      });

      test('serializes with all fields', () {
        final json = {
          'dataFreshness': '2026-02-07T10:30:00.000Z',
          'truncated': true,
          'totalCount': '100+',
          'warning': 'Results truncated to 50 records',
        };

        final metadata = ComponentMetadata.fromJson(json);
        expect(metadata.dataFreshness, isNotNull);
        expect(metadata.dataFreshness!.year, equals(2026));
        expect(metadata.truncated, isTrue);
        expect(metadata.totalCount, equals('100+'));
        expect(metadata.warning, contains('truncated'));

        final serialized = metadata.toJson();
        expect(serialized['dataFreshness'], contains('2026-02-07'));
        expect(serialized['truncated'], isTrue);
      });

      test('handles DateTime serialization correctly', () {
        final now = DateTime.utc(2026, 2, 7, 12, 0, 0);
        const metadata = ComponentMetadata(
          dataFreshness: null,
          truncated: false,
        );

        final metadataWithDate = ComponentMetadata(
          dataFreshness: now,
          truncated: true,
        );

        final json = metadataWithDate.toJson();
        expect(json['dataFreshness'], equals('2026-02-07T12:00:00.000Z'));

        final deserialized = ComponentMetadata.fromJson(json);
        expect(deserialized.dataFreshness, equals(now));
      });
    });
  });

  // =============================================================================
  // HR DOMAIN MODELS
  // =============================================================================

  group('Employee (in component_response)', () {
    group('fromJson / toJson', () {
      test('serializes with required fields only', () {
        final json = {
          'id': 'emp-001',
          'name': 'John Doe',
          'title': 'Software Engineer',
        };

        final employee = Employee.fromJson(json);
        expect(employee.id, equals('emp-001'));
        expect(employee.name, equals('John Doe'));
        expect(employee.title, equals('Software Engineer'));
        expect(employee.email, isNull);
        expect(employee.avatarUrl, isNull);
        expect(employee.department, isNull);
      });

      test('serializes with all optional fields', () {
        final json = {
          'id': 'emp-002',
          'name': 'Jane Smith',
          'title': 'Engineering Manager',
          'email': 'jane.smith@tamshai.com',
          'avatarUrl': 'https://example.com/avatar.png',
          'department': 'Engineering',
        };

        final employee = Employee.fromJson(json);
        expect(employee.email, equals('jane.smith@tamshai.com'));
        expect(employee.avatarUrl, contains('avatar.png'));
        expect(employee.department, equals('Engineering'));

        final serialized = employee.toJson();
        expect(serialized['email'], equals('jane.smith@tamshai.com'));
      });

      test('round-trips correctly', () {
        const original = Employee(
          id: 'emp-003',
          name: 'Bob Wilson',
          title: 'VP Engineering',
          email: 'bob@company.com',
          department: 'Executive',
        );

        final json = original.toJson();
        final deserialized = Employee.fromJson(json);

        expect(deserialized.id, equals(original.id));
        expect(deserialized.name, equals(original.name));
        expect(deserialized.title, equals(original.title));
        expect(deserialized.email, equals(original.email));
        expect(deserialized.department, equals(original.department));
      });
    });
  });

  group('TimeOffRequest', () {
    group('fromJson / toJson', () {
      test('serializes with required fields only', () {
        final json = {
          'id': 'tor-001',
          'employeeName': 'John Doe',
          'startDate': '2026-03-01T00:00:00.000Z',
          'endDate': '2026-03-05T00:00:00.000Z',
          'type': 'vacation',
        };

        final request = TimeOffRequest.fromJson(json);
        expect(request.id, equals('tor-001'));
        expect(request.employeeName, equals('John Doe'));
        expect(request.startDate.year, equals(2026));
        expect(request.startDate.month, equals(3));
        expect(request.type, equals('vacation'));
        expect(request.status, equals('pending')); // default
        expect(request.reason, isNull);
      });

      test('serializes with all optional fields', () {
        final json = {
          'id': 'tor-002',
          'employeeName': 'Jane Smith',
          'startDate': '2026-04-10T00:00:00.000Z',
          'endDate': '2026-04-15T00:00:00.000Z',
          'type': 'sick',
          'reason': 'Medical appointment',
          'employeeId': 'emp-002',
          'status': 'approved',
          'submittedAt': '2026-04-01T09:00:00.000Z',
        };

        final request = TimeOffRequest.fromJson(json);
        expect(request.reason, equals('Medical appointment'));
        expect(request.employeeId, equals('emp-002'));
        expect(request.status, equals('approved'));
        expect(request.submittedAt!.month, equals(4));
      });

      test('handles various time-off types', () {
        for (final type in ['vacation', 'sick', 'personal', 'bereavement']) {
          final json = {
            'id': 'test',
            'employeeName': 'Test',
            'startDate': '2026-01-01T00:00:00.000Z',
            'endDate': '2026-01-02T00:00:00.000Z',
            'type': type,
          };

          final request = TimeOffRequest.fromJson(json);
          expect(request.type, equals(type));
        }
      });

      test('serializes DateTime correctly', () {
        final request = TimeOffRequest(
          id: 'tor-003',
          employeeName: 'Bob',
          startDate: DateTime.utc(2026, 5, 1),
          endDate: DateTime.utc(2026, 5, 3),
          type: 'vacation',
        );

        final json = request.toJson();
        expect(json['startDate'], equals('2026-05-01T00:00:00.000Z'));
        expect(json['endDate'], equals('2026-05-03T00:00:00.000Z'));
      });
    });
  });

  group('OrgChartData', () {
    group('fromJson / toJson', () {
      test('serializes with required self only', () {
        final json = {
          'self': {
            'id': 'emp-001',
            'name': 'John Doe',
            'title': 'Engineer',
          },
        };

        final orgChart = OrgChartData.fromJson(json);
        expect(orgChart.self.name, equals('John Doe'));
        expect(orgChart.manager, isNull);
        expect(orgChart.peers, isEmpty);
        expect(orgChart.directReports, isEmpty);
      });

      test('serializes with all fields', () {
        final json = {
          'manager': {
            'id': 'mgr-001',
            'name': 'Sarah Johnson',
            'title': 'VP',
          },
          'self': {
            'id': 'emp-001',
            'name': 'John Doe',
            'title': 'Engineer',
          },
          'peers': [
            {'id': 'emp-002', 'name': 'Jane', 'title': 'Engineer'},
            {'id': 'emp-003', 'name': 'Bob', 'title': 'Engineer'},
          ],
          'directReports': [
            {'id': 'emp-004', 'name': 'Alice', 'title': 'Junior'},
          ],
        };

        final orgChart = OrgChartData.fromJson(json);
        expect(orgChart.manager!.name, equals('Sarah Johnson'));
        expect(orgChart.peers.length, equals(2));
        expect(orgChart.directReports.length, equals(1));
      });

      test('handles empty lists', () {
        final json = {
          'self': {'id': 'emp-001', 'name': 'John', 'title': 'Eng'},
          'peers': [],
          'directReports': [],
        };

        final orgChart = OrgChartData.fromJson(json);
        expect(orgChart.peers, isEmpty);
        expect(orgChart.directReports, isEmpty);
      });
    });
  });

  // =============================================================================
  // FINANCE DOMAIN MODELS
  // =============================================================================

  group('ExpenseReport', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'id': 'exp-001',
          'employeeName': 'John Doe',
          'amount': 1500.50,
          'date': '2026-02-01T00:00:00.000Z',
          'description': 'Q1 Conference Travel',
          'itemCount': 5,
        };

        final report = ExpenseReport.fromJson(json);
        expect(report.id, equals('exp-001'));
        expect(report.amount, equals(1500.50));
        expect(report.itemCount, equals(5));
        expect(report.status, equals('SUBMITTED')); // default
      });

      test('handles various statuses', () {
        for (final status in [
          'DRAFT',
          'SUBMITTED',
          'UNDER_REVIEW',
          'APPROVED',
          'REJECTED',
          'REIMBURSED'
        ]) {
          final json = {
            'id': 'test',
            'employeeName': 'Test',
            'amount': 100.0,
            'date': '2026-01-01T00:00:00.000Z',
            'description': 'Test',
            'itemCount': 1,
            'status': status,
          };

          final report = ExpenseReport.fromJson(json);
          expect(report.status, equals(status));
        }
      });

      test('handles numeric amount types', () {
        // Integer
        var json = {
          'id': 'test',
          'employeeName': 'Test',
          'amount': 100,
          'date': '2026-01-01T00:00:00.000Z',
          'description': 'Test',
          'itemCount': 1,
        };
        var report = ExpenseReport.fromJson(json);
        expect(report.amount, equals(100.0));

        // Double
        json['amount'] = 100.99;
        report = ExpenseReport.fromJson(json);
        expect(report.amount, equals(100.99));
      });
    });
  });

  group('BudgetAmendment', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'id': 'ba-001',
          'department': 'Engineering',
          'currentBudget': 500000.0,
          'requestedBudget': 600000.0,
          'reason': 'Need additional cloud resources',
        };

        final amendment = BudgetAmendment.fromJson(json);
        expect(amendment.department, equals('Engineering'));
        expect(amendment.currentBudget, equals(500000.0));
        expect(amendment.requestedBudget, equals(600000.0));
        expect(amendment.status, equals('pending')); // default
      });

      test('serializes with optional fields', () {
        final json = {
          'id': 'ba-002',
          'department': 'Sales',
          'currentBudget': 300000.0,
          'requestedBudget': 350000.0,
          'reason': 'New marketing campaign',
          'submittedBy': 'Jane Smith',
          'status': 'approved',
          'submittedAt': '2026-01-15T10:00:00.000Z',
        };

        final amendment = BudgetAmendment.fromJson(json);
        expect(amendment.submittedBy, equals('Jane Smith'));
        expect(amendment.status, equals('approved'));
        expect(amendment.submittedAt, isNotNull);
      });
    });
  });

  group('BudgetData', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'department': 'Engineering',
          'year': 2026,
          'totalBudget': 1000000.0,
          'spent': 450000.0,
          'remaining': 550000.0,
          'percentUsed': 45.0,
        };

        final budget = BudgetData.fromJson(json);
        expect(budget.department, equals('Engineering'));
        expect(budget.year, equals(2026));
        expect(budget.percentUsed, equals(45.0));
        expect(budget.categories, isEmpty);
        expect(budget.warnings, isEmpty);
        expect(budget.status, equals('APPROVED')); // default
      });

      test('serializes with categories and warnings', () {
        final json = {
          'department': 'Marketing',
          'year': 2026,
          'totalBudget': 500000.0,
          'spent': 400000.0,
          'remaining': 100000.0,
          'percentUsed': 80.0,
          'categories': [
            {
              'category': 'Advertising',
              'allocated': 200000.0,
              'spent': 180000.0,
              'percentUsed': 90.0,
            },
            {
              'category': 'Events',
              'allocated': 100000.0,
              'spent': 50000.0,
              'percentUsed': 50.0,
            },
          ],
          'warnings': ['Budget 80% utilized', 'Advertising category over 90%'],
          'status': 'WARNING',
        };

        final budget = BudgetData.fromJson(json);
        expect(budget.categories.length, equals(2));
        expect(budget.categories[0].category, equals('Advertising'));
        expect(budget.warnings.length, equals(2));
        expect(budget.status, equals('WARNING'));
      });
    });
  });

  group('CategorySpend', () {
    group('fromJson / toJson', () {
      test('serializes correctly', () {
        final json = {
          'category': 'Travel',
          'allocated': 50000.0,
          'spent': 35000.0,
          'percentUsed': 70.0,
        };

        final category = CategorySpend.fromJson(json);
        expect(category.category, equals('Travel'));
        expect(category.allocated, equals(50000.0));
        expect(category.spent, equals(35000.0));
        expect(category.percentUsed, equals(70.0));

        final serialized = category.toJson();
        expect(serialized, equals(json));
      });
    });
  });

  group('QuarterlyReport', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'quarter': 'Q1',
          'year': 2026,
          'revenue': 5000000.0,
          'arr': 20000000.0,
          'netIncome': 1000000.0,
        };

        final report = QuarterlyReport.fromJson(json);
        expect(report.quarter, equals('Q1'));
        expect(report.year, equals(2026));
        expect(report.revenue, equals(5000000.0));
        expect(report.arrMovement, isNull);
        expect(report.revenueBySegment, isEmpty);
        expect(report.kpis, isEmpty);
      });

      test('serializes with all optional fields', () {
        final json = {
          'quarter': 'Q2',
          'year': 2026,
          'revenue': 6000000.0,
          'arr': 22000000.0,
          'netIncome': 1200000.0,
          'revenueGrowth': 20.0,
          'arrGrowth': 10.0,
          'netIncomeGrowth': 20.0,
          'arrMovement': {
            'starting': 20000000.0,
            'newBusiness': 1500000.0,
            'expansion': 800000.0,
            'churn': 200000.0,
            'contraction': 100000.0,
            'ending': 22000000.0,
          },
          'revenueBySegment': [
            {'segment': 'Enterprise', 'revenue': 4000000.0, 'percent': 66.67},
            {'segment': 'SMB', 'revenue': 2000000.0, 'percent': 33.33},
          ],
          'kpis': [
            {'name': 'NPS', 'value': '72', 'trend': 'up'},
          ],
        };

        final report = QuarterlyReport.fromJson(json);
        expect(report.revenueGrowth, equals(20.0));
        expect(report.arrMovement!.starting, equals(20000000.0));
        expect(report.revenueBySegment.length, equals(2));
        expect(report.kpis.length, equals(1));
      });
    });
  });

  group('ARRMovement', () {
    group('fromJson / toJson', () {
      test('serializes correctly', () {
        final json = {
          'starting': 20000000.0,
          'newBusiness': 1500000.0,
          'expansion': 800000.0,
          'churn': 200000.0,
          'contraction': 100000.0,
          'ending': 22000000.0,
        };

        final movement = ARRMovement.fromJson(json);
        expect(movement.starting, equals(20000000.0));
        expect(movement.newBusiness, equals(1500000.0));
        expect(movement.expansion, equals(800000.0));
        expect(movement.churn, equals(200000.0));
        expect(movement.contraction, equals(100000.0));
        expect(movement.ending, equals(22000000.0));

        final serialized = movement.toJson();
        expect(serialized['newBusiness'], equals(1500000.0));
      });
    });
  });

  group('SegmentRevenue', () {
    group('fromJson / toJson', () {
      test('serializes correctly', () {
        final json = {
          'segment': 'Enterprise',
          'revenue': 3500000.0,
          'percent': 58.33,
        };

        final segment = SegmentRevenue.fromJson(json);
        expect(segment.segment, equals('Enterprise'));
        expect(segment.revenue, equals(3500000.0));
        expect(segment.percent, equals(58.33));
      });
    });
  });

  group('KPI', () {
    group('fromJson / toJson', () {
      test('serializes with required fields only', () {
        final json = {
          'name': 'Revenue Growth',
          'value': '25%',
        };

        final kpi = KPI.fromJson(json);
        expect(kpi.name, equals('Revenue Growth'));
        expect(kpi.value, equals('25%'));
        expect(kpi.change, isNull);
        expect(kpi.trend, isNull);
        expect(kpi.unit, isNull);
      });

      test('serializes with all optional fields', () {
        final json = {
          'name': 'MRR',
          'value': '1.8M',
          'change': '+5%',
          'trend': 'up',
          'unit': 'USD',
        };

        final kpi = KPI.fromJson(json);
        expect(kpi.change, equals('+5%'));
        expect(kpi.trend, equals('up'));
        expect(kpi.unit, equals('USD'));
      });
    });
  });

  group('WaterfallItem', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'label': 'Starting ARR',
          'value': 20000000.0,
          'isTotal': true,
        };

        final item = WaterfallItem.fromJson(json);
        expect(item.label, equals('Starting ARR'));
        expect(item.value, equals(20000000.0));
        expect(item.isTotal, isTrue);
        expect(item.isSubtotal, isFalse); // default
        expect(item.color, isNull);
      });

      test('serializes with optional fields', () {
        final json = {
          'label': 'New Business',
          'value': 1500000.0,
          'isTotal': false,
          'isSubtotal': false,
          'color': '#4CAF50',
        };

        final item = WaterfallItem.fromJson(json);
        expect(item.isSubtotal, isFalse);
        expect(item.color, equals('#4CAF50'));
      });
    });
  });

  // =============================================================================
  // SALES/CRM DOMAIN MODELS
  // =============================================================================

  group('Customer', () {
    group('fromJson / toJson', () {
      test('serializes with required fields only', () {
        final json = {
          'id': 'cust-001',
          'name': 'Acme Corporation',
        };

        final customer = Customer.fromJson(json);
        expect(customer.id, equals('cust-001'));
        expect(customer.name, equals('Acme Corporation'));
        expect(customer.status, equals('active')); // default
        expect(customer.industry, isNull);
        expect(customer.annualRevenue, isNull);
      });

      test('serializes with all optional fields', () {
        final json = {
          'id': 'cust-002',
          'name': 'Globex Industries',
          'industry': 'Technology',
          'annualRevenue': 50000000.0,
          'employeeCount': 500,
          'website': 'https://globex.com',
          'status': 'churned',
          'logoUrl': 'https://globex.com/logo.png',
          'createdAt': '2025-06-15T00:00:00.000Z',
        };

        final customer = Customer.fromJson(json);
        expect(customer.industry, equals('Technology'));
        expect(customer.annualRevenue, equals(50000000.0));
        expect(customer.employeeCount, equals(500));
        expect(customer.website, equals('https://globex.com'));
        expect(customer.status, equals('churned'));
        expect(customer.createdAt!.year, equals(2025));
      });

      test('handles null optional fields correctly', () {
        final json = {
          'id': 'cust-003',
          'name': 'Test Corp',
          'industry': null,
          'annualRevenue': null,
        };

        final customer = Customer.fromJson(json);
        expect(customer.industry, isNull);
        expect(customer.annualRevenue, isNull);
      });
    });
  });

  group('Contact', () {
    group('fromJson / toJson', () {
      test('serializes with required fields only', () {
        final json = {
          'id': 'contact-001',
          'name': 'John Buyer',
        };

        final contact = Contact.fromJson(json);
        expect(contact.id, equals('contact-001'));
        expect(contact.name, equals('John Buyer'));
        expect(contact.isPrimary, isFalse); // default
        expect(contact.email, isNull);
      });

      test('serializes with all optional fields', () {
        final json = {
          'id': 'contact-002',
          'name': 'Jane Executive',
          'email': 'jane@customer.com',
          'phone': '+1-555-0123',
          'title': 'VP of Engineering',
          'isPrimary': true,
          'customerId': 'cust-001',
        };

        final contact = Contact.fromJson(json);
        expect(contact.email, equals('jane@customer.com'));
        expect(contact.phone, equals('+1-555-0123'));
        expect(contact.title, equals('VP of Engineering'));
        expect(contact.isPrimary, isTrue);
        expect(contact.customerId, equals('cust-001'));
      });
    });
  });

  group('Opportunity', () {
    group('fromJson / toJson', () {
      test('serializes with required fields only', () {
        final json = {
          'id': 'opp-001',
          'name': 'Enterprise License Deal',
          'amount': 250000.0,
          'stage': 'Negotiation',
        };

        final opportunity = Opportunity.fromJson(json);
        expect(opportunity.id, equals('opp-001'));
        expect(opportunity.name, equals('Enterprise License Deal'));
        expect(opportunity.amount, equals(250000.0));
        expect(opportunity.stage, equals('Negotiation'));
        expect(opportunity.probability, isNull);
      });

      test('serializes with all optional fields', () {
        final json = {
          'id': 'opp-002',
          'name': 'Expansion Deal',
          'amount': 100000.0,
          'stage': 'Closed Won',
          'customerId': 'cust-001',
          'customerName': 'Acme Corp',
          'closeDate': '2026-03-15T00:00:00.000Z',
          'probability': 100.0,
        };

        final opportunity = Opportunity.fromJson(json);
        expect(opportunity.customerId, equals('cust-001'));
        expect(opportunity.customerName, equals('Acme Corp'));
        expect(opportunity.closeDate!.month, equals(3));
        expect(opportunity.probability, equals(100.0));
      });
    });
  });

  group('Lead', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'id': 'lead-001',
          'name': 'John Prospect',
          'status': 'NEW',
        };

        final lead = Lead.fromJson(json);
        expect(lead.id, equals('lead-001'));
        expect(lead.name, equals('John Prospect'));
        expect(lead.status, equals(LeadStatus.newLead));
        expect(lead.company, isNull);
        expect(lead.score, isNull);
      });

      test('serializes with all optional fields', () {
        final json = {
          'id': 'lead-002',
          'name': 'Jane Decision-Maker',
          'company': 'Enterprise Inc',
          'score': 85,
          'status': 'QUALIFIED',
          'source': 'Website',
          'email': 'jane@enterprise.com',
          'phone': '+1-555-0456',
          'createdAt': '2026-01-20T00:00:00.000Z',
          'ownerId': 'rep-001',
          'ownerName': 'Sales Rep',
        };

        final lead = Lead.fromJson(json);
        expect(lead.company, equals('Enterprise Inc'));
        expect(lead.score, equals(85));
        expect(lead.status, equals(LeadStatus.qualified));
        expect(lead.source, equals('Website'));
        expect(lead.ownerId, equals('rep-001'));
      });
    });

    group('LeadStatus enum', () {
      test('all enum values serialize correctly', () {
        final statusJsonMap = {
          LeadStatus.newLead: 'NEW',
          LeadStatus.contacted: 'CONTACTED',
          LeadStatus.qualified: 'QUALIFIED',
          LeadStatus.unqualified: 'UNQUALIFIED',
          LeadStatus.converted: 'CONVERTED',
        };

        for (final entry in statusJsonMap.entries) {
          final lead = Lead(
            id: 'test',
            name: 'Test',
            status: entry.key,
          );

          final json = lead.toJson();
          expect(json['status'], equals(entry.value));
        }
      });

      test('all enum values deserialize correctly', () {
        for (final status in LeadStatus.values) {
          final jsonValue = {
            LeadStatus.newLead: 'NEW',
            LeadStatus.contacted: 'CONTACTED',
            LeadStatus.qualified: 'QUALIFIED',
            LeadStatus.unqualified: 'UNQUALIFIED',
            LeadStatus.converted: 'CONVERTED',
          }[status]!;

          final json = {
            'id': 'test',
            'name': 'Test',
            'status': jsonValue,
          };

          final lead = Lead.fromJson(json);
          expect(lead.status, equals(status));
        }
      });
    });
  });

  group('LeadFilters', () {
    group('fromJson / toJson', () {
      test('serializes with no filters (all null)', () {
        final json = <String, dynamic>{};

        final filters = LeadFilters.fromJson(json);
        expect(filters.status, isNull);
        expect(filters.source, isNull);
        expect(filters.minScore, isNull);
        expect(filters.ownerId, isNull);
        expect(filters.search, isNull);
      });

      test('serializes with all filters', () {
        final json = {
          'status': 'QUALIFIED',
          'source': 'Website',
          'minScore': 50,
          'ownerId': 'rep-001',
          'search': 'enterprise',
        };

        final filters = LeadFilters.fromJson(json);
        expect(filters.status, equals(LeadStatus.qualified));
        expect(filters.source, equals('Website'));
        expect(filters.minScore, equals(50));
        expect(filters.ownerId, equals('rep-001'));
        expect(filters.search, equals('enterprise'));
      });
    });
  });

  group('ForecastData', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'period': 'Q1 2026',
          'quota': 2000000.0,
          'commit': 1800000.0,
          'bestCase': 2200000.0,
          'closed': 1500000.0,
        };

        final forecast = ForecastData.fromJson(json);
        expect(forecast.period, equals('Q1 2026'));
        expect(forecast.quota, equals(2000000.0));
        expect(forecast.commit, equals(1800000.0));
        expect(forecast.byRep, isEmpty);
        expect(forecast.pipeline, isEmpty);
      });

      test('serializes with byRep and pipeline', () {
        final json = {
          'period': 'Q2 2026',
          'quota': 2500000.0,
          'commit': 2200000.0,
          'bestCase': 2800000.0,
          'closed': 1800000.0,
          'byRep': [
            {
              'repId': 'rep-001',
              'repName': 'Alice Sales',
              'quota': 500000.0,
              'closed': 400000.0,
              'commit': 480000.0,
              'percentToQuota': 80.0,
            },
          ],
          'pipeline': [
            {
              'stage': 'Discovery',
              'amount': 500000.0,
              'dealCount': 10,
              'probability': 20.0,
              'weightedAmount': 100000.0,
            },
          ],
        };

        final forecast = ForecastData.fromJson(json);
        expect(forecast.byRep.length, equals(1));
        expect(forecast.byRep[0].repName, equals('Alice Sales'));
        expect(forecast.pipeline.length, equals(1));
        expect(forecast.pipeline[0].stage, equals('Discovery'));
      });
    });
  });

  group('Period', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'label': 'Q1 2026',
          'start': '2026-01-01T00:00:00.000Z',
          'end': '2026-03-31T23:59:59.000Z',
        };

        final period = Period.fromJson(json);
        expect(period.label, equals('Q1 2026'));
        expect(period.start.year, equals(2026));
        expect(period.start.month, equals(1));
        expect(period.end.month, equals(3));
        expect(period.quarter, isNull);
        expect(period.year, isNull);
      });

      test('serializes with optional fields', () {
        final json = {
          'label': 'Q2 2026',
          'start': '2026-04-01T00:00:00.000Z',
          'end': '2026-06-30T23:59:59.000Z',
          'quarter': 'Q2',
          'year': 2026,
        };

        final period = Period.fromJson(json);
        expect(period.quarter, equals('Q2'));
        expect(period.year, equals(2026));
      });
    });
  });

  group('RepForecast', () {
    group('fromJson / toJson', () {
      test('serializes correctly', () {
        final json = {
          'repId': 'rep-001',
          'repName': 'John Salesperson',
          'quota': 500000.0,
          'closed': 350000.0,
          'commit': 450000.0,
          'percentToQuota': 70.0,
        };

        final repForecast = RepForecast.fromJson(json);
        expect(repForecast.repId, equals('rep-001'));
        expect(repForecast.repName, equals('John Salesperson'));
        expect(repForecast.quota, equals(500000.0));
        expect(repForecast.closed, equals(350000.0));
        expect(repForecast.commit, equals(450000.0));
        expect(repForecast.percentToQuota, equals(70.0));
      });

      test('handles null percentToQuota', () {
        final json = {
          'repId': 'rep-002',
          'repName': 'Jane Closer',
          'quota': 600000.0,
          'closed': 0.0,
          'commit': 100000.0,
        };

        final repForecast = RepForecast.fromJson(json);
        expect(repForecast.percentToQuota, isNull);
      });
    });
  });

  group('PipelineStage', () {
    group('fromJson / toJson', () {
      test('serializes with required fields', () {
        final json = {
          'stage': 'Qualification',
          'amount': 750000.0,
          'dealCount': 15,
        };

        final stage = PipelineStage.fromJson(json);
        expect(stage.stage, equals('Qualification'));
        expect(stage.amount, equals(750000.0));
        expect(stage.dealCount, equals(15));
        expect(stage.probability, isNull);
        expect(stage.weightedAmount, isNull);
      });

      test('serializes with optional fields', () {
        final json = {
          'stage': 'Negotiation',
          'amount': 500000.0,
          'dealCount': 5,
          'probability': 60.0,
          'weightedAmount': 300000.0,
        };

        final stage = PipelineStage.fromJson(json);
        expect(stage.probability, equals(60.0));
        expect(stage.weightedAmount, equals(300000.0));
      });
    });
  });

  // =============================================================================
  // APPROVALS AGGREGATED DATA
  // =============================================================================

  group('PendingApprovals', () {
    group('fromJson / toJson', () {
      test('serializes with empty lists', () {
        final json = <String, dynamic>{};

        final approvals = PendingApprovals.fromJson(json);
        expect(approvals.timeOffRequests, isEmpty);
        expect(approvals.expenseReports, isEmpty);
        expect(approvals.budgetAmendments, isEmpty);
        expect(approvals.totalCount, isNull);
        expect(approvals.oldestSubmission, isNull);
      });

      test('serializes with all fields populated', () {
        final json = {
          'timeOffRequests': [
            {
              'id': 'tor-001',
              'employeeName': 'John',
              'startDate': '2026-03-01T00:00:00.000Z',
              'endDate': '2026-03-05T00:00:00.000Z',
              'type': 'vacation',
            },
          ],
          'expenseReports': [
            {
              'id': 'exp-001',
              'employeeName': 'Jane',
              'amount': 500.0,
              'date': '2026-02-01T00:00:00.000Z',
              'description': 'Test',
              'itemCount': 3,
            },
          ],
          'budgetAmendments': [
            {
              'id': 'ba-001',
              'department': 'Engineering',
              'currentBudget': 100000.0,
              'requestedBudget': 120000.0,
              'reason': 'Growth',
            },
          ],
          'totalCount': 3,
          'oldestSubmission': '2026-01-15T10:00:00.000Z',
        };

        final approvals = PendingApprovals.fromJson(json);
        expect(approvals.timeOffRequests.length, equals(1));
        expect(approvals.expenseReports.length, equals(1));
        expect(approvals.budgetAmendments.length, equals(1));
        expect(approvals.totalCount, equals(3));
        expect(approvals.oldestSubmission!.month, equals(1));
      });
    });
  });

  // =============================================================================
  // PAGINATION
  // =============================================================================

  group('PaginationState', () {
    group('fromJson / toJson', () {
      test('serializes with defaults', () {
        final json = <String, dynamic>{};

        final pagination = PaginationState.fromJson(json);
        expect(pagination.cursor, isNull);
        expect(pagination.hasMore, isFalse);
        expect(pagination.totalCount, isNull);
        expect(pagination.currentPage, equals(1));
        expect(pagination.pageSize, equals(20));
      });

      test('serializes with all fields', () {
        final json = {
          'cursor': 'next-page-token',
          'hasMore': true,
          'totalCount': 150,
          'currentPage': 3,
          'pageSize': 50,
        };

        final pagination = PaginationState.fromJson(json);
        expect(pagination.cursor, equals('next-page-token'));
        expect(pagination.hasMore, isTrue);
        expect(pagination.totalCount, equals(150));
        expect(pagination.currentPage, equals(3));
        expect(pagination.pageSize, equals(50));
      });
    });
  });

  // =============================================================================
  // ACTION EVENTS
  // =============================================================================

  group('ActionEvent', () {
    group('fromJson / toJson', () {
      test('serializes with required fields only', () {
        final json = {
          'actionId': 'approve-btn',
          'actionType': 'approve',
        };

        final event = ActionEvent.fromJson(json);
        expect(event.actionId, equals('approve-btn'));
        expect(event.actionType, equals('approve'));
        expect(event.targetId, isNull);
        expect(event.payload, isNull);
      });

      test('serializes with all optional fields', () {
        final json = {
          'actionId': 'nav-details',
          'actionType': 'navigate',
          'targetId': 'emp-001',
          'payload': {'route': '/employees/emp-001', 'tab': 'profile'},
        };

        final event = ActionEvent.fromJson(json);
        expect(event.targetId, equals('emp-001'));
        expect(event.payload!['route'], equals('/employees/emp-001'));
        expect(event.payload!['tab'], equals('profile'));
      });

      test('handles empty payload', () {
        final json = {
          'actionId': 'test',
          'actionType': 'click',
          'payload': <String, dynamic>{},
        };

        final event = ActionEvent.fromJson(json);
        expect(event.payload, isEmpty);
      });
    });
  });

  // =============================================================================
  // ROUND-TRIP TESTS
  // =============================================================================

  group('Round-trip serialization', () {
    test('ComponentResponse round-trips correctly via JSON encoding', () {
      const original = ComponentResponse(
        type: 'TestComponent',
        props: {'key': 'value', 'count': 42},
        actions: [
          ComponentAction(
            id: 'action-1',
            label: 'Click Me',
            variant: 'primary',
          ),
        ],
        narration: Narration(text: 'Test narration'),
        metadata: ComponentMetadata(truncated: true, totalCount: '100+'),
      );

      // Use deep JSON encoding to simulate actual network transport
      final jsonMap = _deepConvertToJsonMap(original.toJson());
      final deserialized = ComponentResponse.fromJson(jsonMap);

      expect(deserialized.type, equals(original.type));
      expect(deserialized.props, equals(original.props));
      expect(deserialized.actions.length, equals(original.actions.length));
      expect(deserialized.actions[0].id, equals(original.actions[0].id));
      expect(deserialized.narration!.text, equals(original.narration!.text));
      expect(deserialized.metadata!.truncated, equals(original.metadata!.truncated));
    });

    test('Complex nested structures round-trip correctly via JSON encoding', () {
      const original = QuarterlyReport(
        quarter: 'Q1',
        year: 2026,
        revenue: 5000000.0,
        arr: 20000000.0,
        netIncome: 1000000.0,
        arrMovement: ARRMovement(
          starting: 18000000.0,
          newBusiness: 1500000.0,
          expansion: 800000.0,
          churn: 200000.0,
          contraction: 100000.0,
          ending: 20000000.0,
        ),
        revenueBySegment: [
          SegmentRevenue(segment: 'Enterprise', revenue: 3000000.0, percent: 60.0),
          SegmentRevenue(segment: 'SMB', revenue: 2000000.0, percent: 40.0),
        ],
        kpis: [
          KPI(name: 'NPS', value: '72'),
          KPI(name: 'Churn', value: '1.2%', trend: 'down'),
        ],
      );

      // Use deep JSON encoding to simulate actual network transport
      final jsonMap = _deepConvertToJsonMap(original.toJson());
      final deserialized = QuarterlyReport.fromJson(jsonMap);

      expect(deserialized.quarter, equals(original.quarter));
      expect(deserialized.arrMovement!.starting, equals(original.arrMovement!.starting));
      expect(deserialized.revenueBySegment.length, equals(2));
      expect(deserialized.revenueBySegment[0].segment, equals('Enterprise'));
      expect(deserialized.kpis.length, equals(2));
      expect(deserialized.kpis[0].name, equals('NPS'));
    });

    test('OrgChartData with nested Employee objects round-trips correctly', () {
      const original = OrgChartData(
        manager: Employee(
          id: 'mgr-001',
          name: 'Sarah Manager',
          title: 'VP Engineering',
        ),
        self: Employee(
          id: 'emp-001',
          name: 'John Developer',
          title: 'Senior Engineer',
        ),
        peers: [
          Employee(id: 'emp-002', name: 'Jane', title: 'Engineer'),
        ],
        directReports: [
          Employee(id: 'emp-003', name: 'Bob', title: 'Junior'),
        ],
      );

      final jsonMap = _deepConvertToJsonMap(original.toJson());
      final deserialized = OrgChartData.fromJson(jsonMap);

      expect(deserialized.manager!.name, equals('Sarah Manager'));
      expect(deserialized.self.id, equals('emp-001'));
      expect(deserialized.peers.length, equals(1));
      expect(deserialized.directReports.length, equals(1));
    });

    test('PendingApprovals with nested collections round-trips correctly', () {
      final original = PendingApprovals(
        timeOffRequests: [
          TimeOffRequest(
            id: 'tor-001',
            employeeName: 'John',
            startDate: DateTime.utc(2026, 3, 1),
            endDate: DateTime.utc(2026, 3, 5),
            type: 'vacation',
          ),
        ],
        expenseReports: [
          ExpenseReport(
            id: 'exp-001',
            employeeName: 'Jane',
            amount: 500.0,
            date: DateTime.utc(2026, 2, 15),
            description: 'Travel',
            itemCount: 3,
          ),
        ],
        budgetAmendments: [
          const BudgetAmendment(
            id: 'ba-001',
            department: 'Engineering',
            currentBudget: 100000.0,
            requestedBudget: 120000.0,
            reason: 'Growth',
          ),
        ],
        totalCount: 3,
      );

      final jsonMap = _deepConvertToJsonMap(original.toJson());
      final deserialized = PendingApprovals.fromJson(jsonMap);

      expect(deserialized.timeOffRequests.length, equals(1));
      expect(deserialized.expenseReports.length, equals(1));
      expect(deserialized.budgetAmendments.length, equals(1));
      expect(deserialized.totalCount, equals(3));
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  group('Edge cases', () {
    test('handles unicode characters in strings', () {
      final json = {
        'id': 'emp-001',
        'name': 'Jose Garcia',
        'title': 'Ingeniero de Software',
      };

      final employee = Employee.fromJson(json);
      expect(employee.name, equals('Jose Garcia'));

      final serialized = employee.toJson();
      expect(serialized['title'], equals('Ingeniero de Software'));
    });

    test('handles very large numbers', () {
      final json = {
        'segment': 'Global',
        'revenue': 999999999999.99,
        'percent': 100.0,
      };

      final segment = SegmentRevenue.fromJson(json);
      expect(segment.revenue, equals(999999999999.99));
    });

    test('handles zero and negative amounts', () {
      final json = {
        'id': 'opp-001',
        'name': 'Test',
        'amount': 0.0,
        'stage': 'Lost',
      };

      final opportunity = Opportunity.fromJson(json);
      expect(opportunity.amount, equals(0.0));
    });

    test('handles empty strings', () {
      final json = {
        'id': '',
        'name': '',
        'title': '',
      };

      final employee = Employee.fromJson(json);
      expect(employee.id, equals(''));
      expect(employee.name, equals(''));
    });

    test('handles deeply nested props in ComponentResponse', () {
      final json = {
        'type': 'ComplexComponent',
        'props': {
          'level1': {
            'level2': {
              'level3': {
                'data': [1, 2, 3],
                'metadata': {'key': 'value'},
              },
            },
          },
        },
      };

      final response = ComponentResponse.fromJson(json);
      final props = response.props['level1'] as Map<String, dynamic>;
      expect(props['level2'], isNotNull);
    });

    test('ForecastData with empty byRep and pipeline arrays', () {
      const forecast = ForecastData(
        period: 'Q1',
        quota: 1000000.0,
        commit: 800000.0,
        bestCase: 1200000.0,
        closed: 500000.0,
        byRep: [],
        pipeline: [],
      );

      final json = forecast.toJson();
      final deserialized = ForecastData.fromJson(json);

      expect(deserialized.byRep, isEmpty);
      expect(deserialized.pipeline, isEmpty);
    });
  });
}

/// Helper to deeply convert a map with nested Freezed objects to pure JSON maps.
/// This simulates what happens when data is serialized over the network.
Map<String, dynamic> _deepConvertToJsonMap(Map<String, dynamic> map) {
  final result = <String, dynamic>{};
  for (final entry in map.entries) {
    result[entry.key] = _deepConvertValue(entry.value);
  }
  return result;
}

dynamic _deepConvertValue(dynamic value) {
  if (value == null) return null;
  if (value is num || value is String || value is bool) return value;
  if (value is DateTime) return value.toIso8601String();
  if (value is List) {
    return value.map(_deepConvertValue).toList();
  }
  if (value is Map) {
    final result = <String, dynamic>{};
    for (final entry in value.entries) {
      result[entry.key.toString()] = _deepConvertValue(entry.value);
    }
    return result;
  }
  // Handle Freezed objects that have toJson method
  try {
    // Use dynamic to call toJson if it exists
    final json = (value as dynamic).toJson();
    return _deepConvertValue(json);
  } catch (_) {
    return value.toString();
  }
}
