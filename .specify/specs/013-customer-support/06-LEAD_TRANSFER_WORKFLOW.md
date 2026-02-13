# Customer Support Portal - Lead Transfer Workflow

## 1. Overview

The Lead Transfer Workflow enables a lead customer contact to transfer their privileges to another contact within the same organization. This is a sensitive operation that requires explicit confirmation using the Human-in-the-Loop pattern.

## 2. State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEAD TRANSFER STATE MACHINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    ┌─────────────────┐                                      │
│                    │   ACTIVE_LEAD   │                                      │
│                    │                 │                                      │
│                    │ Jane Smith      │                                      │
│                    │ (lead-customer) │                                      │
│                    └────────┬────────┘                                      │
│                             │                                               │
│                             │ customer_transfer_lead()                      │
│                             │                                               │
│                             ▼                                               │
│                    ┌─────────────────┐                                      │
│                    │    PENDING_     │                                      │
│                    │   CONFIRMATION  │◄─────────────────────────────────┐   │
│                    │                 │                                  │   │
│                    │ TTL: 5 minutes  │                                  │   │
│                    │ Redis key:      │                                  │   │
│                    │ pending:{id}    │                                  │   │
│                    └────────┬────────┘                                  │   │
│                             │                                           │   │
│              ┌──────────────┼──────────────┐                           │   │
│              │              │              │                           │   │
│              ▼              ▼              ▼                           │   │
│     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │   │
│     │  APPROVED   │ │  REJECTED   │ │   TIMEOUT   │                   │   │
│     │             │ │             │ │             │                   │   │
│     │ User clicks │ │ User clicks │ │ 5 minutes   │                   │   │
│     │ "Confirm"   │ │ "Cancel"    │ │ elapsed     │                   │   │
│     └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                   │   │
│            │               │               │                           │   │
│            │               │               │                           │   │
│            │               └───────────────┴────────────────────────────┘   │
│            │                         │                                      │
│            │                         │ No state change                      │
│            │                         ▼                                      │
│            │               ┌─────────────────┐                              │
│            │               │   NO_CHANGE     │                              │
│            │               │                 │                              │
│            │               │ Jane remains    │                              │
│            │               │ lead            │                              │
│            │               └─────────────────┘                              │
│            │                                                                │
│            ▼                                                                │
│   ┌─────────────────┐      ┌─────────────────┐                             │
│   │   EXECUTING     │      │   NEW_LEAD      │                             │
│   │                 │      │                 │                             │
│   │ 1. Revoke Jane's│─────►│ Bob Developer   │                             │
│   │    lead role    │      │ (lead-customer) │                             │
│   │ 2. Grant Bob's  │      │                 │                             │
│   │    lead role    │      │ Jane Smith      │                             │
│   │ 3. Update       │      │ (basic-customer)│                             │
│   │    contacts DB  │      │                 │                             │
│   │ 4. Log audit    │      └─────────────────┘                             │
│   │ 5. Send emails  │                                                      │
│   └─────────────────┘                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. BPMN Process Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         LEAD TRANSFER PROCESS                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Lead Customer                    Portal/MCP                    Keycloak     │
│      │                               │                             │         │
│      │                               │                             │         │
│  ○ Start                             │                             │         │
│  │                                   │                             │         │
│  │  Select new lead                  │                             │         │
│  │  from contact list                │                             │         │
│  │                                   │                             │         │
│  ▼                                   │                             │         │
│  ┌───────────────┐                   │                             │         │
│  │ Initiate      │                   │                             │         │
│  │ Transfer      │──────────────────►│                             │         │
│  │               │                   │                             │         │
│  └───────────────┘                   ▼                             │         │
│                              ┌───────────────┐                     │         │
│                              │ Validate      │                     │         │
│                              │ - Is lead?    │                     │         │
│                              │ - Target valid?│                    │         │
│                              │ - Same org?   │                     │         │
│                              └───────┬───────┘                     │         │
│                                      │                             │         │
│                                      │ Valid                       │         │
│                                      ▼                             │         │
│                              ┌───────────────┐                     │         │
│                              │ Create        │                     │         │
│                              │ Confirmation  │                     │         │
│                              │ in Redis      │                     │         │
│                              │ (5min TTL)    │                     │         │
│                              └───────┬───────┘                     │         │
│                                      │                             │         │
│  ┌───────────────┐◄──────────────────┘                             │         │
│  │ Show          │                                                 │         │
│  │ Approval Card │                                                 │         │
│  │               │                                                 │         │
│  └───────┬───────┘                                                 │         │
│          │                                                         │         │
│      ◇ Decision                                                    │         │
│     /         \                                                    │         │
│  Confirm     Cancel                                                │         │
│    │           │                                                   │         │
│    │           └─────────────────────────────────────► ◯ End       │         │
│    │                                                  (no change)  │         │
│    ▼                                                               │         │
│  ┌───────────────┐                   ┌───────────────┐             │         │
│  │ Submit        │──────────────────►│ Execute       │             │         │
│  │ Confirmation  │                   │ Transfer      │             │         │
│  └───────────────┘                   └───────┬───────┘             │         │
│                                              │                     │         │
│                                              ├────────────────────►│         │
│                                              │ Update Keycloak     │         │
│                                              │ roles for both      │         │
│                                              │ users               │         │
│                                              │◄────────────────────│         │
│                                              │                     │         │
│                                              ▼                     │         │
│                                      ┌───────────────┐             │         │
│                                      │ Update        │             │         │
│                                      │ MongoDB       │             │         │
│                                      │ contacts      │             │         │
│                                      └───────┬───────┘             │         │
│                                              │                     │         │
│                                              ▼                     │         │
│                                      ┌───────────────┐             │         │
│                                      │ Log Audit     │             │         │
│                                      │ Entry         │             │         │
│                                      └───────┬───────┘             │         │
│                                              │                     │         │
│                                              ▼                     │         │
│                                      ┌───────────────┐             │         │
│                                      │ Send Email    │             │         │
│                                      │ Notifications │             │         │
│                                      └───────┬───────┘             │         │
│                                              │                     │         │
│  ┌───────────────┐◄──────────────────────────┘                     │         │
│  │ Show Success  │                                                 │         │
│  │ Message       │                                                 │         │
│  │ (Now basic)   │                                                 │         │
│  └───────────────┘                                                 │         │
│          │                                                         │         │
│          ▼                                                         │         │
│      ◯ End                                                         │         │
│    (transferred)                                                   │         │
│                                                                    │         │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4. API Specification

