import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { Link } from 'react-router-dom';
import type { OrgChartNode, APIResponse } from '../types';

/**
 * Organization Chart Page
 *
 * Features:
 * - Hierarchical tree visualization
 * - Collapsible levels
 * - Search to highlight employee
 * - Click to view employee profile
 */
export default function OrgChartPage() {
  const { getAccessToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));

  // Fetch org chart data (API returns OrgChartNode[] array)
  const { data: orgChartResponse, isLoading, error } = useQuery({
    queryKey: ['org-chart'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/get_org_chart`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch org chart');
      return response.json() as Promise<APIResponse<OrgChartNode[]>>;
    },
  });

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!orgChartResponse?.data) return;
    const allIds = new Set<string>();
    const collectIds = (node: OrgChartNode) => {
      allIds.add(node.employee_id);
      node.direct_reports.forEach(collectIds);
    };
    // API returns array of root nodes
    const roots = orgChartResponse.data;
    roots.forEach(collectIds);
    setExpandedNodes(allIds);
  }, [orgChartResponse]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set(['root']));
  }, []);

  // Check if a node or its descendants match the search
  const matchesSearch = useCallback((node: OrgChartNode, query: string): boolean => {
    if (!query) return false;
    const lowerQuery = query.toLowerCase();
    if (
      node.name.toLowerCase().includes(lowerQuery) ||
      node.title.toLowerCase().includes(lowerQuery) ||
      node.department.toLowerCase().includes(lowerQuery)
    ) {
      return true;
    }
    return node.direct_reports.some((child) => matchesSearch(child, query));
  }, []);

  // API returns array of root nodes (typically one CEO)
  const orgChartRoots = orgChartResponse?.data;

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">Organization Chart</h2>
            <p className="page-subtitle">
              View company structure and reporting relationships
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={expandAll} className="btn-secondary text-sm">
              Expand All
            </button>
            <button onClick={collapseAll} className="btn-secondary text-sm">
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Search Employee
            </label>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400"
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
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10 w-full"
                placeholder="Search by name, title, or department..."
              />
            </div>
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="btn-secondary text-sm mt-6"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Org Chart */}
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="spinner mb-4"></div>
            <p className="text-secondary-600">Loading organization chart...</p>
          </div>
        ) : error ? (
          <div className="alert-danger">
            <p className="font-medium">Error loading org chart</p>
            <p className="text-sm">{String(error)}</p>
          </div>
        ) : !orgChartRoots || orgChartRoots.length === 0 ? (
          <div className="py-12 text-center text-secondary-600">
            <p>No organization data available</p>
          </div>
        ) : (
          <div className="p-6 min-w-max">
            {/* Render each root node (typically just one CEO) */}
            <div className="flex gap-8 justify-center">
              {orgChartRoots.map((rootNode) => (
                <OrgNode
                  key={rootNode.employee_id}
                  node={rootNode}
                  expandedNodes={expandedNodes}
                  onToggle={toggleNode}
                  searchQuery={searchQuery}
                  matchesSearch={matchesSearch}
                  isRoot
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 text-sm text-secondary-600 text-center">
        Click on employee cards to view their profile. Click the expand/collapse icon to show/hide direct reports.
      </div>
    </div>
  );
}

/**
 * Individual Org Chart Node
 */
function OrgNode({
  node,
  expandedNodes,
  onToggle,
  searchQuery,
  matchesSearch,
  isRoot = false,
}: {
  node: OrgChartNode;
  expandedNodes: Set<string>;
  onToggle: (id: string) => void;
  searchQuery: string;
  matchesSearch: (node: OrgChartNode, query: string) => boolean;
  isRoot?: boolean;
}) {
  const isExpanded = expandedNodes.has(node.employee_id);
  const hasChildren = node.direct_reports.length > 0;
  const isHighlighted = searchQuery && matchesSearch(node, searchQuery);
  const directMatch = searchQuery && (
    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`flex flex-col items-center ${isRoot ? '' : 'pt-4'}`}>
      {/* Vertical line from parent */}
      {!isRoot && (
        <div className="w-px h-4 bg-secondary-300" />
      )}

      {/* Node Card */}
      <div
        className={`relative rounded-lg border-2 p-4 min-w-[200px] transition-all ${
          directMatch
            ? 'border-primary-500 bg-primary-50 shadow-md'
            : isHighlighted
            ? 'border-primary-300 bg-primary-25'
            : 'border-secondary-200 bg-white hover:border-secondary-300 hover:shadow-sm'
        }`}
      >
        <Link
          to={`/employees/${node.employee_id}`}
          className="block text-center"
        >
          {/* Avatar */}
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-secondary-200 flex items-center justify-center overflow-hidden">
            {node.profile_photo_url ? (
              <img
                src={node.profile_photo_url}
                alt={node.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-secondary-400">
                {node.name.charAt(0)}
              </span>
            )}
          </div>

          {/* Name & Title */}
          <h4 className="font-semibold text-secondary-900">{node.name}</h4>
          <p className="text-sm text-secondary-600">{node.title}</p>
          <span className="badge-primary text-xs mt-2 inline-block">{node.department}</span>
        </Link>

        {/* Expand/Collapse Button */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onToggle(node.employee_id);
            }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-secondary-300 flex items-center justify-center hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <svg
              className={`w-4 h-4 text-secondary-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <>
          {/* Vertical line to children */}
          <div className="w-px h-4 bg-secondary-300" />

          {/* Horizontal line connecting children */}
          {node.direct_reports.length > 1 && (
            <div
              className="h-px bg-secondary-300"
              style={{
                width: `${(node.direct_reports.length - 1) * 220 + 100}px`,
              }}
            />
          )}

          {/* Child Nodes */}
          <div className="flex gap-4">
            {node.direct_reports.map((child) => (
              <OrgNode
                key={child.employee_id}
                node={child}
                expandedNodes={expandedNodes}
                onToggle={onToggle}
                searchQuery={searchQuery}
                matchesSearch={matchesSearch}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
