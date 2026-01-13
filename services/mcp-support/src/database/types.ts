/**
 * Backend-agnostic data access types for Support service
 *
 * This module defines interfaces that abstract away the underlying
 * data storage (Elasticsearch vs MongoDB) to allow environment-specific
 * backend selection via SUPPORT_DATA_BACKEND env var.
 */

/**
 * User context for authorization and filtering
 */
export interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
}

/**
 * Support ticket data model
 */
export interface SupportTicket {
  ticket_id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned_to?: string | null;
  tags?: string[];
  resolution?: string;
  closed_at?: string;
  closed_by?: string;
  // Backend-specific fields (added by implementations)
  _id?: string; // MongoDB ObjectId as string
  id?: string; // Elasticsearch document ID
  _esDocId?: string; // Elasticsearch document ID (for updates)
}

/**
 * Knowledge Base article data model
 */
export interface KnowledgeArticle {
  kb_id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  // Backend-specific fields (added by implementations)
  id?: string; // Elasticsearch document ID
  score?: number; // Elasticsearch relevance score
}

/**
 * Parameters for searching tickets
 */
export interface SearchTicketsParams {
  query?: string;
  status?: string;
  priority?: string;
  limit: number;
  cursor?: string;
  userContext: UserContext;
}

/**
 * Parameters for searching knowledge base
 */
export interface SearchKnowledgeBaseParams {
  query: string;
  category?: string;
  limit: number;
  cursor?: string;
}

/**
 * Generic search result with pagination
 */
export interface SearchResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
  totalCount?: string;
}

/**
 * Backend interface - implemented by both Elasticsearch and MongoDB adapters
 *
 * This interface abstracts the data layer to support multiple storage backends:
 * - ElasticsearchBackend: Full-text search, used in Dev/Stage
 * - MongoDBBackend: Document storage, used in GCP Prod (Phase 1)
 */
export interface ISupportBackend {
  /**
   * Check if backend connection is healthy
   */
  checkConnection(): Promise<boolean>;

  /**
   * Search support tickets with role-based filtering
   */
  searchTickets(params: SearchTicketsParams): Promise<SearchResult<SupportTicket>>;

  /**
   * Get a single ticket by ticket_id
   */
  getTicketById(ticketId: string): Promise<SupportTicket | null>;

  /**
   * Update ticket fields (used for close_ticket operation)
   */
  updateTicket(ticketId: string, updates: Partial<SupportTicket>): Promise<boolean>;

  /**
   * Search knowledge base articles
   * Note: May throw NOT_IMPLEMENTED error for MongoDB backend
   */
  searchKnowledgeBase(params: SearchKnowledgeBaseParams): Promise<SearchResult<KnowledgeArticle>>;

  /**
   * Get a single knowledge base article by kb_id
   * Note: May throw NOT_IMPLEMENTED error for MongoDB backend
   */
  getArticleById(articleId: string): Promise<KnowledgeArticle | null>;

  /**
   * Close backend connection (cleanup)
   */
  close(): Promise<void>;
}
