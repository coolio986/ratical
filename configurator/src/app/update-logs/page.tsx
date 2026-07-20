/** page.tsx — Next.js App-Router page. See docs/ARCHITECTURE.md §4. */
import { UpdateLogsViewer } from '@/app/update-logs/_components/update-logs-viewer';
import { UpdateLogsErrorBoundary } from '@/app/update-logs/_components/update-logs-error-boundary';

export default function UpdateLogsPage() {
	return (
		<UpdateLogsErrorBoundary>
			<UpdateLogsViewer />
		</UpdateLogsErrorBoundary>
	);
}
