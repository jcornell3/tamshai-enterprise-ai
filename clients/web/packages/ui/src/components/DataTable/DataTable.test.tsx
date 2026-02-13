import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataTable, ColumnDef, BulkAction } from './DataTable';

// Test data
interface TestRow {
  id: string;
  name: string;
  amount: number;
  status: string;
  date: string;
}

const testData: TestRow[] = [
  { id: '1', name: 'Invoice A', amount: 1000, status: 'pending', date: '2024-01-15' },
  { id: '2', name: 'Invoice B', amount: 2500, status: 'approved', date: '2024-01-16' },
  { id: '3', name: 'Invoice C', amount: 750, status: 'pending', date: '2024-01-17' },
];

const testColumns: ColumnDef<TestRow>[] = [
  { id: 'name', header: 'Name', accessor: 'name' },
  { id: 'amount', header: 'Amount', accessor: 'amount', align: 'right' },
  { id: 'status', header: 'Status', accessor: 'status' },
];

const testBulkActions: BulkAction[] = [
  { id: 'approve', label: 'Approve', variant: 'primary' },
  { id: 'reject', label: 'Reject', variant: 'destructive' },
  { id: 'export', label: 'Export', variant: 'neutral' },
];

describe('DataTable', () => {
  describe('Basic Rendering', () => {
    it('renders table headers correctly', () => {
      render(<DataTable data={testData} columns={testColumns} keyField="id" />);

      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    });

    it('renders all data rows', () => {
      render(<DataTable data={testData} columns={testColumns} keyField="id" />);

      expect(screen.getByText('Invoice A')).toBeInTheDocument();
      expect(screen.getByText('Invoice B')).toBeInTheDocument();
      expect(screen.getByText('Invoice C')).toBeInTheDocument();
    });

    it('renders correct number of rows', () => {
      render(<DataTable data={testData} columns={testColumns} keyField="id" />);

      const rows = screen.getAllByRole('row');
      // 1 header row + 3 data rows
      expect(rows).toHaveLength(4);
    });
  });

  describe('Empty State', () => {
    it('renders empty state when no data', () => {
      render(
        <DataTable
          data={[]}
          columns={testColumns}
          keyField="id"
          emptyState={<div data-testid="empty-state">No invoices found</div>}
        />
      );

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No invoices found')).toBeInTheDocument();
    });

    it('renders default empty state when no custom provided', () => {
      render(<DataTable data={[]} columns={testColumns} keyField="id" />);

      expect(screen.getByText('No data available')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('renders skeleton loader when loading', () => {
      render(
        <DataTable data={[]} columns={testColumns} keyField="id" loading={true} />
      );

      expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
    });

    it('does not render data rows when loading', () => {
      render(
        <DataTable data={testData} columns={testColumns} keyField="id" loading={true} />
      );

      expect(screen.queryByText('Invoice A')).not.toBeInTheDocument();
    });
  });

  describe('Row Selection', () => {
    it('hides selection checkboxes by default', () => {
      render(<DataTable data={testData} columns={testColumns} keyField="id" />);

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('shows selection checkboxes when selectable is true', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      // 1 header checkbox + 3 row checkboxes
      expect(checkboxes).toHaveLength(4);
    });

    it('selects a single row on checkbox click', () => {
      const onSelectionChange = jest.fn();
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          onSelectionChange={onSelectionChange}
        />
      );

      const rowCheckboxes = screen.getAllByRole('checkbox');
      fireEvent.click(rowCheckboxes[1]); // First data row

      expect(onSelectionChange).toHaveBeenCalledWith(['1']);
    });

    it('deselects a row on second checkbox click', () => {
      const onSelectionChange = jest.fn();
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1']}
          onSelectionChange={onSelectionChange}
        />
      );

      const rowCheckboxes = screen.getAllByRole('checkbox');
      fireEvent.click(rowCheckboxes[1]); // First data row

      expect(onSelectionChange).toHaveBeenCalledWith([]);
    });

    it('selects all rows on header checkbox click', () => {
      const onSelectionChange = jest.fn();
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          onSelectionChange={onSelectionChange}
        />
      );

      const headerCheckbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(headerCheckbox);

      expect(onSelectionChange).toHaveBeenCalledWith(['1', '2', '3']);
    });

    it('deselects all rows when all are selected and header clicked', () => {
      const onSelectionChange = jest.fn();
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1', '2', '3']}
          onSelectionChange={onSelectionChange}
        />
      );

      const headerCheckbox = screen.getAllByRole('checkbox')[0];
      fireEvent.click(headerCheckbox);

      expect(onSelectionChange).toHaveBeenCalledWith([]);
    });

    it('shows indeterminate state when some rows selected', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1']}
        />
      );

      const headerCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
      expect(headerCheckbox.indeterminate).toBe(true);
    });

    it('applies selected styling to selected rows', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1']}
        />
      );

      const rows = screen.getAllByRole('row');
      expect(rows[1]).toHaveClass('bg-primary-50');
    });
  });

  describe('Bulk Action Toolbar', () => {
    it('hides bulk toolbar when no rows selected', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          bulkActions={testBulkActions}
        />
      );

      expect(screen.queryByTestId('bulk-action-toolbar')).not.toBeInTheDocument();
    });

    it('shows bulk toolbar when rows are selected', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1']}
          bulkActions={testBulkActions}
        />
      );

      expect(screen.getByTestId('bulk-action-toolbar')).toBeInTheDocument();
    });

    it('displays correct selection count', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1', '2']}
          bulkActions={testBulkActions}
        />
      );

      expect(screen.getByText('2 items selected')).toBeInTheDocument();
    });

    it('renders all bulk action buttons', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1']}
          bulkActions={testBulkActions}
        />
      );

      expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    });

    it('calls onBulkAction with action and selected items', () => {
      const onBulkAction = jest.fn();
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1', '2']}
          bulkActions={testBulkActions}
          onBulkAction={onBulkAction}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      expect(onBulkAction).toHaveBeenCalledWith('approve', [testData[0], testData[1]]);
    });

    it('has clear selection button', () => {
      const onSelectionChange = jest.fn();
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1', '2']}
          bulkActions={testBulkActions}
          onSelectionChange={onSelectionChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /clear/i }));

      expect(onSelectionChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Column Sorting', () => {
    it('shows sort indicator on sortable columns', () => {
      const sortableColumns: ColumnDef<TestRow>[] = [
        { id: 'name', header: 'Name', accessor: 'name', sortable: true },
        { id: 'amount', header: 'Amount', accessor: 'amount', sortable: true },
      ];

      render(
        <DataTable
          data={testData}
          columns={sortableColumns}
          keyField="id"
          sortable={true}
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    });

    it('calls onSort when clicking sortable column header', () => {
      const onSort = jest.fn();
      const sortableColumns: ColumnDef<TestRow>[] = [
        { id: 'name', header: 'Name', accessor: 'name', sortable: true },
      ];

      render(
        <DataTable
          data={testData}
          columns={sortableColumns}
          keyField="id"
          sortable={true}
          onSort={onSort}
        />
      );

      fireEvent.click(screen.getByRole('columnheader', { name: /name/i }));

      expect(onSort).toHaveBeenCalledWith('name', 'asc');
    });

    it('toggles sort direction on repeated clicks', () => {
      const onSort = jest.fn();
      const sortableColumns: ColumnDef<TestRow>[] = [
        { id: 'name', header: 'Name', accessor: 'name', sortable: true },
      ];

      render(
        <DataTable
          data={testData}
          columns={sortableColumns}
          keyField="id"
          sortable={true}
          sortedBy="name"
          sortDirection="asc"
          onSort={onSort}
        />
      );

      fireEvent.click(screen.getByRole('columnheader', { name: /name/i }));

      expect(onSort).toHaveBeenCalledWith('name', 'desc');
    });

    it('displays ascending sort indicator', () => {
      render(
        <DataTable
          data={testData}
          columns={[{ id: 'name', header: 'Name', accessor: 'name', sortable: true }]}
          keyField="id"
          sortable={true}
          sortedBy="name"
          sortDirection="asc"
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    });

    it('displays descending sort indicator', () => {
      render(
        <DataTable
          data={testData}
          columns={[{ id: 'name', header: 'Name', accessor: 'name', sortable: true }]}
          keyField="id"
          sortable={true}
          sortedBy="name"
          sortDirection="desc"
        />
      );

      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    });
  });

  describe('Frozen Header', () => {
    it('has sticky header class for scrollable tables', () => {
      render(
        <DataTable data={testData} columns={testColumns} keyField="id" stickyHeader={true} />
      );

      const thead = screen.getByRole('rowgroup', { name: /table header/i }) ||
                    screen.getAllByRole('rowgroup')[0];
      expect(thead).toHaveClass('sticky');
    });
  });

  describe('Row Actions', () => {
    it('renders row action column when provided', () => {
      const rowActions = (row: TestRow) => (
        <button data-testid={`action-${row.id}`}>View</button>
      );

      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          rowActions={rowActions}
        />
      );

      expect(screen.getByTestId('action-1')).toBeInTheDocument();
      expect(screen.getByTestId('action-2')).toBeInTheDocument();
      expect(screen.getByTestId('action-3')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    const largeData = Array.from({ length: 100 }, (_, i) => ({
      id: String(i + 1),
      name: `Invoice ${i + 1}`,
      amount: (i + 1) * 100,
      status: i % 2 === 0 ? 'pending' : 'approved',
      date: '2024-01-15',
    }));

    it('renders pagination controls when configured', () => {
      render(
        <DataTable
          data={largeData}
          columns={testColumns}
          keyField="id"
          pagination={{
            pageSize: 10,
            currentPage: 1,
            totalItems: 100,
            onPageChange: jest.fn(),
          }}
        />
      );

      expect(screen.getByTestId('pagination')).toBeInTheDocument();
    });

    it('calls onPageChange when page button clicked', () => {
      const onPageChange = jest.fn();
      render(
        <DataTable
          data={largeData.slice(0, 10)}
          columns={testColumns}
          keyField="id"
          pagination={{
            pageSize: 10,
            currentPage: 1,
            totalItems: 100,
            onPageChange,
          }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /next/i }));

      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('displays page info correctly', () => {
      render(
        <DataTable
          data={largeData.slice(0, 10)}
          columns={testColumns}
          keyField="id"
          pagination={{
            pageSize: 10,
            currentPage: 1,
            totalItems: 100,
            onPageChange: jest.fn(),
          }}
        />
      );

      expect(screen.getByText(/1-10 of 100/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper table ARIA attributes', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
        />
      );

      const table = screen.getByRole('grid');
      expect(table).toHaveAttribute('aria-multiselectable', 'true');
    });

    it('row checkboxes have proper aria-labels', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
        />
      );

      const rowCheckboxes = screen.getAllByRole('checkbox');
      expect(rowCheckboxes[1]).toHaveAttribute('aria-label', 'Select row: Invoice A');
    });

    it('bulk toolbar has toolbar role', () => {
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          keyField="id"
          selectable={true}
          selectedRows={['1']}
          bulkActions={testBulkActions}
        />
      );

      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });
  });

  describe('Custom Cell Rendering', () => {
    it('uses custom cell renderer when provided', () => {
      const columnsWithCustomRender: ColumnDef<TestRow>[] = [
        {
          id: 'status',
          header: 'Status',
          accessor: 'status',
          cell: (value: string) => (
            <span data-testid="custom-status" className={`badge-${value}`}>
              {value.toUpperCase()}
            </span>
          ),
        },
      ];

      render(
        <DataTable data={testData} columns={columnsWithCustomRender} keyField="id" />
      );

      const customCells = screen.getAllByTestId('custom-status');
      expect(customCells).toHaveLength(3);
      expect(customCells[0]).toHaveTextContent('PENDING');
    });
  });
});
