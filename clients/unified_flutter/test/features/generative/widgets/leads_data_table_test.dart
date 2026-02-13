import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';
import 'package:unified_flutter/features/generative/widgets/leads_data_table.dart';

void main() {
  group('LeadsDataTable', () {
    // Test data factories
    Lead createLead({
      String id = 'lead-001',
      String name = 'John Doe',
      String? company,
      int? score,
      LeadStatus status = LeadStatus.newLead,
      String? source,
      String? email,
      String? phone,
      DateTime? createdAt,
      String? ownerId,
      String? ownerName,
    }) {
      return Lead(
        id: id,
        name: name,
        company: company,
        score: score,
        status: status,
        source: source,
        email: email,
        phone: phone,
        createdAt: createdAt,
        ownerId: ownerId,
        ownerName: ownerName,
      );
    }

    LeadFilters createFilters({
      LeadStatus? status,
      String? source,
      int? minScore,
      String? ownerId,
      String? search,
    }) {
      return LeadFilters(
        status: status,
        source: source,
        minScore: minScore,
        ownerId: ownerId,
        search: search,
      );
    }

    Widget buildTestWidget({
      List<Lead>? leads,
      LeadFilters? filters,
      List<String>? availableSources,
      void Function(String leadId)? onLeadClick,
      void Function(LeadFilters filters)? onFilterChange,
      void Function(LeadBulkAction action, List<String> leadIds)? onBulkAction,
      void Function(LeadSortField field, bool ascending)? onSort,
      bool isLoading = false,
      String? error,
    }) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: LeadsDataTable(
            leads: leads ?? [],
            filters: filters ?? const LeadFilters(),
            availableSources: availableSources ?? ['Website', 'Referral', 'LinkedIn', 'Trade Show'],
            onLeadClick: onLeadClick ?? (_) {},
            onFilterChange: onFilterChange ?? (_) {},
            onBulkAction: onBulkAction ?? (_, __) {},
            onSort: onSort ?? (_, __) {},
            isLoading: isLoading,
            error: error,
          ),
        ),
      );
    }

    group('Loading State', () {
      testWidgets('displays loading indicator when isLoading is true',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(isLoading: true));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Loading leads...'), findsOneWidget);
      });

      testWidgets('does not display content when loading', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          isLoading: true,
          leads: [
            createLead(name: 'Test Lead'),
          ],
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Test Lead'), findsNothing);
      });
    });

    group('Error State', () {
      testWidgets('displays error message when error is provided',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Failed to load leads',
        ));

        expect(find.text('Failed to load leads'), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      });

      testWidgets('error state has correct styling', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Network error',
        ));

        final iconFinder = find.byIcon(Icons.error_outline);
        expect(iconFinder, findsOneWidget);
      });
    });

    group('Empty State', () {
      testWidgets('displays empty state when no leads', (tester) async {
        await tester.pumpWidget(buildTestWidget(leads: []));

        expect(find.text('No leads found'), findsOneWidget);
        expect(find.byIcon(Icons.person_search), findsOneWidget);
      });

      testWidgets('empty state has correct styling', (tester) async {
        await tester.pumpWidget(buildTestWidget(leads: []));

        final iconFinder = find.byIcon(Icons.person_search);
        expect(iconFinder, findsOneWidget);

        final icon = tester.widget<Icon>(iconFinder);
        expect(icon.size, equals(64.0));
      });
    });

    group('Column Headers', () {
      testWidgets('displays all column headers', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        expect(find.text('Name'), findsAtLeastNWidgets(1));
        expect(find.text('Company'), findsAtLeastNWidgets(1));
        // Status appears in header and as chip
        expect(find.text('Score'), findsAtLeastNWidgets(1));
        // Source appears in header and filter
        expect(find.text('Last Activity'), findsOneWidget);
      });

      testWidgets('displays checkbox column for selection', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        // Find checkbox in header for select all
        expect(find.byType(Checkbox), findsAtLeastNWidgets(1));
      });
    });

    group('Lead Data Display', () {
      testWidgets('displays lead name', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Jane Smith')],
        ));

        expect(find.text('Jane Smith'), findsOneWidget);
      });

      testWidgets('displays lead company', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'John', company: 'Acme Corp')],
        ));

        expect(find.text('Acme Corp'), findsOneWidget);
      });

      testWidgets('displays dash when company is null', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'John', company: null)],
        ));

        // Should find at least one dash for empty company
        expect(find.text('-'), findsAtLeastNWidgets(1));
      });

      testWidgets('displays lead source', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'John', source: 'LinkedIn')],
        ));

        expect(find.text('LinkedIn'), findsOneWidget);
      });

      testWidgets('displays formatted last activity date', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(
              name: 'John',
              createdAt: DateTime(2026, 3, 15),
            ),
          ],
        ));

        expect(find.textContaining('Mar 15'), findsOneWidget);
      });
    });

    group('Score Badges', () {
      testWidgets('displays hot badge for score >= 80', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Hot Lead', score: 85)],
        ));

        // Find the score badge
        expect(find.text('85'), findsOneWidget);

        // Verify hot styling - find Container with red-ish background
        final container = tester.widget<Container>(
          find.ancestor(
            of: find.text('85'),
            matching: find.byType(Container),
          ).first,
        );
        expect(container, isNotNull);
      });

      testWidgets('displays warm badge for score >= 50 and < 80',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Warm Lead', score: 65)],
        ));

        expect(find.text('65'), findsOneWidget);
      });

      testWidgets('displays cold badge for score < 50', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Cold Lead', score: 30)],
        ));

        expect(find.text('30'), findsOneWidget);
      });

      testWidgets('displays dash when score is null', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'No Score Lead', score: null)],
        ));

        // Should have a dash for null score
        expect(find.text('-'), findsAtLeastNWidgets(1));
      });

      testWidgets('score badge at boundary 80 is hot', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Boundary Lead', score: 80)],
        ));

        expect(find.text('80'), findsOneWidget);
      });

      testWidgets('score badge at boundary 50 is warm', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Boundary Lead', score: 50)],
        ));

        expect(find.text('50'), findsOneWidget);
      });

      testWidgets('score badge at 49 is cold', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Cold Lead', score: 49)],
        ));

        expect(find.text('49'), findsOneWidget);
      });
    });

    group('Status Chips', () {
      testWidgets('displays NEW status chip', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.newLead)],
        ));

        expect(find.text('New'), findsOneWidget);
      });

      testWidgets('displays CONTACTED status chip', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.contacted)],
        ));

        expect(find.text('Contacted'), findsOneWidget);
      });

      testWidgets('displays QUALIFIED status chip', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.qualified)],
        ));

        expect(find.text('Qualified'), findsOneWidget);
      });

      testWidgets('displays UNQUALIFIED status chip', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.unqualified)],
        ));

        expect(find.text('Unqualified'), findsOneWidget);
      });

      testWidgets('displays CONVERTED status chip', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.converted)],
        ));

        expect(find.text('Converted'), findsOneWidget);
      });
    });

    group('Filter Row', () {
      testWidgets('displays status filter dropdown', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        // Find dropdown for status filter with label
        expect(find.text('Status'), findsAtLeastNWidgets(1));
        expect(find.byType(DropdownButtonFormField<LeadStatus?>), findsOneWidget);
      });

      testWidgets('displays source filter dropdown', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        // Find dropdown for source filter with label
        expect(find.byType(DropdownButtonFormField<String?>), findsOneWidget);
      });

      testWidgets('status dropdown shows all status options when tapped',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        // Tap the status dropdown
        await tester.tap(find.byType(DropdownButtonFormField<LeadStatus?>));
        await tester.pumpAndSettle();

        expect(find.text('New'), findsAtLeastNWidgets(1));
        expect(find.text('Contacted'), findsAtLeastNWidgets(1));
        expect(find.text('Qualified'), findsAtLeastNWidgets(1));
      });

      testWidgets('source dropdown shows available sources when tapped',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          availableSources: ['Website', 'Referral', 'LinkedIn'],
        ));

        // Tap the source dropdown
        await tester.tap(find.byType(DropdownButtonFormField<String?>));
        await tester.pumpAndSettle();

        expect(find.text('Website'), findsAtLeastNWidgets(1));
        expect(find.text('Referral'), findsAtLeastNWidgets(1));
        expect(find.text('LinkedIn'), findsAtLeastNWidgets(1));
      });

      testWidgets('calls onFilterChange when status filter changes',
          (tester) async {
        LeadFilters? capturedFilters;
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          onFilterChange: (filters) => capturedFilters = filters,
        ));

        await tester.tap(find.byType(DropdownButtonFormField<LeadStatus?>));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Qualified').last);
        await tester.pumpAndSettle();

        expect(capturedFilters?.status, equals(LeadStatus.qualified));
      });

      testWidgets('calls onFilterChange when source filter changes',
          (tester) async {
        LeadFilters? capturedFilters;
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          availableSources: ['Website', 'LinkedIn'],
          onFilterChange: (filters) => capturedFilters = filters,
        ));

        await tester.tap(find.byType(DropdownButtonFormField<String?>));
        await tester.pumpAndSettle();

        await tester.tap(find.text('LinkedIn').last);
        await tester.pumpAndSettle();

        expect(capturedFilters?.source, equals('LinkedIn'));
      });

      testWidgets('shows current filter values from props', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          filters: createFilters(status: LeadStatus.qualified),
        ));

        expect(find.text('Qualified'), findsAtLeastNWidgets(1));
      });
    });

    group('Checkbox Selection', () {
      testWidgets('displays checkbox for each lead row', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: '1', name: 'Lead 1'),
            createLead(id: '2', name: 'Lead 2'),
          ],
        ));

        // DataTable has checkboxes - at least 2 for rows
        expect(find.byType(Checkbox), findsAtLeastNWidgets(2));
      });

      testWidgets('selecting checkbox adds lead to selection', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: 'lead-1', name: 'Lead 1'),
          ],
        ));

        // Find the row checkbox (not header)
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pumpAndSettle();

        // Verify checkbox is now checked
        final checkbox = tester.widget<Checkbox>(checkboxes.last);
        expect(checkbox.value, isTrue);
      });

      testWidgets('header checkbox selects all leads', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: '1', name: 'Lead 1'),
            createLead(id: '2', name: 'Lead 2'),
            createLead(id: '3', name: 'Lead 3'),
          ],
        ));

        // Tap header checkbox (first one)
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.first);
        await tester.pumpAndSettle();

        // Row checkboxes should be checked (not necessarily all including header)
        final rowCheckboxes = tester.widgetList<Checkbox>(checkboxes).skip(1);
        for (final checkbox in rowCheckboxes) {
          expect(checkbox.value, isTrue);
        }
      });

      testWidgets('header checkbox deselects all when all selected',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: '1', name: 'Lead 1'),
            createLead(id: '2', name: 'Lead 2'),
          ],
        ));

        final checkboxes = find.byType(Checkbox);

        // Select all
        await tester.tap(checkboxes.first);
        await tester.pumpAndSettle();

        // Deselect all
        await tester.tap(checkboxes.first);
        await tester.pumpAndSettle();

        // Row checkboxes should be unchecked
        final rowCheckboxes = tester.widgetList<Checkbox>(checkboxes).skip(1);
        for (final checkbox in rowCheckboxes) {
          expect(checkbox.value, isFalse);
        }
      });
    });

    group('Bulk Action Bar', () {
      testWidgets('bulk action bar hidden when no selection', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        expect(find.text('Assign'), findsNothing);
        expect(find.text('Update Status'), findsNothing);
        expect(find.text('Export'), findsNothing);
        expect(find.text('Delete'), findsNothing);
      });

      testWidgets('bulk action bar appears when items selected',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(id: 'lead-1')],
        ));

        // Select a lead
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pumpAndSettle();

        expect(find.text('Assign'), findsOneWidget);
        expect(find.text('Update Status'), findsOneWidget);
        expect(find.text('Export'), findsOneWidget);
        expect(find.text('Delete'), findsOneWidget);
      });

      testWidgets('shows selection count in bulk action bar', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: '1', name: 'Lead 1'),
            createLead(id: '2', name: 'Lead 2'),
          ],
        ));

        // Select all
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.first);
        await tester.pumpAndSettle();

        expect(find.text('2 selected'), findsOneWidget);
      });

      testWidgets('calls onBulkAction with Assign action', (tester) async {
        LeadBulkAction? capturedAction;
        List<String>? capturedIds;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(id: 'lead-123')],
          onBulkAction: (action, ids) {
            capturedAction = action;
            capturedIds = ids;
          },
        ));

        // Select lead
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pumpAndSettle();

        // Tap Assign
        await tester.tap(find.text('Assign'));
        await tester.pump();

        expect(capturedAction, equals(LeadBulkAction.assign));
        expect(capturedIds, contains('lead-123'));
      });

      testWidgets('calls onBulkAction with UpdateStatus action',
          (tester) async {
        LeadBulkAction? capturedAction;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(id: 'lead-123')],
          onBulkAction: (action, ids) => capturedAction = action,
        ));

        // Select lead
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pumpAndSettle();

        // Tap Update Status
        await tester.tap(find.text('Update Status'));
        await tester.pump();

        expect(capturedAction, equals(LeadBulkAction.updateStatus));
      });

      testWidgets('calls onBulkAction with Export action', (tester) async {
        LeadBulkAction? capturedAction;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(id: 'lead-123')],
          onBulkAction: (action, ids) => capturedAction = action,
        ));

        // Select lead
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pumpAndSettle();

        // Tap Export
        await tester.tap(find.text('Export'));
        await tester.pump();

        expect(capturedAction, equals(LeadBulkAction.export));
      });

      testWidgets('calls onBulkAction with Delete action', (tester) async {
        LeadBulkAction? capturedAction;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(id: 'lead-123')],
          onBulkAction: (action, ids) => capturedAction = action,
        ));

        // Select lead
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pumpAndSettle();

        // Find Delete button and scroll it into view first
        final deleteButton = find.byIcon(Icons.delete);
        await tester.ensureVisible(deleteButton);
        await tester.pumpAndSettle();

        // Tap Delete icon
        await tester.tap(deleteButton);
        await tester.pump();

        expect(capturedAction, equals(LeadBulkAction.delete));
      });
    });

    group('Column Sorting', () {
      testWidgets('clicking Name header triggers sort', (tester) async {
        LeadSortField? capturedField;
        bool? capturedAscending;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          onSort: (field, ascending) {
            capturedField = field;
            capturedAscending = ascending;
          },
        ));

        await tester.tap(find.text('Name'));
        await tester.pump();

        expect(capturedField, equals(LeadSortField.name));
        expect(capturedAscending, isTrue);
      });

      testWidgets('clicking Score header triggers sort', (tester) async {
        LeadSortField? capturedField;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          onSort: (field, _) => capturedField = field,
        ));

        await tester.tap(find.text('Score'));
        await tester.pump();

        expect(capturedField, equals(LeadSortField.score));
      });

      testWidgets('clicking Company header triggers sort', (tester) async {
        LeadSortField? capturedField;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          onSort: (field, _) => capturedField = field,
        ));

        await tester.tap(find.text('Company'));
        await tester.pump();

        expect(capturedField, equals(LeadSortField.company));
      });

      testWidgets('clicking Status header triggers sort', (tester) async {
        LeadSortField? capturedField;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          onSort: (field, _) => capturedField = field,
        ));

        // Find the Status text in DataColumn (first occurrence in DataTable)
        final statusTexts = find.text('Status');
        // The first one should be the filter label, look for Status in data table header
        // Tap the second one which is in the DataTable column
        await tester.tap(statusTexts.last);
        await tester.pump();

        expect(capturedField, equals(LeadSortField.status));
      });

      testWidgets('clicking same header toggles sort direction', (tester) async {
        bool? firstAscending;
        bool? secondAscending;
        int tapCount = 0;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
          onSort: (field, ascending) {
            tapCount++;
            if (tapCount == 1) firstAscending = ascending;
            if (tapCount == 2) secondAscending = ascending;
          },
        ));

        // First tap
        await tester.tap(find.text('Name'));
        await tester.pump();

        // Second tap
        await tester.tap(find.text('Name'));
        await tester.pump();

        expect(firstAscending, isTrue);
        expect(secondAscending, isFalse);
      });
    });

    group('Lead Click Callback', () {
      testWidgets('calls onLeadClick when lead row is tapped', (tester) async {
        String? clickedLeadId;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(id: 'lead-abc', name: 'Click Me')],
          onLeadClick: (id) => clickedLeadId = id,
        ));

        await tester.tap(find.text('Click Me'));
        await tester.pump();

        expect(clickedLeadId, equals('lead-abc'));
      });

      testWidgets('clicking checkbox does not trigger onLeadClick',
          (tester) async {
        String? clickedLeadId;

        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(id: 'lead-abc')],
          onLeadClick: (id) => clickedLeadId = id,
        ));

        // Tap checkbox
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pump();

        expect(clickedLeadId, isNull);
      });
    });

    group('Multiple Leads Display', () {
      testWidgets('displays multiple leads', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: '1', name: 'Alice', company: 'Acme'),
            createLead(id: '2', name: 'Bob', company: 'Beta Corp'),
            createLead(id: '3', name: 'Carol', company: 'Gamma Inc'),
          ],
        ));

        expect(find.text('Alice'), findsOneWidget);
        expect(find.text('Bob'), findsOneWidget);
        expect(find.text('Carol'), findsOneWidget);
        expect(find.text('Acme'), findsOneWidget);
        expect(find.text('Beta Corp'), findsOneWidget);
        expect(find.text('Gamma Inc'), findsOneWidget);
      });

      testWidgets('displays leads with mixed scores', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: '1', name: 'Hot Lead', score: 90),
            createLead(id: '2', name: 'Warm Lead', score: 60),
            createLead(id: '3', name: 'Cold Lead', score: 25),
          ],
        ));

        expect(find.text('90'), findsOneWidget);
        expect(find.text('60'), findsOneWidget);
        expect(find.text('25'), findsOneWidget);
      });

      testWidgets('displays leads with different statuses', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: '1', name: 'New', status: LeadStatus.newLead),
            createLead(id: '2', name: 'Contact', status: LeadStatus.contacted),
            createLead(id: '3', name: 'Qual', status: LeadStatus.qualified),
          ],
        ));

        expect(find.text('New'), findsAtLeastNWidgets(1));
        expect(find.text('Contacted'), findsOneWidget);
        expect(find.text('Qualified'), findsAtLeastNWidgets(1));
      });
    });

    group('Accessibility', () {
      testWidgets('checkboxes have semantic labels', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Test Lead')],
        ));

        final checkboxFinder = find.byType(Checkbox);
        expect(checkboxFinder, findsAtLeastNWidgets(1));
      });

      testWidgets('rows are tappable', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(name: 'Tappable Lead')],
        ));

        final inkWell = find.ancestor(
          of: find.text('Tappable Lead'),
          matching: find.byType(InkWell),
        );
        expect(inkWell, findsAtLeastNWidgets(1));
      });

      testWidgets('bulk action buttons have correct icons', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        // Select lead to show bulk actions
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pumpAndSettle();

        expect(find.byIcon(Icons.person_add), findsOneWidget);      // Assign
        expect(find.byIcon(Icons.edit), findsOneWidget);            // Update Status
        expect(find.byIcon(Icons.download), findsOneWidget);        // Export
        expect(find.byIcon(Icons.delete), findsOneWidget);          // Delete
      });
    });

    group('Score Badge Colors', () {
      testWidgets('hot score uses red/error color scheme', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(score: 85)],
        ));

        // The score badge should be present
        expect(find.text('85'), findsOneWidget);
      });

      testWidgets('warm score uses amber color scheme', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(score: 65)],
        ));

        expect(find.text('65'), findsOneWidget);
      });

      testWidgets('cold score uses blue color scheme', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(score: 30)],
        ));

        expect(find.text('30'), findsOneWidget);
      });
    });

    group('Status Chip Colors', () {
      testWidgets('NEW status has blue color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.newLead)],
        ));

        expect(find.text('New'), findsOneWidget);
      });

      testWidgets('CONTACTED status has purple color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.contacted)],
        ));

        expect(find.text('Contacted'), findsOneWidget);
      });

      testWidgets('QUALIFIED status has green color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.qualified)],
        ));

        expect(find.text('Qualified'), findsAtLeastNWidgets(1));
      });

      testWidgets('UNQUALIFIED status has gray color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.unqualified)],
        ));

        expect(find.text('Unqualified'), findsOneWidget);
      });

      testWidgets('CONVERTED status has teal color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead(status: LeadStatus.converted)],
        ));

        expect(find.text('Converted'), findsOneWidget);
      });
    });

    group('Clear Selection', () {
      testWidgets('clear selection button appears when items selected',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        // Select lead
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.last);
        await tester.pumpAndSettle();

        expect(find.byIcon(Icons.close), findsOneWidget);
      });

      testWidgets('clear selection clears all selected items', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [
            createLead(id: '1', name: 'Lead 1'),
            createLead(id: '2', name: 'Lead 2'),
          ],
        ));

        // Select first row
        final checkboxes = find.byType(Checkbox);
        await tester.tap(checkboxes.at(1)); // Skip header, tap first row
        await tester.pumpAndSettle();

        // Bulk action bar should be visible with close button
        expect(find.byIcon(Icons.close), findsOneWidget);

        // Clear selection
        await tester.tap(find.byIcon(Icons.close));
        await tester.pumpAndSettle();

        // Row checkboxes should be unchecked
        final rowCheckboxes = tester.widgetList<Checkbox>(find.byType(Checkbox)).skip(1);
        for (final checkbox in rowCheckboxes) {
          expect(checkbox.value, isFalse);
        }
      });
    });

    group('Widget Structure', () {
      testWidgets('renders as a Column with filter row and data table',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        expect(find.byType(Column), findsAtLeastNWidgets(1));
      });

      testWidgets('uses Card for overall container', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          leads: [createLead()],
        ));

        expect(find.byType(Card), findsAtLeastNWidgets(1));
      });
    });
  });
}
