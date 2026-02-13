import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCustomerAuth } from '../auth';
import { apiConfig } from '../auth/config';

interface KBArticle {
  kb_id: string;
  title: string;
  category: string;
  summary?: string;
  tags?: string[];
  updated_at: string;
}

export default function KnowledgeBasePage() {
  const { accessToken } = useCustomerAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: articles, isLoading, error } = useQuery({
    queryKey: ['kbArticles', searchQuery, selectedCategory],
    queryFn: async () => {
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_search_kb`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            query: searchQuery || 'help',
            category: selectedCategory,
            limit: 20,
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to fetch articles');
      const result = await response.json();
      return result.data as KBArticle[];
    },
    enabled: !!accessToken,
  });

  const categories = [
    { value: 'getting-started', label: 'Getting Started' },
    { value: 'account', label: 'Account Management' },
    { value: 'billing', label: 'Billing & Payments' },
    { value: 'technical', label: 'Technical Guides' },
    { value: 'troubleshooting', label: 'Troubleshooting' },
    { value: 'faq', label: 'FAQ' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Knowledge Base</h1>
        <p className="mt-2 text-gray-600">Find answers to your questions</p>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for articles..."
            className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <svg
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
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
        </div>
      </div>

      {/* Categories */}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
            !selectedCategory
              ? 'bg-primary-100 text-primary-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All Topics
        </button>
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              selectedCategory === cat.value
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Articles grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">
          Failed to load articles. Please try again.
        </div>
      ) : !articles || articles.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="w-12 h-12 text-gray-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-gray-500">No articles found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your search or category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <ArticleCard key={article.kb_id} article={article} />
          ))}
        </div>
      )}

      {/* Help callout */}
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Can't find what you're looking for?</h2>
        <p className="mt-2 text-gray-600">
          Our support team is here to help. Create a ticket and we'll get back to you.
        </p>
        <Link
          to="/tickets/new"
          className="mt-4 inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700"
        >
          Contact Support
        </Link>
      </div>
    </div>
  );
}

function ArticleCard({ article }: { article: KBArticle }) {
  return (
    <Link
      to={`/knowledge-base/${article.kb_id}`}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-primary-200 transition-all"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-primary-600 uppercase tracking-wider">
          {article.category}
        </span>
      </div>
      <h3 className="mt-2 text-lg font-medium text-gray-900 line-clamp-2">{article.title}</h3>
      {article.summary && (
        <p className="mt-2 text-sm text-gray-500 line-clamp-3">{article.summary}</p>
      )}
      {article.tags && article.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1">
          {article.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-gray-400">
        Updated {new Date(article.updated_at).toLocaleDateString()}
      </p>
    </Link>
  );
}
