# Customer Support Portal - API Contracts

## 1. Overview

This document defines the API contracts for the Customer Support Portal, including request/response schemas for all endpoints.

## 2. Base URL

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:8100/api` |
| Staging | `https://www.tamshai.com/api` |
| Production | `https://api.tamshai.com/api` |

## 3. Authentication

All endpoints require a valid JWT token from the `tamshai-customers` realm.

```http
Authorization: Bearer <access_token>
```

## 4. Customer Ticket Endpoints

### 4.1 List Tickets

**GET** `/customer/tickets`

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | `all` | Filter: `open`, `pending`, `resolved`, `closed`, `all` |
| `priority` | string | - | Filter: `critical`, `high`, `medium`, `low` |
| `limit` | number | 20 | Max: 50 |
| `offset` | number | 0 | Pagination offset |
| `sort` | string | `created_at` | Sort field |
| `order` | string | `desc` | Sort order: `asc`, `desc` |

**Response** `200 OK`:
```json
{
  "tickets": [
    {
      "ticket_id": "TKT-2024-0001",
      "subject": "Unable to access dashboard",
      "status": "open",
      "priority": "high",
      "category": "Technical > Access Issues",
      "created_at": "2024-12-15T09:00:00Z",
      "updated_at": "2024-12-15T10:30:00Z",
      "created_by": {
        "name": "Jane Smith",
        "email": "jane.smith@acme.com"
      },
      "assigned_to": "Bob Support",
      "sla_status": "on_track",
      "comment_count": 3
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

---

### 4.2 Get Ticket Detail

**GET** `/customer/tickets/:ticket_id`

**Response** `200 OK`:
```json
{
  "ticket_id": "TKT-2024-0001",
  "subject": "Unable to access dashboard",
  "description": "After the latest update, I can no longer access the analytics dashboard...",
  "status": "open",
  "priority": "high",
  "category": "Technical > Access Issues",
  "created_at": "2024-12-15T09:00:00Z",
  "updated_at": "2024-12-15T10:30:00Z",
  "created_by": {
    "name": "Jane Smith",
    "email": "jane.smith@acme.com"
  },
  "assigned_to": {
    "name": "Bob Support"
  },
  "sla_status": {
    "response": "met",
    "resolution": "on_track",
    "resolution_due": "2024-12-16T09:00:00Z"
  },
  "comments": [
    {
      "comment_id": "cmt-001",
      "author_type": "agent",
      "author_name": "Bob Support",
      "content": "Thank you for your patience. We are investigating this issue.",
      "created_at": "2024-12-15T10:15:00Z"
    },
    {
      "comment_id": "cmt-002",
      "author_type": "customer",
      "author_name": "Jane Smith",
      "content": "I tried clearing my cache but the issue persists.",
      "created_at": "2024-12-15T10:30:00Z"
    }
  ],
  "attachments": [
    {
      "filename": "screenshot.png",
      "size": 245000,
      "mime_type": "image/png",
      "uploaded_at": "2024-12-15T09:05:00Z"
    }
  ]
}
```

**Response** `403 Forbidden` (basic customer accessing org ticket):
```json
{
  "error": "ACCESS_DENIED",
  "message": "You can only view your own tickets"
}
```

---

### 4.3 Create Ticket

**POST** `/customer/tickets`

**Request Body**:
```json
{
  "subject": "Unable to access dashboard",
  "description": "After the latest update, I can no longer access...",
  "category": "Technical > Access Issues",
  "priority": "high",
  "visibility": "organization"
}
```

**Response** `201 Created`:
```json
{
  "ticket_id": "TKT-2024-0002",
  "message": "Ticket created successfully",
  "sla": {
    "response_due": "2024-12-15T13:00:00Z",
    "resolution_due": "2024-12-16T09:00:00Z"
  }
}
```

**Response** `400 Bad Request` (validation error):
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": {
    "subject": "Subject is required",
    "description": "Description must be at least 20 characters"
  }
}
```

---

### 4.4 Add Comment

**POST** `/customer/tickets/:ticket_id/comments`

**Request Body**:
```json
{
  "content": "I tried the suggested solution and it worked. Thank you!"
}
```

**Response** `201 Created`:
```json
{
  "comment_id": "cmt-003",
  "message": "Comment added successfully"
}
```

---

## 5. Knowledge Base Endpoints

### 5.1 Search KB

**GET** `/customer/kb/search`

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | required | Search query |
| `category` | string | - | Filter by category |
| `limit` | number | 10 | Max: 50 |

**Response** `200 OK`:
```json
{
  "articles": [
    {
      "article_id": "kb-001",
      "title": "How to Reset Your Password",
      "category": "Troubleshooting > Login Issues",
      "summary": "If you've forgotten your password, follow these steps...",
      "relevance_score": 0.95,
      "views": 1234,
      "helpful_percentage": 89,
      "updated_at": "2024-01-15T00:00:00Z"
    }
  ],
  "total": 5
}
```

---

### 5.2 Get KB Article

**GET** `/customer/kb/:article_id`

