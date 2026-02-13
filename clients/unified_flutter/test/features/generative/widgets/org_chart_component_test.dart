import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/models/employee.dart';
import 'package:unified_flutter/features/generative/widgets/org_chart_component.dart';

void main() {
  // Test data
  final testManager = Employee(
    id: 'mgr-001',
    name: 'Sarah Johnson',
    title: 'VP of Engineering',
    email: 'sarah.johnson@tamshai.com',
    department: 'Engineering',
  );

  final testSelf = Employee(
    id: 'emp-001',
    name: 'John Doe',
    title: 'Senior Software Engineer',
    email: 'john.doe@tamshai.com',
    department: 'Engineering',
    managerId: 'mgr-001',
  );

  final testPeers = [
    const Employee(
      id: 'emp-002',
      name: 'Jane Smith',
      title: 'Senior Software Engineer',
      email: 'jane.smith@tamshai.com',
      department: 'Engineering',
      managerId: 'mgr-001',
    ),
    const Employee(
      id: 'emp-003',
      name: 'Bob Wilson',
      title: 'Software Engineer',
      email: 'bob.wilson@tamshai.com',
      department: 'Engineering',
      managerId: 'mgr-001',
    ),
  ];

  final testDirectReports = [
    const Employee(
      id: 'emp-004',
      name: 'Alice Chen',
      title: 'Junior Developer',
      email: 'alice.chen@tamshai.com',
      department: 'Engineering',
      managerId: 'emp-001',
    ),
    const Employee(
      id: 'emp-005',
      name: 'Marcus Brown',
      title: 'Junior Developer',
      email: 'marcus.brown@tamshai.com',
      department: 'Engineering',
      managerId: 'emp-001',
    ),
  ];

  Widget buildTestWidget({
    Employee? manager,
    required Employee self,
    List<Employee> peers = const [],
    List<Employee> directReports = const [],
    void Function(Employee)? onEmployeeClick,
    bool isLoading = false,
    String? errorMessage,
  }) {
    return MaterialApp(
      theme: ThemeData.light(useMaterial3: true),
      home: Scaffold(
        body: SingleChildScrollView(
          child: OrgChartComponent(
            manager: manager,
            self: self,
            peers: peers,
            directReports: directReports,
            onEmployeeClick: onEmployeeClick,
            isLoading: isLoading,
            errorMessage: errorMessage,
          ),
        ),
      ),
    );
  }

  group('OrgChartComponent', () {
    group('rendering structure', () {
      testWidgets('displays self employee card', (tester) async {
        await tester.pumpWidget(buildTestWidget(self: testSelf));

        expect(find.text('John Doe'), findsOneWidget);
        expect(find.text('Senior Software Engineer'), findsOneWidget);
      });

      testWidgets('displays manager in top row when provided', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          manager: testManager,
          self: testSelf,
        ));

        expect(find.text('Sarah Johnson'), findsOneWidget);
        expect(find.text('VP of Engineering'), findsOneWidget);
      });

      testWidgets('displays peers in middle row', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          peers: testPeers,
        ));

        expect(find.text('Jane Smith'), findsOneWidget);
        expect(find.text('Bob Wilson'), findsOneWidget);
      });

      testWidgets('displays direct reports in bottom row', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          directReports: testDirectReports,
        ));

        expect(find.text('Alice Chen'), findsOneWidget);
        expect(find.text('Marcus Brown'), findsOneWidget);
      });

      testWidgets('displays all three rows with complete data', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          manager: testManager,
          self: testSelf,
          peers: testPeers,
          directReports: testDirectReports,
        ));

        // Manager row
        expect(find.text('Sarah Johnson'), findsOneWidget);
        // Self + peers row
        expect(find.text('John Doe'), findsOneWidget);
        expect(find.text('Jane Smith'), findsOneWidget);
        expect(find.text('Bob Wilson'), findsOneWidget);
        // Direct reports row
        expect(find.text('Alice Chen'), findsOneWidget);
        expect(find.text('Marcus Brown'), findsOneWidget);
      });
    });

    group('EmployeeCard sub-widget', () {
      testWidgets('displays employee name and title', (tester) async {
        await tester.pumpWidget(buildTestWidget(self: testSelf));

        expect(find.text('John Doe'), findsOneWidget);
        expect(find.text('Senior Software Engineer'), findsOneWidget);
      });

      testWidgets('displays avatar with initials fallback', (tester) async {
        await tester.pumpWidget(buildTestWidget(self: testSelf));

        // Should find CircleAvatar with initials
        expect(find.byType(CircleAvatar), findsAtLeastNWidgets(1));
        expect(find.text('JD'), findsOneWidget);
      });

      testWidgets('displays single initial for single-word name', (tester) async {
        const singleNameEmployee = Employee(
          id: 'emp-single',
          name: 'Prince',
          title: 'Artist',
        );

        await tester.pumpWidget(buildTestWidget(self: singleNameEmployee));

        expect(find.text('P'), findsOneWidget);
      });

      testWidgets('displays proper initials for multi-part name', (tester) async {
        const multiNameEmployee = Employee(
          id: 'emp-multi',
          name: 'Mary Jane Watson',
          title: 'Manager',
        );

        await tester.pumpWidget(buildTestWidget(self: multiNameEmployee));

        // Should use first and last name initials
        expect(find.text('MW'), findsOneWidget);
      });
    });

    group('self card highlighting', () {
      testWidgets('self card has distinct visual style', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          peers: testPeers,
        ));

        // Find all EmployeeCard widgets
        final employeeCards = find.byType(EmployeeCard);
        expect(employeeCards, findsAtLeastNWidgets(3));

        // The self card should be marked as highlighted
        final selfCard = find.ancestor(
          of: find.text('John Doe'),
          matching: find.byType(EmployeeCard),
        );
        expect(selfCard, findsOneWidget);

        // Verify the self card has the isSelf property
        final selfCardWidget = tester.widget<EmployeeCard>(selfCard);
        expect(selfCardWidget.isSelf, isTrue);
      });

      testWidgets('peer cards are not highlighted', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          peers: testPeers,
        ));

        // Find peer card
        final peerCard = find.ancestor(
          of: find.text('Jane Smith'),
          matching: find.byType(EmployeeCard),
        );
        expect(peerCard, findsOneWidget);

        final peerCardWidget = tester.widget<EmployeeCard>(peerCard);
        expect(peerCardWidget.isSelf, isFalse);
      });
    });

    group('onEmployeeClick callback', () {
      testWidgets('calls callback when employee card is tapped', (tester) async {
        Employee? clickedEmployee;

        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          onEmployeeClick: (employee) => clickedEmployee = employee,
        ));

        await tester.tap(find.text('John Doe'));
        await tester.pumpAndSettle();

        expect(clickedEmployee, isNotNull);
        expect(clickedEmployee!.id, equals('emp-001'));
      });

      testWidgets('calls callback with correct employee for manager',
          (tester) async {
        Employee? clickedEmployee;

        await tester.pumpWidget(buildTestWidget(
          manager: testManager,
          self: testSelf,
          onEmployeeClick: (employee) => clickedEmployee = employee,
        ));

        await tester.tap(find.text('Sarah Johnson'));
        await tester.pumpAndSettle();

        expect(clickedEmployee, isNotNull);
        expect(clickedEmployee!.id, equals('mgr-001'));
      });

      testWidgets('calls callback with correct employee for peer',
          (tester) async {
        Employee? clickedEmployee;

        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          peers: testPeers,
          onEmployeeClick: (employee) => clickedEmployee = employee,
        ));

        await tester.tap(find.text('Jane Smith'));
        await tester.pumpAndSettle();

        expect(clickedEmployee, isNotNull);
        expect(clickedEmployee!.id, equals('emp-002'));
      });

      testWidgets('calls callback with correct employee for direct report',
          (tester) async {
        Employee? clickedEmployee;

        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          directReports: testDirectReports,
          onEmployeeClick: (employee) => clickedEmployee = employee,
        ));

        await tester.tap(find.text('Alice Chen'));
        await tester.pumpAndSettle();

        expect(clickedEmployee, isNotNull);
        expect(clickedEmployee!.id, equals('emp-004'));
      });

      testWidgets('does not crash when callback is null', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          onEmployeeClick: null,
        ));

        // Should not throw
        await tester.tap(find.text('John Doe'));
        await tester.pumpAndSettle();
      });
    });

    group('loading state', () {
      testWidgets('displays loading indicator when isLoading is true',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          isLoading: true,
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
      });

      testWidgets('does not display employee cards when loading',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          isLoading: true,
        ));

        expect(find.byType(EmployeeCard), findsNothing);
      });

      testWidgets('displays loading message', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          isLoading: true,
        ));

        expect(find.text('Loading organization chart...'), findsOneWidget);
      });
    });

    group('error state', () {
      testWidgets('displays error message when provided', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          errorMessage: 'Failed to load org chart data',
        ));

        expect(find.text('Failed to load org chart data'), findsOneWidget);
      });

      testWidgets('displays error icon', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          errorMessage: 'Failed to load org chart data',
        ));

        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      });

      testWidgets('does not display employee cards when error', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          errorMessage: 'Failed to load org chart data',
        ));

        expect(find.byType(EmployeeCard), findsNothing);
      });
    });

    group('connection lines', () {
      testWidgets('renders connection lines container', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          manager: testManager,
          self: testSelf,
          directReports: testDirectReports,
        ));

        // Check for OrgChartConnectors widget
        expect(find.byType(OrgChartConnectors), findsOneWidget);
      });
    });

    group('row labels', () {
      testWidgets('displays Manager label when manager exists', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          manager: testManager,
          self: testSelf,
        ));

        expect(find.text('Manager'), findsOneWidget);
      });

      testWidgets('displays Team label for self and peers row', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          peers: testPeers,
        ));

        expect(find.text('Team'), findsOneWidget);
      });

      testWidgets('displays Direct Reports label when reports exist',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          directReports: testDirectReports,
        ));

        expect(find.text('Direct Reports'), findsOneWidget);
      });

      testWidgets('does not display Manager label when manager is null',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
        ));

        expect(find.text('Manager'), findsNothing);
      });

      testWidgets('does not display Direct Reports label when empty',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          directReports: [],
        ));

        expect(find.text('Direct Reports'), findsNothing);
      });
    });

    group('edge cases', () {
      testWidgets('handles empty peers list', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          peers: [],
        ));

        expect(find.text('John Doe'), findsOneWidget);
      });

      testWidgets('handles empty direct reports list', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          directReports: [],
        ));

        expect(find.text('John Doe'), findsOneWidget);
      });

      testWidgets('handles no manager', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          self: testSelf,
          manager: null,
        ));

        expect(find.text('John Doe'), findsOneWidget);
      });

      testWidgets('handles employee with empty name gracefully', (tester) async {
        const emptyNameEmployee = Employee(
          id: 'emp-empty',
          name: '',
          title: 'Unknown',
        );

        await tester.pumpWidget(buildTestWidget(self: emptyNameEmployee));

        // Should show fallback initial
        expect(find.text('?'), findsOneWidget);
      });
    });
  });

  group('Employee model', () {
    test('creates Employee with required fields', () {
      const employee = Employee(
        id: 'test-001',
        name: 'Test User',
        title: 'Test Title',
      );

      expect(employee.id, equals('test-001'));
      expect(employee.name, equals('Test User'));
      expect(employee.title, equals('Test Title'));
    });

    test('creates Employee with all optional fields', () {
      const employee = Employee(
        id: 'test-001',
        name: 'Test User',
        title: 'Test Title',
        email: 'test@example.com',
        department: 'Engineering',
        avatarUrl: 'https://example.com/avatar.png',
        managerId: 'mgr-001',
      );

      expect(employee.email, equals('test@example.com'));
      expect(employee.department, equals('Engineering'));
      expect(employee.avatarUrl, equals('https://example.com/avatar.png'));
      expect(employee.managerId, equals('mgr-001'));
    });

    test('initials returns correct value for two-word name', () {
      const employee = Employee(
        id: 'test-001',
        name: 'John Doe',
        title: 'Developer',
      );

      expect(employee.initials, equals('JD'));
    });

    test('initials returns correct value for single-word name', () {
      const employee = Employee(
        id: 'test-001',
        name: 'Prince',
        title: 'Artist',
      );

      expect(employee.initials, equals('P'));
    });

    test('initials returns correct value for multi-word name', () {
      const employee = Employee(
        id: 'test-001',
        name: 'Mary Jane Watson Parker',
        title: 'Editor',
      );

      expect(employee.initials, equals('MP'));
    });

    test('initials returns ? for empty name', () {
      const employee = Employee(
        id: 'test-001',
        name: '',
        title: 'Unknown',
      );

      expect(employee.initials, equals('?'));
    });

    test('initials handles names with extra spaces', () {
      const employee = Employee(
        id: 'test-001',
        name: '  John   Doe  ',
        title: 'Developer',
      );

      expect(employee.initials, equals('JD'));
    });
  });
}
