import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { TruncationWarning } from '@tamshai/ui';
import type { KBArticle, APIResponse } from '../types';

/**
 * Knowledge Base Page
 *
 * Features:
 * - Full-text search for knowledge base articles
 * - Relevance-based sorting
 * - Category filtering
 * - Cursor-based pagination
 */
export default function KnowledgeBasePage() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Fetch knowledge base articles
  const { data: articlesResponse, isLoading, error } = useQuery({
    queryKey: ['knowledgebase', activeSearch, categoryFilter],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      // Helper to build URL
      const buildUrl = (cursor?: string): string => {
        const params = new URLSearchParams();
        if (activeSearch) params.append('query', activeSearch);
        if (categoryFilter) params.append('category', categoryFilter);
        if (cursor) params.append('cursor', cursor);

        const queryString = params.toString();
        if (apiConfig.mcpGatewayUrl) {
          return `${apiConfig.mcpGatewayUrl}/api/mcp/support/search_knowledge_base${queryString ? '?' + queryString : ''}`;
        } else {
          return `/api/mcp/support/search_knowledge_base${queryString ? '?' + queryString : ''}`;
        }
      };

      // Fetch all pages automatically
      const allArticles: KBArticle[] = [];
      let cursor: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 10;

      do {
        const response = await fetch(buildUrl(cursor), {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch articles');
        }

        const pageData = await response.json() as APIResponse<KBArticle[]>;

        if (pageData.data) {
          allArticles.push(...pageData.data);
        }

        cursor = pageData.metadata?.hasMore ? pageData.metadata.nextCursor : undefined;
        pageCount++;

      } while (cursor && pageCount < maxPages);

      return {
        status: 'success' as const,
        data: allArticles,
        metadata: {
          hasMore: false,
          returnedCount: allArticles.length,
          totalEstimate: allArticles.length.toString(),
        }
      } as APIResponse<KBArticle[]>;
    },
    enabled: true, // Load all articles on mount; search narrows results
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveSearch(searchQuery);
    }
  };

  const articles = articlesResponse?.data || [];
  const isTruncated = articlesResponse?.metadata?.hasMore || articlesResponse?.metadata?.truncated || false;

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Knowledge Base</h2>
        <p className="page-subtitle">
          Search documentation and help articles
        </p>
      </div>

      {/* Search Box */}
      <div className="card mb-6">
        <form onSubmit={handleSearch}>
          <label className="block text-sm font-medium text-secondary-700 mb-2">
            Search Knowledge Base
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g., password reset, VPN setup, email configuration"
              className="input flex-1"
            />
            <button
              type="submit"
              disabled={!searchQuery.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5 inline mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Search
            </button>
          </div>
        </form>

        {/* Quick search suggestions */}
        <div className="mt-4">
          <p className="text-sm font-medium text-secondary-700 mb-2">
            Popular topics:
          </p>
          <div className="flex flex-wrap gap-2">
            {['authentication', 'RBAC permissions', 'AI queries', 'budget reports', 'sales pipeline'].map((topic) => (
              <button
                key={topic}
                onClick={() => {
                  setSearchQuery(topic);
                  setActiveSearch(topic);
                }}
                className="text-xs px-3 py-1 bg-secondary-100 hover:bg-secondary-200 text-secondary-700 rounded-full transition-colors"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category Filter (shown after search) */}
      {activeSearch && (
        <div className="card mb-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Filter by Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input"
              >
                <option value="">All Categories</option>
                <option value="account">Account</option>
                <option value="network">Network</option>
                <option value="software">Software</option>
                <option value="hardware">Hardware</option>
                <option value="security">Security</option>
              </select>
            </div>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['knowledgebase'] })}
              className="btn-secondary"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Truncation Warning */}
      {isTruncated && articlesResponse?.metadata && (
        <div className="mb-6">
          <TruncationWarning
            message="More articles match your search than can be shown on one page."
            returnedCount={articlesResponse.metadata.returnedCount || 50}
            totalEstimate={articlesResponse.metadata.totalEstimate || articlesResponse.metadata.totalCount || '50+'}
          />
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="card py-12 text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Searching articles...</p>
        </div>
      ) : error ? (
        <div className="alert-danger">
          <p className="font-medium">Error searching knowledge base</p>
          <p className="text-sm">{String(error)}</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="card py-12 text-center text-secondary-600">
          <p>No articles found for "{activeSearch}"</p>
          <p className="text-sm mt-2">Try different keywords or check the spelling</p>
        </div>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => (
            <Link
              key={article.kb_id || article.id}
              to={`/knowledge-base/${article.kb_id || article.id}`}
              className="card hover:shadow-md transition-shadow block"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-secondary-900 mb-1">
                    {article.title}
                  </h3>
                  <p className="text-secondary-600 text-sm line-clamp-2 mb-3">
                    {article.content}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-secondary-500">
                    {article.category && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                        {article.category}
                      </span>
                    )}
                    {article.tags?.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-secondary-100 text-secondary-600 rounded">
                        {tag}
                      </span>
                    ))}
                    {article.score && (
                      <span className="text-secondary-400">
                        Relevance: {Math.round(article.score * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Stats */}
      {activeSearch && articles.length > 0 && (
        <div className="mt-6 text-sm text-secondary-600 text-center">
          Found {articles.length} article{articles.length !== 1 ? 's' : ''} for "{activeSearch}"
          {categoryFilter && ` in ${categoryFilter}`}
        </div>
      )}
    </div>
  );
}
