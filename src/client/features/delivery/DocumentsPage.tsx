import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DocumentContentPayload, DocumentDetail } from '../../../shared/delivery.js';
import { useAppState } from '../../state/appState';
import { fetchDocumentContent, fetchDocumentDetail, fetchDocuments } from './deliveryApi';

function contentLabel(payload: DocumentContentPayload | null): string {
  if (!payload) {
    return 'Not loaded';
  }

  if (payload.renderMode === 'unsupported') {
    return 'Unsupported format';
  }
  if (payload.renderMode === 'missing') {
    return 'Missing source';
  }
  return payload.renderMode.toUpperCase();
}

function formatJson(value: string | null): string {
  try {
    return JSON.stringify(JSON.parse(value ?? '{}'), null, 2);
  } catch {
    return value ?? '{}';
  }
}

export function DocumentsPage(): JSX.Element {
  const { dispatch: appDispatch } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState<DocumentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(searchParams.get('documentId'));
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const [contentPayload, setContentPayload] = useState<DocumentContentPayload | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>('');

  useEffect(() => {
    const queryDocumentId = searchParams.get('documentId');
    setSelectedDocumentId(queryDocumentId);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const items = await fetchDocuments(projectFilter ? { projectId: projectFilter } : {});
        if (cancelled) {
          return;
        }

        setDocuments(items);
        const preferredDocument = items.find((item) => item.id === selectedDocumentId) ?? items[0] ?? null;

        setSelectedDocumentId(preferredDocument?.id ?? null);
        if (preferredDocument) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('documentId', preferredDocument.id);
            return next;
          });
        }

        appDispatch({
          type: 'SET_MODULE_SYNC',
          module: 'documents',
          payload: {
            stale: false,
            status: 'ok',
            lastSuccessfulSyncAt: new Date().toISOString(),
            lastSuccessfulUpdateAt: new Date().toISOString()
          }
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load documents');
        appDispatch({
          type: 'SET_MODULE_SYNC',
          module: 'documents',
          payload: {
            stale: true,
            status: 'error'
          }
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appDispatch, projectFilter, selectedDocumentId, setSearchParams]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setSelectedDocument(null);
      setContentPayload(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setContentLoading(true);
      setError(null);

      try {
        const [detail, content] = await Promise.all([
          fetchDocumentDetail(selectedDocumentId),
          fetchDocumentContent(selectedDocumentId)
        ]);

        if (cancelled) {
          return;
        }

        setSelectedDocument(detail);
        setContentPayload(content);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load document preview');
      } finally {
        if (!cancelled) {
          setContentLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDocumentId]);

  const projectOptions = useMemo(() => {
    const deduped = new Map<string, string>();
    for (const document of documents) {
      if (!deduped.has(document.projectId)) {
        deduped.set(document.projectId, document.projectId);
      }
    }
    return [...deduped.values()];
  }, [documents]);

  const pdfBlobUrl = useMemo(() => {
    if (!contentPayload || contentPayload.renderMode !== 'pdf' || !contentPayload.contentBase64) {
      return null;
    }

    const binary = atob(contentPayload.contentBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }, [contentPayload]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Document Viewer</h1>
        <p className="text-sm text-[var(--muted-fg)]">
          Open project artifacts inline with strict MIME allowlisting and safe rendering boundaries.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Project filter
            <select
              className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
            >
              <option value="">All projects</option>
              {projectOptions.map((projectId) => (
                <option key={projectId} value={projectId}>
                  {projectId}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loading && <p className="text-sm text-[var(--muted-fg)]">Loading documents...</p>}
      {error && <p className="status-text-error text-sm">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <section className="rounded-lg border border-[var(--border)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[var(--muted)] text-left">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">MIME</th>
                  <th className="px-3 py-2">Project</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr
                    key={document.id}
                    className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--muted)] ${
                      selectedDocumentId === document.id ? 'bg-[var(--muted)]' : ''
                    }`}
                    onClick={() => {
                      setSelectedDocumentId(document.id);
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('documentId', document.id);
                        return next;
                      });
                    }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{document.title}</div>
                      <div className="text-xs text-[var(--muted-fg)]">{document.id}</div>
                    </td>
                    <td className="px-3 py-2">{document.mimeType}</td>
                    <td className="px-3 py-2">{document.projectId}</td>
                  </tr>
                ))}
                {!documents.length && !loading && (
                  <tr>
                    <td className="px-3 py-8 text-center text-[var(--muted-fg)]" colSpan={3}>
                      No documents found for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <h2 className="text-lg font-medium">Preview</h2>
          {!selectedDocumentId && <p className="text-sm text-[var(--muted-fg)]">Select a document to preview.</p>}
          {contentLoading && <p className="text-sm text-[var(--muted-fg)]">Loading preview...</p>}

          {selectedDocument && (
            <div className="rounded border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-fg)]">
              <p>
                <span className="font-medium text-[var(--fg)]">{selectedDocument.title}</span> | {selectedDocument.mimeType}
              </p>
              <p>
                Created: {new Date(selectedDocument.createdAt).toLocaleString()} | Checksum: {selectedDocument.checksum}
              </p>
              <p>Render mode: {contentLabel(contentPayload)}</p>
            </div>
          )}

          {contentPayload && (contentPayload.renderMode === 'unsupported' || contentPayload.renderMode === 'missing') && (
            <div className="status-panel-warning space-y-1 rounded-md p-3 text-sm">
              <p className="font-medium">Inline preview unavailable</p>
              <p>{contentPayload.guidance}</p>
            </div>
          )}

          {contentPayload?.renderMode === 'markdown' && (
            <article className="max-h-[32rem] overflow-auto rounded border border-[var(--border)] bg-[var(--panel)] p-3">
              <pre className="whitespace-pre-wrap break-words text-sm text-[var(--fg)]">{contentPayload.content ?? ''}</pre>
            </article>
          )}

          {contentPayload?.renderMode === 'json' && (
            <article className="max-h-[32rem] overflow-auto rounded border border-[var(--border)] bg-[var(--panel)] p-3">
              <pre className="whitespace-pre-wrap break-words text-sm text-[var(--fg)]">{formatJson(contentPayload.content)}</pre>
            </article>
          )}

          {contentPayload?.renderMode === 'pdf' && pdfBlobUrl && (
            <div className="rounded border border-[var(--border)] bg-[var(--panel)] p-2">
              <iframe
                title="PDF document preview"
                src={pdfBlobUrl}
                className="h-[32rem] w-full rounded border border-[var(--border)]"
                sandbox=""
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {contentPayload && (
            <p className="text-xs text-[var(--muted-fg)]">
              Safety: {contentPayload.safeToRenderInline ? 'Inline rendering allowed by MIME allowlist.' : 'Inline rendering blocked.'}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
