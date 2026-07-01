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
import { Sprout, CalendarDays, CalendarRange, Archive, AlertCircle, MapPin } from "lucide-react";
import { MetricCard } from "./metric-card";
import { ChartCard } from "./chart-card";

interface Summary {
  createdToday: number;
  createdThisWeek: number;
  createdThisMonth: number;
  total: number;
  active: number;
  archived: number;
}

interface TimeBucket {
  date: string;
  count: number;
}

interface LocationCount {
  location: string;
  city: string | null;
  state: string | null;
  count: number;
}

interface LabeledCount {
  label: string;
  count: number;
}

interface Analytics {
  summary: Summary;
  dailyTrend: TimeBucket[];
  topLocationsThisWeek: LocationCount[];
  byCategory: LabeledCount[];
  byListingType: LabeledCount[];
  byState: LabeledCount[];
  error?: string;
}

export function ListingsAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/listings");
      const json = (await res.json()) as Analytics;
      if (!res.ok) throw new Error(json.error ?? "Listings request failed");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown listings error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        <AlertCircle className="h-5 w-5" />
        <span>Listings: {error}</span>
      </div>
    );
  }

  const summary = data?.summary;
  const trendData = (data?.dailyTrend ?? []).map((d) => ({
    date: d.date.slice(5),
    listings: d.count,
  }));
  const locationData = (data?.topLocationsThisWeek ?? []).map((l) => ({
    name: l.location,
    listings: l.count,
  }));
  const categoryData = (data?.byCategory ?? []).map((c) => ({ name: c.label, value: c.count }));
  const stateData = (data?.byState ?? []).map((s) => ({ name: s.label, listings: s.count }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Listings Analytics</h2>
        <p className="mt-1 text-sm text-gray-600">Marketplace listings from Postgres (items table).</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Created Today" value={loading ? "…" : summary?.createdToday ?? 0} icon={CalendarDays} color="green" />
        <MetricCard title="Created This Week" value={loading ? "…" : summary?.createdThisWeek ?? 0} icon={CalendarRange} color="blue" />
        <MetricCard title="Active Listings" value={loading ? "…" : (summary?.active ?? 0).toLocaleString()} icon={Sprout} color="green" />
        <MetricCard title="Archived" value={loading ? "…" : (summary?.archived ?? 0).toLocaleString()} icon={Archive} color="amber" />
      </div>

      <ChartCard title="Listings Created (Last 30 Days)">
        {loading ? (
          <div className="flex h-72 items-center justify-center text-gray-500">Loading trend...</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="listings" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Top Locations This Week">
          {loading ? (
            <div className="flex h-72 items-center justify-center text-gray-500">Loading locations...</div>
          ) : locationData.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center text-gray-500">
              <MapPin className="mb-2 h-8 w-8" />
              No listings created this week yet.
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip />
                  <Bar dataKey="listings" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Listings by Category">
          {loading ? (
            <div className="flex h-72 items-center justify-center text-gray-500">Loading categories...</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Listings by State">
        {loading ? (
          <div className="flex h-72 items-center justify-center text-gray-500">Loading states...</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stateData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="listings" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
