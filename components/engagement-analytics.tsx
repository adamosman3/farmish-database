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
import {
  MessageSquare,
  TrendingUp,
  Users,
  UserPlus,
  Activity,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { MetricCard } from "./metric-card";
import { ChartCard } from "./chart-card";

interface TimeBucket {
  date: string;
  count: number;
}

interface LabeledCount {
  label: string;
  count: number;
}

interface MessageAnalytics {
  total: number;
  today: number;
  thisWeek: number;
  last30Days: number;
  avgPerDayLast30: number;
  avgPerDayAllTime: number;
  totalConversations: number;
  avgMessagesPerConversation: number;
  dailyTrend: TimeBucket[];
}

interface UserAnalytics {
  total: number;
  newToday: number;
  newThisWeek: number;
  newThisMonth: number;
  activeLast30Days: number;
  avgSignInCount: number;
  payingUsers: number;
  usersWithState: number;
  signupTrend: TimeBucket[];
  byRole: LabeledCount[];
  bySubscription: LabeledCount[];
  byState: LabeledCount[];
}

interface AnalyticsData {
  messages: MessageAnalytics;
  users: UserAnalytics;
  error?: string;
}

export function EngagementAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/analytics");
        const json = (await res.json()) as AnalyticsData;
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        <AlertCircle className="h-5 w-5" />
        <span>Analytics: {error}</span>
      </div>
    );
  }

  const m = data?.messages;
  const u = data?.users;

  const msgTrend = (m?.dailyTrend ?? []).map((d) => ({ date: d.date.slice(5), messages: d.count }));
  const signupTrend = (u?.signupTrend ?? []).map((d) => ({ date: d.date.slice(5), signups: d.count }));
  const subscriptionData = (u?.bySubscription ?? []).map((s) => ({ name: s.label, value: s.count }));
  const stateData = (u?.byState ?? []).map((s) => ({ name: s.label, users: s.count }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Messaging & User Analytics</h2>
        <p className="mt-1 text-sm text-gray-600">Engagement and user metrics from Postgres.</p>
      </div>

      <h3 className="text-lg font-semibold text-gray-800">Messaging</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Messages" value={loading ? "…" : (m?.total ?? 0).toLocaleString()} icon={MessageSquare} color="blue" />
        <MetricCard title="Avg Messages / Day (30d)" value={loading ? "…" : (m?.avgPerDayLast30 ?? 0).toLocaleString()} icon={TrendingUp} color="green" />
        <MetricCard title="Total Conversations" value={loading ? "…" : (m?.totalConversations ?? 0).toLocaleString()} icon={MessageSquare} color="amber" />
        <MetricCard title="Avg Msgs / Conversation" value={loading ? "…" : (m?.avgMessagesPerConversation ?? 0).toLocaleString()} icon={Activity} color="green" />
      </div>

      <ChartCard title="Messages Sent (Last 30 Days)">
        {loading ? (
          <div className="flex h-72 items-center justify-center text-gray-500">Loading messages...</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={msgTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="messages" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <h3 className="text-lg font-semibold text-gray-800">Users</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Users" value={loading ? "…" : (u?.total ?? 0).toLocaleString()} icon={Users} color="green" />
        <MetricCard title="New This Week" value={loading ? "…" : (u?.newThisWeek ?? 0).toLocaleString()} icon={UserPlus} color="blue" />
        <MetricCard title="Active (30d)" value={loading ? "…" : (u?.activeLast30Days ?? 0).toLocaleString()} icon={Activity} color="amber" />
        <MetricCard title="Paying Users (Monthly + Yearly)" value={loading ? "…" : (u?.payingUsers ?? 0).toLocaleString()} icon={CreditCard} color="green" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="New Signups (Last 30 Days)">
          {loading ? (
            <div className="flex h-72 items-center justify-center text-gray-500">Loading signups...</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={signupTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="signups" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Users by Subscription">
          {loading ? (
            <div className="flex h-72 items-center justify-center text-gray-500">Loading subscriptions...</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subscriptionData} layout="vertical">
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

      <ChartCard
        title={
          loading || !u
            ? "Users by State"
            : `Users by State (only ${u.usersWithState.toLocaleString()} of ${u.total.toLocaleString()} users — ${((u.usersWithState / u.total) * 100).toFixed(1)}% — have a state)`
        }
      >
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
                <Bar dataKey="users" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
