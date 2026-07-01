"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Users, Building2, Mail, AlertCircle, Search } from "lucide-react";
import { MetricCard } from "./metric-card";
import { ChartCard } from "./chart-card";
import { CustomDashboard } from "./custom-dashboard";

interface CrmRecord {
  id: string;
  properties: Record<string, string | null>;
}

interface ObjectSummary {
  total: number;
  createdThisWeek: number;
  createdThisMonth: number;
  recent: CrmRecord[];
  error?: string;
}

interface EmailPerformance {
  id: string;
  name: string;
  subject: string;
  state: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

interface EmailData {
  emails: EmailPerformance[];
  error?: string;
}

type SortKey = "openRate" | "clickRate" | "bounceRate" | "sent";

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function HubspotAnalytics() {
  const [contacts, setContacts] = useState<ObjectSummary | null>(null);
  const [companies, setCompanies] = useState<ObjectSummary | null>(null);
  const [emails, setEmails] = useState<EmailPerformance[] | null>(null);

  const [contactsLoading, setContactsLoading] = useState(true);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [emailsLoading, setEmailsLoading] = useState(true);

  const [contactsError, setContactsError] = useState<string | null>(null);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [emailsError, setEmailsError] = useState<string | null>(null);

  const [subjectFilter, setSubjectFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("openRate");

  useEffect(() => {
    async function loadContacts() {
      try {
        const res = await fetch("/api/hubspot/contacts");
        const json = (await res.json()) as ObjectSummary;
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        setContacts(json);
      } catch (err) {
        setContactsError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setContactsLoading(false);
      }
    }
    async function loadCompanies() {
      try {
        const res = await fetch("/api/hubspot/companies");
        const json = (await res.json()) as ObjectSummary;
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        setCompanies(json);
      } catch (err) {
        setCompaniesError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setCompaniesLoading(false);
      }
    }
    async function loadEmails() {
      try {
        const res = await fetch("/api/hubspot/emails");
        const json = (await res.json()) as EmailData;
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        setEmails(json.emails);
      } catch (err) {
        setEmailsError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setEmailsLoading(false);
      }
    }
    void loadContacts();
    void loadCompanies();
    void loadEmails();
  }, []);

  const filteredEmails = useMemo(() => {
    const list = (emails ?? []).filter((e) =>
      e.subject.toLowerCase().includes(subjectFilter.toLowerCase())
    );
    return [...list].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [emails, subjectFilter, sortKey]);

  const topSubjectsChart = useMemo(
    () =>
      filteredEmails
        .slice(0, 8)
        .map((e) => ({
          name: e.subject.length > 30 ? e.subject.slice(0, 30) + "…" : e.subject,
          openRate: Number((e.openRate * 100).toFixed(1)),
          clickRate: Number((e.clickRate * 100).toFixed(1)),
        })),
    [filteredEmails]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">HubSpot Analytics</h2>
        <p className="mt-1 text-sm text-gray-600">Contacts, companies, and marketing email performance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Contacts" value={contactsLoading ? "…" : (contacts?.total ?? 0).toLocaleString()} icon={Users} color="blue" />
        <MetricCard title="Contacts This Week" value={contactsLoading ? "…" : (contacts?.createdThisWeek ?? 0).toLocaleString()} icon={Users} color="green" />
        <MetricCard title="Total Companies" value={companiesLoading ? "…" : (companies?.total ?? 0).toLocaleString()} icon={Building2} color="amber" />
        <MetricCard title="Companies This Week" value={companiesLoading ? "…" : (companies?.createdThisWeek ?? 0).toLocaleString()} icon={Building2} color="green" />
      </div>

      {contactsError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>Contacts: {contactsError}</span>
        </div>
      )}
      {companiesError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>Companies: {companiesError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Recent Contacts">
          {contactsLoading ? (
            <div className="flex h-48 items-center justify-center text-gray-500">Loading contacts...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {(contacts?.recent ?? []).map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{c.properties.email ?? "—"}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {[c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Recent Companies">
          {companiesLoading ? (
            <div className="flex h-48 items-center justify-center text-gray-500">Loading companies...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {(companies?.recent ?? []).map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{c.properties.name ?? c.properties.domain ?? "—"}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {[c.properties.city, c.properties.state].filter(Boolean).join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Email Subject Line Performance">
        {emailsLoading ? (
          <div className="flex h-48 items-center justify-center text-gray-500">Loading email performance...</div>
        ) : emailsError ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>
              Email metrics unavailable: {emailsError}. Add the <code className="font-mono">content</code> scope to the
              HubSpot private app to enable this.
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  placeholder="Filter by subject line..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-farmish-500 focus:outline-none focus:ring-1 focus:ring-farmish-500"
                />
              </div>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-farmish-500 focus:outline-none"
              >
                <option value="openRate">Sort by Open Rate</option>
                <option value="clickRate">Sort by Click Rate</option>
                <option value="bounceRate">Sort by Bounce Rate</option>
                <option value="sent">Sort by Sent</option>
              </select>
            </div>

            {topSubjectsChart.length > 0 && (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topSubjectsChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 12 }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={180} />
                    <Tooltip />
                    <Bar dataKey="openRate" fill="#3b82f6" name="Open %" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="clickRate" fill="#22c55e" name="Click %" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Subject</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">State</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Sent</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Open Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Click Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Bounce Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredEmails.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{e.subject}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{e.state}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-600">{e.sent.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-600">{pct(e.openRate)}</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-600">{pct(e.clickRate)}</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-600">{pct(e.bounceRate)}</td>
                    </tr>
                  ))}
                  {filteredEmails.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                        No emails match your filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ChartCard>

      <div className="border-t border-gray-200 pt-8">
        <CustomDashboard
          apiBase="/api/hubspot/custom"
          title="Build Your Own HubSpot Dashboard"
          description="Pick contacts, companies, or emails, then a breakdown (over time, lifecycle stage, lead status, or email state). Your layout is saved in this browser."
          storageKey="farmish-hubspot-custom-widgets"
        />
      </div>
    </div>
  );
}
