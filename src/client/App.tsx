import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { CostsPage } from './features/costs/CostsPage';
import { KanbanPage } from './features/delivery/KanbanPage';
import { ProjectsPage } from './features/delivery/ProjectsPage';
import { WorkflowsPage } from './features/workflows/WorkflowsPage';
import { RoutePage } from './pages/RoutePage';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/costs" element={<CostsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route
          path="/documents"
          element={<RoutePage title="Document Viewer" description="Documents module scaffold." />}
        />
        <Route path="/kanban" element={<KanbanPage />} />
        <Route path="*" element={<Navigate to="/workflows" replace />} />
      </Route>
    </Routes>
  );
}
