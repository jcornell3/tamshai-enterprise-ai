/**
 * New Pay Run Page
 *
 * Hosts the PayRunWizard for creating new pay runs.
 */
import PayRunWizard from '../components/PayRunWizard';

export default function NewPayRunPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Pay Run</h1>
        <p className="text-gray-500 mt-1">Process payroll for your employees</p>
      </div>

      <PayRunWizard />
    </div>
  );
}