### 4.1 Initiate Transfer

**Endpoint**: `POST /api/customer/contacts/transfer-lead`

**Request**:
```json
{
  "new_lead_contact_id": "contact-uuid-002",
  "reason": "Changing primary contact"
}
```

**Response** (pending_confirmation):
```json
{
  "status": "pending_confirmation",
  "confirmationId": "conf-lead-transfer-abc123",
  "message": "Transfer Lead Customer role?\n\nFrom: Jane Smith (jane.smith@acme.com)\nTo: Bob Developer (bob.developer@acme.com)\nOrganization: Acme Corporation\n\nThis action will:\n- Remove your lead privileges\n- Grant lead privileges to Bob Developer\n- You will become a basic customer\n\nThis action is logged for compliance.",
  "confirmationData": {
    "action": "transfer_lead",
    "from_contact_id": "contact-uuid-001",
    "to_contact_id": "contact-uuid-002",
    "organization_id": "org-acme-001"
  }
}
```

### 4.2 Confirm Transfer

**Endpoint**: `POST /api/confirm/:confirmationId`

**Request**:
```json
{
  "approved": true
}
```

**Success Response**:
```json
{
  "status": "success",
  "data": {
    "message": "Lead role transferred successfully",
    "new_lead": {
      "name": "Bob Developer",
      "email": "bob.developer@acme.com"
    },
    "your_new_role": "basic-customer"
  }
}
```

