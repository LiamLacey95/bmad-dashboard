import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/client/App';
import { AppStateProvider } from '../../src/client/state/appState';

function renderApp(initialEntry: string) {
  return render(
    <AppStateProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </AppStateProvider>
  );
}

describe('documents page', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/v1/documents/doc-101/content')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                document: {
                  id: 'doc-101',
                  projectId: 'project-core',
                  storyId: null,
                  title: 'Incident runbook',
                  mimeType: 'text/markdown',
                  storagePath: '/x',
                  checksum: 'sha256:1',
                  createdAt: '2026-02-19T12:00:00.000Z'
                },
                renderMode: 'markdown',
                safeToRenderInline: true,
                content: '# Incident Runbook\n\n- Verify stale state.',
                contentBase64: null,
                guidance: 'Inline markdown preview rendered as plain text for safe display.'
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/documents/doc-300/content')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                document: {
                  id: 'doc-300',
                  projectId: 'project-ui',
                  storyId: 'story-502',
                  title: 'Wireframe export',
                  mimeType: 'image/png',
                  storagePath: '/x',
                  checksum: 'sha256:2',
                  createdAt: '2026-02-19T13:00:00.000Z'
                },
                renderMode: 'unsupported',
                safeToRenderInline: false,
                content: null,
                contentBase64: null,
                guidance: 'This file type is not allowed for inline preview. Download the artifact or update the document MIME allowlist.'
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/documents/doc-101')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                id: 'doc-101',
                projectId: 'project-core',
                storyId: null,
                title: 'Incident runbook',
                mimeType: 'text/markdown',
                storagePath: '/x',
                checksum: 'sha256:1',
                createdAt: '2026-02-19T12:00:00.000Z'
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/documents/doc-300')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                id: 'doc-300',
                projectId: 'project-ui',
                storyId: 'story-502',
                title: 'Wireframe export',
                mimeType: 'image/png',
                storagePath: '/x',
                checksum: 'sha256:2',
                createdAt: '2026-02-19T13:00:00.000Z'
              }
            })
          } as Response;
        }

        if (url.includes('/api/v1/documents')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                items: [
                  {
                    id: 'doc-101',
                    projectId: 'project-core',
                    storyId: null,
                    title: 'Incident runbook',
                    mimeType: 'text/markdown',
                    storagePath: '/x',
                    checksum: 'sha256:1',
                    createdAt: '2026-02-19T12:00:00.000Z'
                  },
                  {
                    id: 'doc-300',
                    projectId: 'project-ui',
                    storyId: 'story-502',
                    title: 'Wireframe export',
                    mimeType: 'image/png',
                    storagePath: '/x',
                    checksum: 'sha256:2',
                    createdAt: '2026-02-19T13:00:00.000Z'
                  }
                ],
                total: 2
              }
            })
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({ data: { items: [] } })
        } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders markdown document inline', async () => {
    renderApp('/documents?documentId=doc-101');

    expect(await screen.findByRole('heading', { name: 'Document Viewer' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Render mode: MARKDOWN/i)).toBeInTheDocument();
      expect(screen.getByText(/Inline rendering allowed by MIME allowlist/i)).toBeInTheDocument();
    });
  });

  it('shows actionable fallback for unsupported documents', async () => {
    renderApp('/documents?documentId=doc-101');

    expect(await screen.findByRole('heading', { name: 'Document Viewer' })).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Wireframe export'));

    await waitFor(() => {
      expect(screen.getByText(/Inline preview unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/not allowed for inline preview/i)).toBeInTheDocument();
    });
  });
});
