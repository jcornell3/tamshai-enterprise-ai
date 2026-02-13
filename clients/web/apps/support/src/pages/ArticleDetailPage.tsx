import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { KBArticle, KBArticleSummary, APIResponse } from '../types';

/**
 * Article Detail Page
 *
 * Features:
 * - Display KB article with markdown rendering
 * - Category badge and tags
 * - Author and last updated info
 * - Related articles section
 * - Feedback (thumbs up/down)
 * - Print and copy link buttons
 * - Breadcrumb navigation
 */
export default function ArticleDetailPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Fetch article details
  const {
    data: articleResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['article', articleId],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/get_knowledge_article?articleId=${encodeURIComponent(articleId!)}`
        : `/api/mcp/support/get_knowledge_article?articleId=${encodeURIComponent(articleId!)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch article');
      }

      return response.json() as Promise<APIResponse<KBArticle>>;
    },
    enabled: !!articleId,
  });

  // Fetch related articles
  const { data: relatedResponse } = useQuery({
    queryKey: ['related-articles', articleId],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const article = articleResponse?.data;
      if (!article) return { data: [] };

      // Search for related articles based on category and tags
      const query = [article.category, ...(article.tags || [])].slice(0, 3).join(' ');
      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/search_knowledge_base?query=${encodeURIComponent(query)}`
        : `/api/mcp/support/search_knowledge_base?query=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        return { data: [] };
      }

      const data = await response.json() as APIResponse<KBArticleSummary[]>;
      // Filter out current article and limit to 3
      const filtered = (data.data || []).filter((a) => (a as any).kb_id !== articleId && a.id !== articleId).slice(0, 3);
      return { ...data, data: filtered };
    },
    enabled: !!articleResponse?.data,
  });

  // Feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: async (feedback: 'positive' | 'negative') => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const url = apiConfig.mcpGatewayUrl
        ? `${apiConfig.mcpGatewayUrl}/api/mcp/support/article_feedback`
        : '/api/mcp/support/article_feedback';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ articleId, feedback }),
      });

      return { ok: response.ok };
    },
    onSuccess: (_, feedback) => {
      setFeedbackGiven(feedback);
    },
  });

  const article = articleResponse?.data;
  const relatedArticles = relatedResponse?.data || [];
  const isNotFound = articleResponse?.status === 'error' && articleResponse?.code === 'ARTICLE_NOT_FOUND';

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, []);

  const handleFeedback = (type: 'positive' | 'negative') => {
    if (!feedbackGiven) {
      feedbackMutation.mutate(type);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Escape HTML entities to prevent XSS attacks
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

  // Simple markdown to HTML converter
  // Security: HTML is escaped first to prevent XSS, then safe markdown is applied
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

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="py-12 text-center" data-testid="loading-state">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading article...</p>
        </div>
      </div>
    );
  }

  if (error || isNotFound) {
    return (
      <div className="page-container">
        <div className="card py-12 text-center" data-testid="error-state">
          <svg
            className="w-16 h-16 mx-auto text-secondary-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="text-lg font-medium text-secondary-900 mb-2">
            {isNotFound ? 'Article not found' : 'Error loading article'}
          </h3>
          <p className="text-secondary-600 mb-4">
            {isNotFound
              ? 'The article you are looking for does not exist or has been removed.'
              : String(error)}
          </p>
          <Link to="/knowledge-base" className="btn-primary" data-testid="back-button">
            Back to Knowledge Base
          </Link>
        </div>
      </div>
    );
  }

  if (!article) {
    return null;
  }

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <nav className="mb-6" aria-label="Breadcrumb" data-testid="breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-secondary-600">
          <li>
            <Link to="/knowledge-base" className="hover:text-secondary-900">
              Knowledge Base
            </Link>
          </li>
          <li>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </li>
          <li>
            <span className="text-secondary-400">{article.category}</span>
          </li>
          <li>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </li>
          <li className="font-medium text-secondary-900 truncate max-w-xs">
            {article.title}
          </li>
        </ol>
      </nav>

      {/* Back Button */}
      <div className="mb-6">
        <Link
          to="/knowledge-base"
          className="inline-flex items-center text-purple-600 hover:text-purple-700"
          data-testid="back-to-kb"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Knowledge Base
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Article Content */}
        <div className="lg:col-span-2">
          <article className="card" data-testid="article-content">
            {/* Article Header */}
            <header className="mb-6">
              <h1
                className="text-2xl font-bold text-secondary-900 mb-3"
                data-testid="article-title"
              >
                {article.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-secondary-600">
                <span
                  className="px-2 py-1 bg-purple-100 text-purple-700 rounded"
                  data-testid="article-category"
                >
                  {article.category}
                </span>
                {article.author && (
                  <span data-testid="article-author">By {article.author}</span>
                )}
                {article.updated_at && (
                  <span data-testid="article-updated">
                    Last updated: {formatDate(article.updated_at)}
                  </span>
                )}
              </div>
            </header>

            {/* Tags */}
            {article.tags && article.tags.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2" data-testid="article-tags">
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-secondary-100 text-secondary-600 rounded text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Article Body */}
            <div
              className="text-secondary-700"
              data-testid="article-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
            />

            {/* Actions */}
            <div className="mt-8 pt-6 border-t border-secondary-200 flex items-center justify-between">
              <div className="flex gap-3">
                <button
                  onClick={handlePrint}
                  className="btn-secondary text-sm"
                  data-testid="print-button"
                >
                  <svg
                    className="w-4 h-4 inline mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                  Print
                </button>
                <button
                  onClick={handleCopyLink}
                  className="btn-secondary text-sm"
                  data-testid="copy-link-button"
                >
                  <svg
                    className="w-4 h-4 inline mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                  {copySuccess ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            {/* Feedback Section */}
            <div
              className="mt-6 pt-6 border-t border-secondary-200"
              data-testid="feedback-section"
            >
              {feedbackGiven ? (
                <div className="text-center py-4" data-testid="feedback-thanks">
                  <p className="text-green-600 font-medium">
                    Thank you for your feedback!
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-secondary-700 mb-3" data-testid="feedback-prompt">
                    Was this article helpful?
                  </p>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => handleFeedback('positive')}
                      className="p-3 rounded-full hover:bg-green-100 transition-colors"
                      aria-label="Yes, this was helpful"
                      data-testid="thumbs-up"
                    >
                      <svg
                        className="w-8 h-8 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleFeedback('negative')}
                      className="p-3 rounded-full hover:bg-red-100 transition-colors"
                      aria-label="No, this was not helpful"
                      data-testid="thumbs-down"
                    >
                      <svg
                        className="w-8 h-8 text-red-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          {/* Related Articles */}
          <div className="card" data-testid="related-articles">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">
              Related Articles
            </h3>
            {relatedArticles.length === 0 ? (
              <p className="text-secondary-600 text-sm" data-testid="no-related-articles">
                No related articles found.
              </p>
            ) : (
              <div className="space-y-3">
                {relatedArticles.map((related) => (
                  <Link
                    key={related.id}
                    to={`/knowledge-base/${(related as any).kb_id || related.id}`}
                    className="block p-3 bg-secondary-50 hover:bg-secondary-100 rounded-lg transition-colors"
                    data-testid={`related-article-${related.id}`}
                  >
                    <p className="font-medium text-secondary-900 text-sm">
                      {related.title}
                    </p>
                    <p className="text-xs text-secondary-500 mt-1">
                      {related.category}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