### 4.3 Cancel Transfer

**Request**:
```json
{
  "approved": false
}
```

**Response**:
```json
{
  "status": "cancelled",
  "message": "Lead transfer cancelled"
}
```

## 5. Implementation Details

### 5.1 Redis Confirmation Storage

```typescript
interface PendingLeadTransfer {
  action: 'transfer_lead';
  from_contact_id: string;
  to_contact_id: string;
  organization_id: string;
  initiated_by: string;
  initiated_at: string;
  reason?: string;
}

// Store with 5-minute TTL
await redis.setex(
  `pending:${confirmationId}`,
  300,  // 5 minutes
  JSON.stringify(pendingTransfer)
);
```

### 5.2 Execute Transfer

```typescript
async function executeLeadTransfer(
  pendingTransfer: PendingLeadTransfer
): Promise<void> {
  const { from_contact_id, to_contact_id, organization_id } = pendingTransfer;

  // 1. Get both contacts
  const fromContact = await db.contacts.findOne({ _id: from_contact_id });
  const toContact = await db.contacts.findOne({ _id: to_contact_id });

  // 2. Validate same organization
  if (fromContact.organization_id !== toContact.organization_id) {
    throw new Error('Contacts must be in the same organization');
  }

  // 3. Update Keycloak roles
  // Remove lead-customer from old lead
  await keycloakAdmin.users.delRealmRoleMappings({
    id: fromContact.keycloak_user_id,
    realm: 'tamshai-customers',
    roles: [{ name: 'lead-customer' }]
  });

  // Add basic-customer to old lead
  await keycloakAdmin.users.addRealmRoleMappings({
    id: fromContact.keycloak_user_id,
    realm: 'tamshai-customers',
    roles: [{ name: 'basic-customer' }]
  });

  // Remove basic-customer from new lead (if present)
  await keycloakAdmin.users.delRealmRoleMappings({
    id: toContact.keycloak_user_id,
    realm: 'tamshai-customers',
    roles: [{ name: 'basic-customer' }]
  });

  // Add lead-customer to new lead
  await keycloakAdmin.users.addRealmRoleMappings({
    id: toContact.keycloak_user_id,
    realm: 'tamshai-customers',
    roles: [{ name: 'lead-customer' }]
  });

  // 4. Update MongoDB contacts
  await db.contacts.updateOne(
    { _id: from_contact_id },
    {
      $set: {
        role: 'basic',
        is_lead_contact: false,
        'permissions.can_manage_contacts': false,
        'permissions.can_transfer_lead': false,
        updated_at: new Date()
      }
    }
  );

  await db.contacts.updateOne(
    { _id: to_contact_id },
    {
      $set: {
        role: 'lead',
        is_lead_contact: true,
        'permissions.can_view_org_tickets': true,
        'permissions.can_manage_contacts': true,
        'permissions.can_transfer_lead': true,
        updated_at: new Date()
      }
    }
  );

  // 5. Log audit
  await db.audit_log.insertOne({
    event_id: generateEventId(),
    event_type: 'lead_transfer',
    actor_type: 'customer',
    actor_id: from_contact_id,
    actor_email: fromContact.email,
    target_type: 'contact',
    target_id: to_contact_id,
    organization_id,
    details: {
      action: 'transfer_lead_role',
      from_contact: fromContact.email,
      to_contact: toContact.email,
      reason: pendingTransfer.reason
    },
    status: 'success',
    timestamp: new Date(),
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  });

  // 6. Send email notifications
  await sendEmail(fromContact.email, 'lead-transfer-completed', {
    newLead: toContact,
    organization: organization
  });

  await sendEmail(toContact.email, 'lead-role-granted', {
    previousLead: fromContact,
    organization: organization
  });
}
```

