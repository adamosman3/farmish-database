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
import { Database, Activity, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";
import { MetricCard } from "./metric-card";
import { ChartCard } from "./chart-card";

interface PostgresTable {
  name: string;
  rowCount: number;
  sample: Record<string, unknown>[];
}

interface EventVolumePoint {
  date: string;
  count: number;
}

interface EventTotal {
  name: string;
  total: number;
}

interface PostgresData {
  tables: PostgresTable[];
  error?: string;
}

interface AmplitudeData {
  total: number;
  daily: EventVolumePoint[];
  topEvents: EventTotal[];
  error?: string;
}

export function Dashboard() {
  const [postgres, setPostgres] = useState<PostgresData | null>(null);
  const [amplitude, setAmplitude] = useState<AmplitudeData | null>(null);
  const [pgLoading, setPgLoading] = useState(true);
  const [ampLoading, setAmpLoading] = useState(true);
  const [pgError, setPgError] = useState<string | null>(null);
  const [ampError, setAmpError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function loadPostgres() {
    setPgLoading(true);
    setPgError(null);
    try {
      const res = await fetch("/api/postgres");
      const data = (await res.json()) as PostgresData;
      if (!res.ok) throw new Error(data.error ?? "Postgres request failed");
      setPostgres(data);
    } catch (err) {
      setPgError(err instanceof Error ? err.message : "Unknown Postgres error");
    } finally {
      setPgLoading(false);
    }
  }

  async function loadAmplitude() {
    setAmpLoading(true);
    setAmpError(null);
    try {
      const res = await fetch("/api/amplitude");
      const data = (await res.json()) as AmplitudeData;
      if (!res.ok) throw new Error(data.error ?? "Amplitude request failed");
      setAmplitude(data);
    } catch (err) {
      setAmpError(err instanceof Error ? err.message : "Unknown Amplitude error");
    } finally {
      setAmpLoading(false);
    }
  }

  function loadAll() {
    void loadPostgres();
    void loadAmplitude();
    setLastRefresh(new Date());
  }

  useEffect(() => {
    loadAll();
  }, []);

  const isLoading = pgLoading || ampLoading;

  const totalRows = postgres?.tables.reduce((sum, t) => sum + t.rowCount, 0) ?? 0;
  const totalEvents = amplitude?.total ?? 0;
  const uniqueEventTypes = amplitude?.topEvents.length ?? 0;

  const eventTypeData = (amplitude?.topEvents ?? [])
    .map((e) => ({ name: e.name, value: e.total }))
    .slice(0, 8);

  const dailyVolumeData = (amplitude?.daily ?? []).map((d) => ({
    date: d.date.slice(5),
    events: d.count,
  }));

  const tableSizeData = (postgres?.tables ?? [])
    .map((t) => ({ name: t.name, rows: t.rowCount }))
    .sort((a, b) => b.rows - a.rows)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {lastRefresh && (
            <p className="text-sm text-gray-500">Last refreshed: {lastRefresh.toLocaleTimeString()}</p>
          )}
          {(pgError || ampError) && <p className="text-sm text-red-600">Some data sources failed to load.</p>}
        </div>
        <button
          onClick={loadAll}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg bg-farmish-600 px-4 py-2 text-white shadow-sm hover:bg-farmish-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Postgres Tables" value={postgres?.tables.length ?? "—"} icon={Database} color="green" />
        <MetricCard title="Total Rows" value={postgres ? totalRows.toLocaleString() : "—"} icon={Database} color="blue" />
        <MetricCard title="Events (30d)" value={amplitude ? totalEvents.toLocaleString() : "—"} icon={Activity} color="amber" />
        <MetricCard title="Active Event Types" value={amplitude ? uniqueEventTypes : "—"} icon={TrendingUp} color="green" />
      </div>

      {pgError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>Postgres: {pgError}</span>
        </div>
      )}
      {ampError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>Amplitude: {ampError}</span>
        </div>
      )}

      <ChartCard title="Event Volume (Last 30 Days)">
        {ampLoading ? (
          <div className="flex h-72 items-center justify-center text-gray-500">Loading Amplitude volume...</div>
        ) : dailyVolumeData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-gray-500">No event data for the selected period.</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyVolumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="events" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Top Event Types" className="lg:col-span-2">
          {ampLoading ? (
            <div className="flex h-72 items-center justify-center text-gray-500">Loading event breakdown...</div>
          ) : eventTypeData.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-gray-500">No event data for the selected period.</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventTypeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Postgres Table Sizes" className="lg:col-span-2">
          {pgLoading ? (
            <div className="flex h-72 items-center justify-center text-gray-500">Loading Postgres tables...</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tableSizeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="rows" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Postgres Tables" className="lg:col-span-2">
        {pgLoading ? (
          <div className="flex h-32 items-center justify-center text-gray-500">Loading Postgres tables...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Table Name
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Row Count
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Sample Data
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {(postgres?.tables ?? []).map((table) => (
                  <tr key={table.name}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{table.name}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{table.rowCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <pre className="max-w-md overflow-x-auto rounded bg-gray-50 p-2 text-xs">
                        {JSON.stringify(table.sample[0] ?? {}, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Top Events (Last 30 Days)" className="lg:col-span-2">
        {ampLoading ? (
          <div className="flex h-32 items-center justify-center text-gray-500">Loading Amplitude events...</div>
        ) : (amplitude?.topEvents ?? []).length === 0 ? (
          <div className="flex h-32 items-center justify-center text-gray-500">No event data for the selected period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Event Name
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Total Count (30d)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {(amplitude?.topEvents ?? []).map((event) => (
                  <tr key={event.name}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{event.name}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{event.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