**Response** `200 OK`:
```json
{
  "article_id": "kb-001",
  "title": "How to Reset Your Password",
  "category": "Troubleshooting > Login Issues",
  "content": "# How to Reset Your Password\n\nIf you've forgotten...",
  "tags": ["password", "login", "security"],
  "views": 1234,
  "helpful_votes": {
    "yes": 890,
    "no": 110
  },
  "related_articles": [
    {
      "article_id": "kb-002",
      "title": "Two-Factor Authentication Setup"
    }
  ],
  "updated_at": "2024-01-15T00:00:00Z"
}
```

---

## 6. Contact Management Endpoints (Lead Only)

### 6.1 List Contacts

**GET** `/customer/contacts`

**Response** `200 OK`:
```json
{
  "contacts": [
    {
      "contact_id": "contact-001",
      "email": "jane.smith@acme.com",
      "name": "Jane Smith",
      "role": "lead",
      "status": "active",
      "last_login": "2024-12-15T09:30:00Z",
      "ticket_count": 12
    },
    {
      "contact_id": "contact-002",
      "email": "bob.developer@acme.com",
      "name": "Bob Developer",
      "role": "basic",
      "status": "active",
      "last_login": "2024-12-14T15:00:00Z",
      "ticket_count": 5
    }
  ],
  "organization": {
    "name": "Acme Corporation",
    "max_contacts": 20,
    "current_contacts": 2
  }
}
```

**Response** `403 Forbidden` (basic customer):
```json
{
  "error": "LEAD_REQUIRED",
  "message": "Only lead contacts can manage organization contacts"
}
```

---

### 6.2 Invite Contact

**POST** `/customer/contacts/invite`

**Request Body**:
```json
{
  "email": "new.contact@acme.com",
  "first_name": "New",
  "last_name": "Contact"
}
```

**Response** `202 Accepted` (pending_confirmation):
```json
{
  "status": "pending_confirmation",
  "confirmationId": "conf-invite-xyz789",
  "message": "Invite new contact to Acme Corporation?\n\nEmail: new.contact@acme.com\nName: New Contact\nRole: Basic Customer\n\nThis will send an invitation email.\nCurrent contacts: 2 of 20 allowed.",
  "confirmationData": {
    "action": "invite_contact",
    "email": "new.contact@acme.com"
  }
}
```

---

### 6.3 Transfer Lead Role

**POST** `/customer/contacts/transfer-lead`

**Request Body**:
```json
{
  "new_lead_contact_id": "contact-002",
  "reason": "Changing primary contact"
}
```

**Response** `202 Accepted` (pending_confirmation):
```json
{
  "status": "pending_confirmation",
  "confirmationId": "conf-lead-transfer-abc123",
  "message": "Transfer Lead Customer role?\n\nFrom: Jane Smith (jane.smith@acme.com)\nTo: Bob Developer (bob.developer@acme.com)\nOrganization: Acme Corporation\n\nThis action will:\n- Remove your lead privileges\n- Grant lead privileges to Bob Developer\n- You will become a basic customer\n\nThis action is logged for compliance.",
  "confirmationData": {
    "action": "transfer_lead",
    "from_contact_id": "contact-001",
    "to_contact_id": "contact-002"
  }
}
```

---

## 7. Confirmation Endpoint

### 7.1 Execute Confirmation

**POST** `/confirm/:confirmationId`

**Request Body**:
```json
{
  "approved": true
}
```

**Response** `200 OK` (approved):
```json
{
  "status": "success",
  "result": {
    "action": "transfer_lead",
    "message": "Lead role transferred successfully",
    "new_lead": {
      "name": "Bob Developer",
      "email": "bob.developer@acme.com"
    }
  }
}
```

**Response** `200 OK` (rejected):
```json
{
  "status": "cancelled",
  "message": "Operation cancelled by user"
}
```

**Response** `404 Not Found` (expired):
```json
{
  "error": "CONFIRMATION_EXPIRED",
  "message": "Confirmation has expired or was not found"
}
```

---

## 8. Error Responses

### 8.1 Standard Error Format

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional context"
  }
}
```

### 8.2 Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `ACCESS_DENIED` | 403 | User lacks permission |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `LEAD_REQUIRED` | 403 | Action requires lead role |
| `TICKET_LIMIT_REACHED` | 429 | Monthly ticket limit exceeded |
| `CONTACT_LIMIT_REACHED` | 429 | Organization contact limit |
| `ORG_NOT_ACTIVE` | 403 | Organization subscription inactive |

---

## 9. MCP Query Endpoint

### 9.1 SSE Query Stream

**POST** `/query`

**Request Body**:
```json
{
  "query": "Show my open tickets"
}
```

**Response**: Server-Sent Events stream

```
event: message
data: {"type":"text","content":"I found 3 open tickets for your organization..."}

event: message
data: {"type":"tool_use","name":"customer_list_tickets","input":{"status":"open"}}

event: message
data: {"type":"tool_result","content":[{"ticket_id":"TKT-001",...}]}

event: message
data: {"type":"text","content":"Here are your open tickets:\n\n1. TKT-001: ..."}

event: done
data: {"usage":{"input_tokens":150,"output_tokens":200}}
```

---

## 10. Rate Limits

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `GET /customer/tickets` | 60 req | 1 min |
| `POST /customer/tickets` | 10 req | 1 min |
| `GET /customer/kb/search` | 30 req | 1 min |
| `POST /query` | 20 req | 1 min |
| `POST /customer/contacts/invite` | 5 req | 1 hour |

Rate limit headers:
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1702648800
```