## 6. Edge Cases & Error Handling

### 6.1 Transfer to Inactive Contact

```typescript
if (toContact.status !== 'active') {
  return errorResponse(
    'CONTACT_NOT_ACTIVE',
    'Cannot transfer lead role to an inactive contact',
    'Select an active contact or reactivate the target contact first.'
  );
}
```

### 6.2 Only One Contact in Organization

```typescript
const activeContacts = await db.contacts.countDocuments({
  organization_id,
  status: 'active'
});

if (activeContacts < 2) {
  return errorResponse(
    'NO_TRANSFER_TARGET',
    'No other contacts available to transfer lead role',
    'Invite another contact before transferring the lead role.'
  );
}
```

### 6.3 Concurrent Transfer Attempts

```typescript
// Use Redis SETNX for lock
const lockKey = `lead-transfer-lock:${organization_id}`;
const locked = await redis.setnx(lockKey, confirmationId);

if (!locked) {
  const existingConfirmation = await redis.get(lockKey);
  return errorResponse(
    'TRANSFER_IN_PROGRESS',
    'A lead transfer is already pending for this organization',
    `Wait for the existing transfer to complete or expire. Confirmation ID: ${existingConfirmation}`
  );
}

// Set lock expiry same as confirmation TTL
await redis.expire(lockKey, 300);
```

### 6.4 Lead Leaves During Transfer

If the initiating lead's session expires or they log out during the confirmation window:

```typescript
// On confirmation, re-validate the initiator is still lead
const currentLeadContact = await db.contacts.findOne({
  organization_id,
  is_lead_contact: true
});

if (currentLeadContact._id.toString() !== pendingTransfer.from_contact_id) {
  return errorResponse(
    'LEAD_CHANGED',
    'The lead role has already changed',
    'The organization lead has been modified. Please refresh and try again.'
  );
}
```

## 7. UI Components

### 7.1 Contact Selection List

```tsx
<ContactList>
  {contacts.filter(c => c.id !== currentUser.id).map(contact => (
    <ContactCard
      key={contact.id}
      contact={contact}
      onSelect={() => handleSelectNewLead(contact)}
      disabled={contact.status !== 'active'}
    />
  ))}
</ContactList>
```

### 7.2 Transfer Confirmation Dialog

```tsx
<ApprovalCard
  title="Transfer Lead Role"
  confirmationId={confirmationId}
  message={confirmationMessage}
  onApprove={handleApprove}
  onReject={handleReject}
  destructive={true}
  confirmLabel="Transfer Lead Role"
  cancelLabel="Cancel"
/>
```

### 7.3 Success State

```tsx
<SuccessDialog
  title="Lead Role Transferred"
  message={`${newLead.name} is now the lead customer contact for ${organization.name}.`}
  onClose={() => navigate('/contacts')}
/>
```

## 8. Email Templates

### 8.1 To Previous Lead (Jane)

**Subject**: Lead role transferred for {organization_name}

```
Hi Jane,

You have successfully transferred the Lead Customer Contact role for
Acme Corporation to Bob Developer (bob.developer@acme.com).

Your new role: Basic Customer

What this means:
- You can still create and view your own support tickets
- You can no longer view other contacts' tickets
- You can no longer invite or manage contacts
- To regain lead access, contact the new lead (Bob Developer)

If you did not initiate this transfer, please contact support immediately.

Best regards,
Tamshai Support Team
```

### 8.2 To New Lead (Bob)

**Subject**: You are now the Lead Customer Contact for {organization_name}

```
Hi Bob,

Jane Smith has transferred the Lead Customer Contact role for
Acme Corporation to you.

Your new role: Lead Customer Contact

Your new capabilities:
- View all support tickets for your organization
- Invite new contacts to your organization
- Manage existing contacts
- Transfer the lead role to another contact

As the lead contact, you are the primary point of contact for
account-related matters.

Best regards,
Tamshai Support Team
```
