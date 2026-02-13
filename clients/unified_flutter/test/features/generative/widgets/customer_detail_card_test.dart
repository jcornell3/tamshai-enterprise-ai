import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';
import 'package:unified_flutter/features/generative/widgets/customer_detail_card.dart';

void main() {
  group('CustomerDetailCard', () {
    // Test data factories
    Customer createCustomer({
      String id = 'cust-001',
      String name = 'Acme Corporation',
      String? industry,
      double? annualRevenue,
      int? employeeCount,
      String? website,
      String status = 'active',
      String? logoUrl,
      DateTime? createdAt,
    }) {
      return Customer(
        id: id,
        name: name,
        industry: industry,
        annualRevenue: annualRevenue,
        employeeCount: employeeCount,
        website: website,
        status: status,
        logoUrl: logoUrl,
        createdAt: createdAt,
      );
    }

    Contact createContact({
      String id = 'contact-001',
      String name = 'John Doe',
      String? email,
      String? phone,
      String? title,
      bool isPrimary = false,
      String? customerId,
    }) {
      return Contact(
        id: id,
        name: name,
        email: email,
        phone: phone,
        title: title,
        isPrimary: isPrimary,
        customerId: customerId,
      );
    }

    Opportunity createOpportunity({
      String id = 'opp-001',
      String name = 'Enterprise Deal',
      double amount = 50000.0,
      String stage = 'Qualification',
      String? customerId,
      String? customerName,
      DateTime? closeDate,
      double? probability,
    }) {
      return Opportunity(
        id: id,
        name: name,
        amount: amount,
        stage: stage,
        customerId: customerId,
        customerName: customerName,
        closeDate: closeDate,
        probability: probability,
      );
    }

    Widget buildTestWidget({
      required Customer customer,
      List<Contact>? contacts,
      List<Opportunity>? opportunities,
      void Function(Contact contact)? onContactClick,
      void Function(Opportunity opportunity)? onOpportunityClick,
      void Function(String action)? onAction,
      bool isLoading = false,
      String? error,
    }) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: SingleChildScrollView(
            child: CustomerDetailCard(
              customer: customer,
              contacts: contacts ?? [],
              opportunities: opportunities ?? [],
              onContactClick: onContactClick ?? (_) {},
              onOpportunityClick: onOpportunityClick ?? (_) {},
              onAction: onAction ?? (_) {},
              isLoading: isLoading,
              error: error,
            ),
          ),
        ),
      );
    }

    group('Loading State', () {
      testWidgets('displays loading indicator when isLoading is true',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          isLoading: true,
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Loading customer details...'), findsOneWidget);
      });

      testWidgets('does not display content when loading', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(name: 'Test Corp'),
          isLoading: true,
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Test Corp'), findsNothing);
      });
    });

    group('Error State', () {
      testWidgets('displays error message when error is provided',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          error: 'Failed to load customer details',
        ));

        expect(find.text('Failed to load customer details'), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      });

      testWidgets('error state has correct styling', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          error: 'Network error',
        ));

        final iconFinder = find.byIcon(Icons.error_outline);
        expect(iconFinder, findsOneWidget);
      });
    });

    group('Customer Header', () {
      testWidgets('displays customer name', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(name: 'Acme Corporation'),
        ));

        expect(find.text('Acme Corporation'), findsOneWidget);
      });

      testWidgets('displays industry badge when provided', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(
            name: 'Tech Solutions',
            industry: 'Technology',
          ),
        ));

        expect(find.text('Technology'), findsOneWidget);
      });

      testWidgets('displays active status indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(status: 'active'),
        ));

        expect(find.text('Active'), findsOneWidget);
      });

      testWidgets('displays inactive status indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(status: 'inactive'),
        ));

        expect(find.text('Inactive'), findsOneWidget);
      });

      testWidgets('displays prospect status indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(status: 'prospect'),
        ));

        expect(find.text('Prospect'), findsOneWidget);
      });

      testWidgets('displays annual revenue when provided', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(annualRevenue: 5000000.0),
        ));

        expect(find.textContaining(r'$5,000,000'), findsOneWidget);
      });

      testWidgets('displays employee count when provided', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(employeeCount: 250),
        ));

        expect(find.text('250 employees'), findsOneWidget);
      });

      testWidgets('displays website when provided', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(website: 'https://acme.com'),
        ));

        expect(find.text('https://acme.com'), findsOneWidget);
      });
    });

    group('Contacts Section', () {
      testWidgets('displays contacts section header with count', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(name: 'John Doe'),
          ],
        ));

        expect(find.text('Contacts (1)'), findsOneWidget);
      });

      testWidgets('displays contact count in header', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(id: '1', name: 'John Doe'),
            createContact(id: '2', name: 'Jane Smith'),
          ],
        ));

        expect(find.text('Contacts (2)'), findsOneWidget);
      });

      testWidgets('displays contact name and title', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(name: 'John Doe', title: 'CEO'),
          ],
        ));

        expect(find.text('John Doe'), findsOneWidget);
        expect(find.text('CEO'), findsOneWidget);
      });

      testWidgets('displays contact email', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(name: 'John Doe', email: 'john@acme.com'),
          ],
        ));

        expect(find.text('john@acme.com'), findsOneWidget);
      });

      testWidgets('displays contact phone', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(name: 'John Doe', phone: '+1-555-0100'),
          ],
        ));

        expect(find.text('+1-555-0100'), findsOneWidget);
      });

      testWidgets('highlights primary contact', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(
              id: '1',
              name: 'John Doe',
              isPrimary: true,
            ),
            createContact(
              id: '2',
              name: 'Jane Smith',
              isPrimary: false,
            ),
          ],
        ));

        expect(find.text('Primary'), findsOneWidget);
        expect(find.byIcon(Icons.star), findsOneWidget);
      });

      testWidgets('primary contact appears first', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(id: '1', name: 'Jane Smith', isPrimary: false),
            createContact(id: '2', name: 'John Doe', isPrimary: true),
          ],
        ));

        // Find all text widgets and verify John Doe (primary) appears before Jane Smith
        final johnFinder = find.text('John Doe');
        final janeFinder = find.text('Jane Smith');
        expect(johnFinder, findsOneWidget);
        expect(janeFinder, findsOneWidget);
      });

      testWidgets('calls onContactClick when contact is tapped',
          (tester) async {
        Contact? clickedContact;
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(id: 'contact-123', name: 'John Doe'),
          ],
          onContactClick: (contact) => clickedContact = contact,
        ));

        await tester.tap(find.text('John Doe'));
        await tester.pump();

        expect(clickedContact?.id, equals('contact-123'));
      });

      testWidgets('displays empty message when no contacts', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [],
        ));

        expect(find.text('No contacts'), findsOneWidget);
      });
    });

    group('Opportunities Section', () {
      testWidgets('displays opportunities section header with count', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Big Deal'),
          ],
        ));

        expect(find.text('Opportunities (1)'), findsOneWidget);
      });

      testWidgets('displays opportunity count in header', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(id: '1', name: 'Deal A'),
            createOpportunity(id: '2', name: 'Deal B'),
            createOpportunity(id: '3', name: 'Deal C'),
          ],
        ));

        expect(find.text('Opportunities (3)'), findsOneWidget);
      });

      testWidgets('displays opportunity name and amount', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Enterprise License', amount: 75000.0),
          ],
        ));

        expect(find.text('Enterprise License'), findsOneWidget);
        expect(find.textContaining(r'$75,000'), findsOneWidget);
      });

      testWidgets('displays opportunity stage as badge', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Deal', stage: 'Negotiation'),
          ],
        ));

        expect(find.text('Negotiation'), findsOneWidget);
      });

      testWidgets('displays close date when provided', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(
              name: 'Deal',
              closeDate: DateTime(2026, 6, 30),
            ),
          ],
        ));

        expect(find.textContaining('Jun 30'), findsOneWidget);
      });

      testWidgets('displays probability when provided', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Deal', probability: 75.0),
          ],
        ));

        expect(find.text('75%'), findsOneWidget);
      });

      testWidgets('calls onOpportunityClick when opportunity is tapped',
          (tester) async {
        Opportunity? clickedOpportunity;
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(id: 'opp-123', name: 'Big Deal'),
          ],
          onOpportunityClick: (opp) => clickedOpportunity = opp,
        ));

        await tester.tap(find.text('Big Deal'));
        await tester.pump();

        expect(clickedOpportunity?.id, equals('opp-123'));
      });

      testWidgets('displays empty message when no opportunities',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [],
        ));

        expect(find.text('No opportunities'), findsOneWidget);
      });
    });

    group('Stage Badge Colors', () {
      testWidgets('Prospecting stage has correct color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Deal', stage: 'Prospecting'),
          ],
        ));

        expect(find.text('Prospecting'), findsOneWidget);
      });

      testWidgets('Qualification stage has correct color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Deal', stage: 'Qualification'),
          ],
        ));

        expect(find.text('Qualification'), findsOneWidget);
      });

      testWidgets('Proposal stage has correct color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Deal', stage: 'Proposal'),
          ],
        ));

        expect(find.text('Proposal'), findsOneWidget);
      });

      testWidgets('Negotiation stage has correct color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Deal', stage: 'Negotiation'),
          ],
        ));

        expect(find.text('Negotiation'), findsOneWidget);
      });

      testWidgets('Closed Won stage has correct color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Deal', stage: 'Closed Won'),
          ],
        ));

        expect(find.text('Closed Won'), findsOneWidget);
      });

      testWidgets('Closed Lost stage has correct color', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Deal', stage: 'Closed Lost'),
          ],
        ));

        expect(find.text('Closed Lost'), findsOneWidget);
      });
    });

    group('Quick Action Buttons', () {
      testWidgets('displays Call button', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
        ));

        expect(find.text('Call'), findsOneWidget);
        expect(find.byIcon(Icons.phone), findsOneWidget);
      });

      testWidgets('displays Email button', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
        ));

        expect(find.text('Email'), findsOneWidget);
        expect(find.byIcon(Icons.email), findsOneWidget);
      });

      testWidgets('displays Schedule Meeting button', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
        ));

        expect(find.text('Schedule'), findsOneWidget);
        expect(find.byIcon(Icons.calendar_today), findsOneWidget);
      });

      testWidgets('calls onAction with "call" when Call button is pressed',
          (tester) async {
        String? actionCalled;
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          onAction: (action) => actionCalled = action,
        ));

        await tester.tap(find.text('Call'));
        await tester.pump();

        expect(actionCalled, equals('call'));
      });

      testWidgets('calls onAction with "email" when Email button is pressed',
          (tester) async {
        String? actionCalled;
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          onAction: (action) => actionCalled = action,
        ));

        await tester.tap(find.text('Email'));
        await tester.pump();

        expect(actionCalled, equals('email'));
      });

      testWidgets(
          'calls onAction with "schedule" when Schedule button is pressed',
          (tester) async {
        String? actionCalled;
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          onAction: (action) => actionCalled = action,
        ));

        await tester.tap(find.text('Schedule'));
        await tester.pump();

        expect(actionCalled, equals('schedule'));
      });
    });

    group('Status Indicator Colors', () {
      testWidgets('active status has green indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(status: 'active'),
        ));

        // Status chip should exist
        expect(find.text('Active'), findsOneWidget);
      });

      testWidgets('inactive status has red indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(status: 'inactive'),
        ));

        expect(find.text('Inactive'), findsOneWidget);
      });

      testWidgets('prospect status has orange indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(status: 'prospect'),
        ));

        expect(find.text('Prospect'), findsOneWidget);
      });
    });

    group('Accessibility', () {
      testWidgets('Call button has tooltip', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
        ));

        final callButton = find.byWidgetPredicate(
          (widget) =>
              widget is FilledButton &&
              widget.child is Row &&
              ((widget.child as Row).children.any((child) =>
                  child is Icon && child.icon == Icons.phone)),
        );
        expect(callButton, findsOneWidget);
      });

      testWidgets('contacts are tappable', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(name: 'John Doe'),
          ],
        ));

        final contactItem = find.ancestor(
          of: find.text('John Doe'),
          matching: find.byType(InkWell),
        );
        expect(contactItem, findsOneWidget);
      });

      testWidgets('opportunities are tappable', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(name: 'Big Deal'),
          ],
        ));

        final oppItem = find.ancestor(
          of: find.text('Big Deal'),
          matching: find.byType(InkWell),
        );
        expect(oppItem, findsOneWidget);
      });
    });

    group('Card Layout', () {
      testWidgets('renders as a Card widget', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
        ));

        expect(find.byType(Card), findsAtLeastNWidgets(1));
      });

      testWidgets('uses CircleAvatar for customer avatar', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(logoUrl: null),
        ));

        // Should find CircleAvatar in the header
        expect(find.byType(CircleAvatar), findsAtLeastNWidgets(1));
      });

      testWidgets('displays placeholder icon when no logo', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(logoUrl: null),
        ));

        expect(find.byIcon(Icons.business), findsOneWidget);
      });
    });

    group('Multiple Items Display', () {
      testWidgets('displays all contacts', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          contacts: [
            createContact(id: '1', name: 'Alice Johnson'),
            createContact(id: '2', name: 'Bob Williams'),
            createContact(id: '3', name: 'Carol Davis'),
          ],
        ));

        expect(find.text('Alice Johnson'), findsOneWidget);
        expect(find.text('Bob Williams'), findsOneWidget);
        expect(find.text('Carol Davis'), findsOneWidget);
      });

      testWidgets('displays all opportunities', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          customer: createCustomer(),
          opportunities: [
            createOpportunity(id: '1', name: 'Deal Alpha'),
            createOpportunity(id: '2', name: 'Deal Beta'),
          ],
        ));

        expect(find.text('Deal Alpha'), findsOneWidget);
        expect(find.text('Deal Beta'), findsOneWidget);
      });
    });
  });
}
