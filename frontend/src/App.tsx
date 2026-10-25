import { useMemo, useState, useEffect } from 'react';
import './App.css';

const STEPS = [
  'Review pull requests',
  'Merge release branch',
  'Run automated tests',
  'Check environment variables',
  'Verify database migrations',
  'Build production bundle',
  'Deploy to staging',
  'Run smoke tests',
  'Deploy to production',
  'Verify production health',
];

type ReleaseStatus = 'planned' | 'ongoing' | 'done';

type Release = {
  id: string;
  name: string;
  date: string;
  additionalInfo: string;
  completedSteps: number[];
};

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000/graphql";

async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();

  if (!response.ok || result.errors) {
    throw new Error(
      result.errors?.[0]?.message ?? 'GraphQL request failed'
    );
  }

  return result.data as T;
}

type ApiRelease = {
  id: string;
  name: string;
  date: string;
  additionalInfo: string;
  completedSteps: number[];
  status: string;
};

function getStatus(release: Release): ReleaseStatus {
  if (release.completedSteps.length === 0) return 'planned';
  if (release.completedSteps.length === STEPS.length) return 'done';
  return 'ongoing';
}

function formatDate(date: string) {
  if (!date) return 'No date';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function App() {
  // ✅ ALL hooks at the very top (correct order)
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    name: '',
    date: '',
    additionalInfo: '',
  });
  const [apiError, setApiError] = useState('');

  // ✅ Fetch releases on mount
  useEffect(() => {
    graphqlRequest<{ releases: ApiRelease[] }>(`
      query {
        releases {
          id
          name
          date
          additionalInfo
          completedSteps
          status
        }
      }
    `)
      .then((data) => {
        setReleases(data.releases);
        setApiError('');
      })
      .catch((error: Error) => {
        setApiError(error.message);
      });
  }, []);

  // ✅ Derived values (no hooks, just computed)
  const selected = releases.find((release) => release.id === selectedId);

  const progress = selected
    ? Math.round((selected.completedSteps.length / STEPS.length) * 100)
    : 0;

  const filteredReleases = useMemo(() => {
    return releases.filter((release) => {
      const matchesSearch = release.name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesFilter =
        filter === 'all' || getStatus(release) === filter;
      return matchesSearch && matchesFilter;
    });
  }, [releases, search, filter]);

  const counts = {
    all: releases.length,
    planned: releases.filter((r) => getStatus(r) === 'planned').length,
    ongoing: releases.filter((r) => getStatus(r) === 'ongoing').length,
    done: releases.filter((r) => getStatus(r) === 'done').length,
  };

  // ---------- Mutation handlers ----------

  async function createRelease(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError('');

    try {
      const data = await graphqlRequest<{ createRelease: ApiRelease }>(
        `mutation CreateRelease(
          $name: String!,
          $date: String!,
          $additionalInfo: String
        ) {
          createRelease(
            name: $name,
            date: $date,
            additionalInfo: $additionalInfo
          ) {
            id name date additionalInfo completedSteps status
          }
        }`,
        {
          name: form.name.trim(),
          date: form.date,
          additionalInfo: form.additionalInfo.trim(),
        }
      );

      const release = data.createRelease;
      setReleases((current) => [release, ...current]);
      setSelectedId(release.id);
      setForm({ name: '', date: '', additionalInfo: '' });
      setShowModal(false);
      setEditingInfo(false);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : 'Could not create release'
      );
    }
  }

  async function toggleStep(stepIndex: number) {
    if (!selected) return;
    setApiError('');

    const completed = !selected.completedSteps.includes(stepIndex);

    try {
      const data = await graphqlRequest<{ toggleStep: ApiRelease }>(
        `mutation ToggleStep(
          $id: ID!,
          $stepIndex: Int!,
          $completed: Boolean!
        ) {
          toggleStep(id: $id, stepIndex: $stepIndex, completed: $completed) {
            id name date additionalInfo completedSteps status
          }
        }`,
        {
          id: selected.id,
          stepIndex,
          completed,
        }
      );

      const updated = data.toggleStep;
      setReleases((current) =>
        current.map((release) =>
          release.id === updated.id ? updated : release
        )
      );
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : 'Could not update checklist'
      );
    }
  }

  async function updateInfo(additionalInfo: string) {
    if (!selected) return;
    setApiError('');

    try {
      const data = await graphqlRequest<{ updateRelease: ApiRelease }>(
        `mutation UpdateRelease($id: ID!, $additionalInfo: String) {
          updateRelease(id: $id, additionalInfo: $additionalInfo) {
            id name date additionalInfo completedSteps status
          }
        }`,
        {
          id: selected.id,
          additionalInfo,
        }
      );

      const updated = data.updateRelease;
      setReleases((current) =>
        current.map((release) =>
          release.id === updated.id ? updated : release
        )
      );
      setEditingInfo(false);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : 'Could not save information'
      );
    }
  }

  async function deleteRelease(id: string) {
    if (!window.confirm('Delete this release permanently?')) return;
    setApiError('');

    try {
      await graphqlRequest<{ deleteRelease: boolean }>(
        `mutation DeleteRelease($id: ID!) {
          deleteRelease(id: $id)
        }`,
        { id }
      );

      setReleases((current) =>
        current.filter((release) => release.id !== id)
      );
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : 'Could not delete release'
      );
    }
  }

  // ---------- Render ----------

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setSelectedId(null)}>
          <span className="brand-icon">R</span>
          <span>
            release<span className="brand-light">flow</span>
          </span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item active" onClick={() => setSelectedId(null)}>
          <span>▦</span> All releases
          <span className="nav-count">{counts.all}</span>
        </button>

        <div className="sidebar-label status-label">STATUS</div>
        {(['planned', 'ongoing', 'done'] as const).map((status) => (
          <button
            className="nav-item"
            key={status}
            onClick={() => {
              setSelectedId(null);
              setFilter(filter === status ? 'all' : status);
            }}
          >
            <span className={`status-dot ${status}`} />
            <span className="capitalize">{status}</span>
            <span className="nav-count">{counts[status]}</span>
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="avatar">P</div>
          <div>
            <strong>My workspace</strong>
            <span>Release manager</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> Releases
          </div>
          <button
            className="primary-button"
            onClick={() => setShowModal(true)}
          >
            <span>＋</span> New release
          </button>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" /> RELEASE MANAGEMENT
            </div>
            <h1>{selected ? selected.name : 'Release overview'}</h1>
            <p>
              {selected
                ? 'Track your release checklist and ship with confidence.'
                : 'Plan, track, and ship your releases with confidence.'}
            </p>
          </div>
          {selected && (
            <button
              className="secondary-button"
              onClick={() => setSelectedId(null)}
            >
              ← All releases
            </button>
          )}
        </section>

        {/* ⚠️ Optional: show API error banner */}
        {apiError && (
          <div
            className="api-error"
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: 8,
              marginBottom: '1rem',
            }}
          >
            {apiError}
          </div>
        )}

        {!selected ? (
          <>
            <section className="stats-grid">
              <StatCard label="Total releases" value={counts.all} icon="▦" />
              <StatCard label="Planned" value={counts.planned} icon="◷" />
              <StatCard label="In progress" value={counts.ongoing} icon="↗" />
              <StatCard label="Completed" value={counts.done} icon="✓" />
            </section>

            <section className="release-section">
              <div className="section-heading">
                <div>
                  <h2>All releases</h2>
                  <p>Your release pipeline at a glance</p>
                </div>
                <div className="toolbar">
                  <input
                    className="search-input"
                    placeholder="⌕  Search releases..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search releases"
                  />
                  <select
                    className="filter-select"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    aria-label="Filter releases by status"
                  >
                    <option value="all">All statuses</option>
                    <option value="planned">Planned</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              </div>

              {filteredReleases.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">↗</div>
                  <h3>
                    {releases.length
                      ? 'No matching releases'
                      : 'Your next release starts here'}
                  </h3>
                  <p>
                    {releases.length
                      ? 'Try changing your search or status filter.'
                      : 'Create a release to organize your deployment checklist.'}
                  </p>
                  {!releases.length && (
                    <button
                      className="primary-button"
                      onClick={() => setShowModal(true)}
                    >
                      ＋ Create your first release
                    </button>
                  )}
                </div>
              ) : (
                <div className="release-grid">
                  {filteredReleases.map((release) => {
                    const status = getStatus(release);
                    const percent = Math.round(
                      (release.completedSteps.length / STEPS.length) * 100
                    );

                    return (
                      <article className="release-card" key={release.id}>
                        <div className="card-topline">
                          <span className={`status-badge ${status}`}>
                            <span className="status-dot" />
                            {status === 'ongoing' ? 'In progress' : status}
                          </span>
                          <button
                            className="icon-button"
                            title="Delete release"
                            aria-label={`Delete ${release.name}`}
                            onClick={() => deleteRelease(release.id)}
                          >
                            ×
                          </button>
                        </div>

                        <button
                          className="release-title"
                          onClick={() => setSelectedId(release.id)}
                        >
                          {release.name}
                        </button>
                        <div className="release-date">
                          ▦ &nbsp; Due {formatDate(release.date)}
                        </div>

                        <div className="progress-meta">
                          <span>Checklist progress</span>
                          <strong>{percent}%</strong>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="card-footer">
                          <span>
                            {release.completedSteps.length} of {STEPS.length} tasks
                          </span>
                          <button
                            className="text-button"
                            onClick={() => setSelectedId(release.id)}
                          >
                            View checklist →
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="detail-layout">
            <div className="detail-main panel">
              <div className="detail-title-row">
                <div>
                  <span className={`status-badge ${getStatus(selected)}`}>
                    <span className="status-dot" />
                    {getStatus(selected) === 'ongoing'
                      ? 'In progress'
                      : getStatus(selected)}
                  </span>
                  <h2>Release checklist</h2>
                  <p>Complete every step to finish this release.</p>
                </div>
                {/* ✅ progress now defined */}
                <strong className="big-progress">{progress}%</strong>
              </div>

              <div className="progress-track large">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="checklist-count">
                <span>
                  {selected.completedSteps.length} of {STEPS.length} completed
                </span>
                {progress === 100 && (
                  <span className="success-text">✓ All tasks complete</span>
                )}
              </div>

              <div className="checklist">
                {STEPS.map((step, index) => {
                  const checked = selected.completedSteps.includes(index);
                  return (
                    <label
                      className={`checklist-item ${checked ? 'checked' : ''}`}
                      key={step}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStep(index)}
                      />
                      <span className="custom-check">
                        {checked ? '✓' : ''}
                      </span>
                      <span className="step-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="step-name">{step}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <aside className="detail-side panel">
              <h3>Release details</h3>
              <div className="detail-field">
                <span className="field-label">RELEASE NAME</span>
                <strong>{selected.name}</strong>
              </div>
              <div className="detail-field">
                <span className="field-label">DUE DATE</span>
                <strong>▦ &nbsp; {formatDate(selected.date)}</strong>
              </div>
              <div className="detail-field">
                <span className="field-label">STATUS</span>
                <span className={`status-badge ${getStatus(selected)}`}>
                  {getStatus(selected)}
                </span>
              </div>
              <div className="detail-field">
                <div className="info-heading">
                  <span className="field-label">
                    ADDITIONAL INFORMATION
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setEditingInfo(!editingInfo)}
                  >
                    {editingInfo ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                {editingInfo ? (
                  <InfoEditor
                    initialValue={selected.additionalInfo}
                    onSave={updateInfo}
                  />
                ) : (
                  <p className="info-text">
                    {selected.additionalInfo ||
                      'No additional information provided.'}
                  </p>
                )}
              </div>
              <button
                className="danger-button"
                onClick={() => deleteRelease(selected.id)}
              >
                Delete this release
              </button>
            </aside>
          </section>
        )}
      </main>

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <form className="modal" onSubmit={createRelease}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">RELEASE MANAGEMENT</span>
                <h2>Create a release</h2>
                <p>Set up your release and start tracking progress.</p>
              </div>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <label className="form-label">
              Release name <span>*</span>
              <input
                autoFocus
                required
                maxLength={100}
                placeholder="e.g. v2.4.0 — Spring release"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
              />
            </label>

            <label className="form-label">
              Due date <span>*</span>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm({ ...form, date: e.target.value })
                }
              />
            </label>

            <label className="form-label">
              Additional information{' '}
              <span className="optional">(optional)</span>
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Release notes, deployment instructions, or reminders..."
                value={form.additionalInfo}
                onChange={(e) =>
                  setForm({ ...form, additionalInfo: e.target.value })
                }
              />
            </label>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Create release →
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </article>
  );
}

function InfoEditor({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="info-editor">
      <textarea
        rows={4}
        maxLength={2000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="primary-button small-button"
        onClick={() => onSave(value)}
      >
        Save information
      </button>
    </div>
  );
}

export default App;