import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCustomerAuth } from '../auth';
import { apiConfig } from '../auth/config';

interface KBArticle {
  kb_id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export default function ArticleDetailPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const { accessToken } = useCustomerAuth();

  const { data: article, isLoading, error } = useQuery({
    queryKey: ['kbArticle', articleId],
    queryFn: async () => {
      // For now, we'll use the search endpoint to get article details
      // In a full implementation, there would be a get_article endpoint
      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/tools/customer_search_kb`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ query: articleId, limit: 1 }),
        }
      );
      if (!response.ok) throw new Error('Failed to fetch article');
      const result = await response.json();
      return result.data?.[0] as KBArticle | undefined;
    },
    enabled: !!accessToken && !!articleId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Article not found.</p>
        <Link to="/knowledge-base" className="text-primary-600 hover:underline mt-2 inline-block">
          Back to Knowledge Base
        </Link>
      </div>
    );
  }

  const escapeHtml = (text: string): string => {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
    };
    return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
  };

  const renderMarkdown = (content: string) => {
    // First escape HTML to prevent XSS injection
    let html = escapeHtml(content);

    // Handle code blocks
    html = html.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      '<pre class="bg-secondary-800 text-secondary-100 p-4 rounded-lg overflow-x-auto my-4"><code>$2</code></pre>'
    );

    // Handle inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-secondary-100 px-1 rounded text-sm">$1</code>');

    // Handle headings
    html = html.replace(/^### (.*)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>');
    html = html.replace(/^## (.*)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3">$1</h2>');
    html = html.replace(/^# (.*)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>');

    // Handle lists
    html = html.replace(/^- (.*)$/gm, '<li class="ml-6 list-disc">$1</li>');
    html = html.replace(/^(\d+)\. (.*)$/gm, '<li class="ml-6 list-decimal">$2</li>');

    // Handle paragraphs
    html = html.replace(/\n\n/g, '</p><p class="mb-4">');

    return `<div class="prose max-w-none"><p class="mb-4">${html}</p></div>`;
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center text-sm text-gray-500 mb-6">
        <Link to="/knowledge-base" className="hover:text-primary-600">
          Knowledge Base
        </Link>
        <svg className="w-4 h-4 mx-2" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-gray-900 truncate">{article.title}</span>
      </nav>

      {/* Article */}
      <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {/* Header */}
        <header className="mb-8">
          <span className="text-sm font-medium text-primary-600 uppercase tracking-wider">
            {article.category}
          </span>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">{article.title}</h1>
          <div className="mt-4 flex items-center text-sm text-gray-500">
            <span>Last updated: {new Date(article.updated_at).toLocaleDateString()}</span>
          </div>
          {article.tags && article.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Content */}
        <div className="prose prose-primary max-w-none">
          {article.content ? (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }} />
          ) : (
            <p className="text-gray-500">Article content not available.</p>
          )}
        </div>
      </article>
      {/* Help callout */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Was this article helpful?</h2>
        <p className="mt-2 text-gray-600">
          If you still need help, our support team is ready to assist you.
        </p>
        <Link
          to="/tickets/new"
          className="mt-4 inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700"
        >
          Create Support Ticket
        </Link>
      </div>
    </div>
  );
}
