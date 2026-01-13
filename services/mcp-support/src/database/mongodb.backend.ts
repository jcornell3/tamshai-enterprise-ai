/**
 * MongoDB Backend Adapter for MCP Support
 *
 * New MongoDB implementation for GCP Prod (Phase 1) where Elasticsearch
 * is not deployed due to cost constraints. Follows MCP Sales pattern.
 *
 * Note: Knowledge Base functions throw NOT_IMPLEMENTED errors since KB
 * requires Elasticsearch for full-text search.
 */

import { ObjectId } from 'mongodb';
import {
  ISupportBackend,
  SupportTicket,
  KnowledgeArticle,
  SearchTicketsParams,
  SearchKnowledgeBaseParams,
  SearchResult,
} from './types';
import { getCollection, buildRoleFilter, checkConnection as checkMongoConnection } from './connection';

/**
 * Cursor structure for MongoDB keyset pagination
 */
interface MongoDBCursor {
  _id: string; // MongoDB ObjectId as string
}

/**
 * Encode cursor for client transport
 */
function encodeCursor(cursor: MongoDBCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Decode cursor from client request
 */
function decodeCursor(encoded: string): MongoDBCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as MongoDBCursor;
  } catch {
    return null;
  }
}

/**
 * MongoDB backend implementation
 */
export class MongoDBBackend implements ISupportBackend {
  async checkConnection(): Promise<boolean> {
    return await checkMongoConnection();
  }

  async searchTickets(params: SearchTicketsParams): Promise<SearchResult<SupportTicket>> {
    const { query, status, priority, limit, cursor, userContext } = params;

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Get MongoDB collection
    const ticketsCollection = await getCollection('tickets');

    // Build role-based filter using connection module
    const roleFilter = buildRoleFilter(userContext);

    // Build MongoDB query filter
    const mongoFilter: any = { ...roleFilter };

    // Add status filter
    if (status) {
      mongoFilter.status = status;
    }

    // Add priority filter
    if (priority) {
      mongoFilter.priority = priority;
    }

    // Add text search filter if query provided
    // Note: This is basic regex search, not full-text search like Elasticsearch
    if (query) {
      mongoFilter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: { $regex: query, $options: 'i' } },
      ];
    }

    // Add cursor filter for pagination
    if (cursorData) {
      mongoFilter._id = { $lt: new ObjectId(cursorData._id) };
    }

    // v1.4: LIMIT+1 pattern to detect if more records exist
    const queryLimit = limit + 1;

    // Execute MongoDB query
    const results = await ticketsCollection
      .find(mongoFilter)
      .sort({ _id: -1 }) // Sort by _id descending (newest first)
      .limit(queryLimit)
      .toArray();

    // Check if more records exist
    const hasMore = results.length > limit;
    const tickets = hasMore ? results.slice(0, limit) : results;

    // Convert MongoDB _id to string for client
    const ticketsData: SupportTicket[] = tickets.map((ticket) => ({
      ...ticket,
      _id: ticket._id.toString(),
    })) as any[];

    // Generate next cursor if more results exist
    let nextCursor: string | undefined;
    if (hasMore && tickets.length > 0) {
      const lastTicket = tickets[tickets.length - 1];
      nextCursor = encodeCursor({ _id: lastTicket._id.toString() });
    }

    return {
      data: ticketsData,
      hasMore,
      nextCursor,
      totalCount: hasMore ? `${limit}+` : ticketsData.length.toString(),
    };
  }

  async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    const ticketsCollection = await getCollection('tickets');
    const ticket = await ticketsCollection.findOne({ ticket_id: ticketId });

    if (!ticket) {
      return null;
    }

    // Convert MongoDB _id to string
    return {
      ...ticket,
      _id: ticket._id.toString(),
    } as any;
  }

  async updateTicket(ticketId: string, updates: Partial<SupportTicket>): Promise<boolean> {
    const ticketsCollection = await getCollection('tickets');

    // Remove _id from updates if present (can't update _id field)
    const { _id, ...cleanUpdates } = updates as any;

    const result = await ticketsCollection.updateOne({ ticket_id: ticketId }, { $set: cleanUpdates });

    return result.matchedCount > 0;
  }

  async searchKnowledgeBase(params: SearchKnowledgeBaseParams): Promise<SearchResult<KnowledgeArticle>> {
    throw new Error(
      'NOT_IMPLEMENTED: Knowledge Base requires Elasticsearch (not deployed in GCP Phase 1). Only ticket search is available in MongoDB mode.'
    );
  }

  async getArticleById(articleId: string): Promise<KnowledgeArticle | null> {
    throw new Error(
      'NOT_IMPLEMENTED: Knowledge Base requires Elasticsearch (not deployed in GCP Phase 1). Only ticket operations are available in MongoDB mode.'
    );
  }

  async close(): Promise<void> {
    // MongoDB connection is managed by connection module
    // No explicit close needed for individual backend instances
  }
}
