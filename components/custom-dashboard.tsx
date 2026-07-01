"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Plus, X, LayoutGrid, AlertCircle, Loader2 } from "lucide-react";

interface CatalogOption {
  key: string;
  label: string;
}

interface CatalogGroup {
  key: string;
  label: string;
  metrics: CatalogOption[];
  dimensions: (CatalogOption & { type: string })[];
}

interface WidgetConfig {
  id: string;
  group: string;
  metric: string;
  dimension: string;
  range: string;
}

interface CustomResult {
  chartType: "metric" | "line" | "bar";
  metricLabel: string;
  groupLabel: string;
  dimensionLabel: string;
  rows: { label: string; value: number }[];
  error?: string;
}

const RANGE_OPTIONS = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "365d", label: "Last 365 days" },
  { key: "all", label: "All time" },
];

interface CustomDashboardProps {
  apiBase?: string;
  title?: string;
  description?: string;
  storageKey?: string;
}

function Widget({
  config,
  apiBase,
  onRemove,
}: {
  config: WidgetConfig;
  apiBase: string;
  onRemove: () => void;
}) {
  const [result, setResult] = useState<CustomResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          group: config.group,
          metric: config.metric,
          dimension: config.dimension,
          range: config.range,
        });
        const res = await fetch(`${apiBase}?${qs.toString()}`);
        const json = (await res.json()) as CustomResult;
        if (!res.ok) throw new Error(json.error ?? "Query failed");
        setResult(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [config, apiBase]);

  const rangeLabel = RANGE_OPTIONS.find((r) => r.key === config.range)?.label ?? config.range;
  const title = result
    ? `${result.groupLabel}: ${result.metricLabel} · ${result.dimensionLabel}`
    : "Loading widget";

  return (
    <div className="relative rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <button
        onClick={onRemove}
        className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Remove widget"
      >
        <X className="h-4 w-4" />
      </button>
      <h3 className="mb-1 pr-8 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mb-4 text-xs text-gray-500">{rangeLabel}</p>

      {loading ? (
        <div className="flex h-56 items-center justify-center text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
        </div>
      ) : error ? (
        <div className="flex h-56 items-center justify-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" /> {error}
        </div>
      ) : result?.chartType === "metric" ? (
        <div className="flex h-56 flex-col items-center justify-center">
          <span className="text-5xl font-bold text-farmish-600">
            {(result.rows[0]?.value ?? 0).toLocaleString()}
          </span>
          <span className="mt-2 text-sm text-gray-500">{result.metricLabel}</span>
        </div>
      ) : result?.chartType === "line" ? (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={result.rows.map((r) => ({ label: r.label.slice(5), value: r.value }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={result?.rows ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function CustomDashboard({
  apiBase = "/api/custom",
  title = "Build Your Own Dashboard",
  description = "Pick a group, metric, and breakdown to create custom widgets. Your layout is saved in this browser.",
  storageKey = "farmish-custom-widgets",
}: CustomDashboardProps = {}) {
  const [catalog, setCatalog] = useState<CatalogGroup[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);

  const [group, setGroup] = useState("");
  const [metric, setMetric] = useState("");
  const [dimension, setDimension] = useState("");
  const [range, setRange] = useState("30d");

  // Load catalog + persisted widgets
  useEffect(() => {
    async function loadCatalog() {
      try {
        const res = await fetch(apiBase);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load catalog");
        setCatalog(json.catalog as CatalogGroup[]);
      } catch (err) {
        setCatalogError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    void loadCatalog();

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setWidgets(JSON.parse(saved) as WidgetConfig[]);
    } catch {
      /* ignore malformed storage */
    }
  }, [apiBase, storageKey]);

  // Persist widgets
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widgets));
    } catch {
      /* ignore */
    }
  }, [widgets, storageKey]);

  // Keep metric/dimension valid when group changes
  const selectedGroup = catalog.find((g) => g.key === group);
  useEffect(() => {
    if (!selectedGroup) return;
    if (!selectedGroup.metrics.some((m) => m.key === metric)) {
      setMetric(selectedGroup.metrics[0]?.key ?? "");
    }
    if (!selectedGroup.dimensions.some((d) => d.key === dimension)) {
      setDimension(selectedGroup.dimensions[0]?.key ?? "");
    }
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  function addWidget() {
    if (!group || !metric || !dimension) return;
    setWidgets((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, group, metric, dimension, range },
    ]);
  }

  function removeWidget(id: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <LayoutGrid className="h-6 w-6 text-farmish-600" />
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>

      {catalogError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5" /> {catalogError}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Group</label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-farmish-500 focus:outline-none"
              >
                <option value="">Select…</option>
                {catalog.map((g) => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Metric</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                disabled={!selectedGroup}
                className="w-full rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-farmish-500 focus:outline-none disabled:bg-gray-50"
              >
                {selectedGroup?.metrics.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Breakdown</label>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
                disabled={!selectedGroup}
                className="w-full rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-farmish-500 focus:outline-none disabled:bg-gray-50"
              >
                {selectedGroup?.dimensions.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Time Range</label>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-farmish-500 focus:outline-none"
              >
                {RANGE_OPTIONS.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={addWidget}
                disabled={!group}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-farmish-600 py-2 px-4 text-sm font-medium text-white hover:bg-farmish-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add Widget
              </button>
            </div>
          </div>
        </div>
      )}

      {widgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center text-gray-500">
          No widgets yet. Configure one above and click <span className="font-medium">Add Widget</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {widgets.map((w) => (
            <Widget key={w.id} config={w} apiBase={apiBase} onRemove={() => removeWidget(w.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
