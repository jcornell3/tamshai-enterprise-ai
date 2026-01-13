/**
 * Elasticsearch Backend Adapter for MCP Support
 *
 * Wraps existing Elasticsearch query logic into the ISupportBackend interface.
 * Used in Dev/Stage environments where Elasticsearch is available.
 */

import { Client } from '@elastic/elasticsearch';
import {
  ISupportBackend,
  SupportTicket,
  KnowledgeArticle,
  SearchTicketsParams,
  SearchKnowledgeBaseParams,
  SearchResult,
} from './types';

/**
 * Cursor structure for Elasticsearch search_after pagination
 */
interface ElasticsearchCursor {
  sort: any[]; // Elasticsearch sort values
}

/**
 * Encode cursor for client transport
 */
function encodeCursor(cursor: ElasticsearchCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Decode cursor from client request
 */
function decodeCursor(encoded: string): ElasticsearchCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as ElasticsearchCursor;
  } catch {
    return null;
  }
}

/**
 * Elasticsearch backend implementation
 */
export class ElasticsearchBackend implements ISupportBackend {
  private client: Client;

  constructor(url: string) {
    this.client = new Client({ node: url });
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async searchTickets(params: SearchTicketsParams): Promise<SearchResult<SupportTicket>> {
    const { query, status, priority, limit, cursor, userContext } = params;

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Build query must clauses
    const must: any[] = [];
    if (query) {
      must.push({ multi_match: { query, fields: ['title', 'description', 'tags'] } });
    }
    if (status) {
      must.push({ term: { status } });
    }
    if (priority) {
      must.push({ term: { priority } });
    }

    // Role-based filtering
    const roleFilter: any[] = [];
    if (
      !userContext.roles.includes('executive') &&
      !userContext.roles.includes('support-read') &&
      !userContext.roles.includes('support-write')
    ) {
      roleFilter.push({ term: { created_by: userContext.userId } });
    }

    // v1.4: LIMIT+1 pattern to detect if more records exist
    const queryLimit = limit + 1;

    const searchBody: any = {
      query: {
        bool: {
          must: must.length > 0 ? must : [{ match_all: {} }],
          filter: roleFilter,
        },
      },
      size: queryLimit,
      sort: [{ created_at: 'desc' }], // Sort by created_at (date field)
    };

    // Add search_after if cursor provided
    if (cursorData) {
      searchBody.search_after = cursorData.sort;
    }

    const result = await this.client.search({
      index: 'support_tickets',
      body: searchBody,
    });

    const hits = result.hits.hits;
    const hasMore = hits.length > limit;
    const results = hasMore ? hits.slice(0, limit) : hits;

    // Map results to SupportTicket interface
    const tickets: SupportTicket[] = results.map((hit: any) => ({
      id: hit._id,
      ...hit._source,
    }));

    // Generate next cursor if more results exist
    let nextCursor: string | undefined;
    if (hasMore && results.length > 0) {
      const lastHit = results[results.length - 1];
      if (lastHit.sort) {
        nextCursor = encodeCursor({ sort: lastHit.sort as any[] });
      }
    }

    return {
      data: tickets,
      hasMore,
      nextCursor,
      totalCount: hasMore ? `${limit}+` : tickets.length.toString(),
    };
  }

  async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    // Search by ticket_id field (not Elasticsearch document _id)
    // Use ticket_id.keyword for exact match
    const result = await this.client.search({
      index: 'support_tickets',
      body: {
        query: {
          term: { 'ticket_id.keyword': ticketId },
        },
      },
    });

    if (result.hits.hits.length === 0) {
      return null;
    }

    const hit = result.hits.hits[0];
    return {
      ...(hit._source as any),
      _esDocId: hit._id, // Store ES doc ID for updates
    } as any;
  }

  async updateTicket(ticketId: string, updates: Partial<SupportTicket>): Promise<boolean> {
    // First, get the ES document ID
    const result = await this.client.search({
      index: 'support_tickets',
      body: {
        query: {
          term: { 'ticket_id.keyword': ticketId },
        },
      },
    });

    if (result.hits.hits.length === 0) {
      return false;
    }

    const esDocId = result.hits.hits[0]._id as string;

    // Update using ES document ID
    await this.client.update({
      index: 'support_tickets',
      id: esDocId,
      body: {
        doc: updates,
      },
    });

    return true;
  }

  async searchKnowledgeBase(params: SearchKnowledgeBaseParams): Promise<SearchResult<KnowledgeArticle>> {
    const { query, category, limit, cursor } = params;

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Build query
    const must: any[] = [{ multi_match: { query, fields: ['title^2', 'content', 'tags'] } }];

    if (category) {
      must.push({ term: { category } });
    }

    // v1.4: LIMIT+1 pattern
    const queryLimit = limit + 1;

    const searchBody: any = {
      query: {
        bool: {
          must,
        },
      },
      size: queryLimit,
      sort: [{ _score: 'desc' }, { _id: 'desc' }], // Sort by relevance, then _id
    };

    // Add search_after if cursor provided
    if (cursorData) {
      searchBody.search_after = cursorData.sort;
    }

    const result = await this.client.search({
      index: 'knowledge_base',
      body: searchBody,
    });

    const hits = result.hits.hits;
    const hasMore = hits.length > limit;
    const results = hasMore ? hits.slice(0, limit) : hits;

    // Map results to KnowledgeArticle interface
    const articles: KnowledgeArticle[] = results.map((hit: any) => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
    }));

    // Generate next cursor if more results exist
    let nextCursor: string | undefined;
    if (hasMore && results.length > 0) {
      const lastHit = results[results.length - 1];
      if (lastHit.sort) {
        nextCursor = encodeCursor({ sort: lastHit.sort as any[] });
      }
    }

    return {
      data: articles,
      hasMore,
      nextCursor,
      totalCount: hasMore ? `${limit}+` : articles.length.toString(),
    };
  }

  async getArticleById(articleId: string): Promise<KnowledgeArticle | null> {
    // Search by kb_id field (not Elasticsearch document _id)
    // Use kb_id.keyword for exact match
    const result = await this.client.search({
      index: 'knowledge_base',
      body: {
        query: {
          term: { 'kb_id.keyword': articleId },
        },
      },
    });

    if (result.hits.hits.length === 0) {
      return null;
    }

    const hit = result.hits.hits[0];
    return {
      id: hit._id,
      ...(hit._source as any),
    } as any;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
