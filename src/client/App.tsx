import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { WorkflowsPage } from './features/workflows/WorkflowsPage';
import { RoutePage } from './pages/RoutePage';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route
          path="/projects"
          element={<RoutePage title="Project Health" description="Projects module scaffold." />}
        />
        <Route path="/costs" element={<RoutePage title="Cost Tracking" description="Costs module scaffold." />} />
        <Route
          path="/analytics"
          element={<RoutePage title="Agent Analytics" description="Analytics module scaffold." />}
        />
        <Route
          path="/documents"
          element={<RoutePage title="Document Viewer" description="Documents module scaffold." />}
        />
        <Route path="/kanban" element={<RoutePage title="Story Kanban" description="Kanban module scaffold." />} />
        <Route path="*" element={<Navigate to="/workflows" replace />} />
      </Route>
    </Routes>
  );
}
