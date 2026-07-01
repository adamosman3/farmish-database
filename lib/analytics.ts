import { query } from "./db";

export interface TimeBucket {
  date: string;
  count: number;
}

export interface LabeledCount {
  label: string;
  count: number;
}

export interface MessageAnalytics {
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

export interface UserAnalytics {
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

export async function getMessageAnalytics(): Promise<MessageAnalytics> {
  const summaryRows = await query<{
    total: string;
    today: string;
    this_week: string;
    last_30d: string;
    avg_all_time: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS this_week,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - 29 * INTERVAL '1 day') AS last_30d,
       COUNT(*)::float
         / GREATEST(EXTRACT(DAY FROM (MAX(created_at) - MIN(created_at))) + 1, 1) AS avg_all_time
     FROM messages`
  );
  const s = summaryRows[0];

  const convRows = await query<{ total_conversations: string }>(
    `SELECT COUNT(*) AS total_conversations FROM conversations`
  );

  const trendRows = await query<{ day: string; count: string }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
     FROM messages
     WHERE created_at >= CURRENT_DATE - 29 * INTERVAL '1 day'
     GROUP BY 1 ORDER BY 1`
  );

  const total = parseInt(s?.total ?? "0", 10);
  const last30 = parseInt(s?.last_30d ?? "0", 10);
  const totalConversations = parseInt(convRows[0]?.total_conversations ?? "0", 10);

  return {
    total,
    today: parseInt(s?.today ?? "0", 10),
    thisWeek: parseInt(s?.this_week ?? "0", 10),
    last30Days: last30,
    avgPerDayLast30: Math.round((last30 / 30) * 10) / 10,
    avgPerDayAllTime: Math.round(parseFloat(s?.avg_all_time ?? "0") * 10) / 10,
    totalConversations,
    avgMessagesPerConversation:
      totalConversations > 0 ? Math.round((total / totalConversations) * 10) / 10 : 0,
    dailyTrend: trendRows.map((r) => ({ date: r.day, count: parseInt(r.count, 10) })),
  };
}

export async function getUserAnalytics(): Promise<UserAnalytics> {
  const summaryRows = await query<{
    total: string;
    new_today: string;
    new_this_week: string;
    new_this_month: string;
    active_30d: string;
    avg_sign_in: string;
    paying_users: string;
    users_with_state: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS new_today,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE)) AS new_this_week,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS new_this_month,
       COUNT(*) FILTER (WHERE last_sign_in_at >= CURRENT_DATE - 29 * INTERVAL '1 day') AS active_30d,
       COALESCE(AVG(sign_in_count), 0) AS avg_sign_in,
       COUNT(*) FILTER (WHERE subscription_type IN ('Monthly Plan', 'Yearly Plan')) AS paying_users,
       COUNT(*) FILTER (WHERE state IS NOT NULL AND TRIM(state) <> '') AS users_with_state
     FROM users`
  );
  const s = summaryRows[0];

  const signupTrend = await query<{ day: string; count: string }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
     FROM users
     WHERE created_at >= CURRENT_DATE - 29 * INTERVAL '1 day'
     GROUP BY 1 ORDER BY 1`
  );

  const byRole = await query<{ label: string | null; count: string }>(
    `SELECT COALESCE(NULLIF(role, ''), 'unknown') AS label, COUNT(*) AS count
     FROM users GROUP BY 1 ORDER BY count DESC LIMIT 10`
  );

  const bySubscription = await query<{ label: string | null; count: string }>(
    `SELECT COALESCE(NULLIF(subscription_type, ''), 'none') AS label, COUNT(*) AS count
     FROM users GROUP BY 1 ORDER BY count DESC LIMIT 10`
  );

  // Only ~3% of users have a state, and it's dominated by NULL/empty. Exclude
  // blanks so the chart shows real states instead of one giant "unknown" bar.
  const byState = await query<{ label: string | null; count: string }>(
    `SELECT UPPER(TRIM(state)) AS label, COUNT(*) AS count
     FROM users
     WHERE state IS NOT NULL AND TRIM(state) <> ''
     GROUP BY 1 ORDER BY count DESC LIMIT 15`
  );

  const mapLabeled = (rows: { label: string | null; count: string }[]): LabeledCount[] =>
    rows.map((r) => ({ label: r.label ?? "unknown", count: parseInt(r.count, 10) }));

  return {
    total: parseInt(s?.total ?? "0", 10),
    newToday: parseInt(s?.new_today ?? "0", 10),
    newThisWeek: parseInt(s?.new_this_week ?? "0", 10),
    newThisMonth: parseInt(s?.new_this_month ?? "0", 10),
    activeLast30Days: parseInt(s?.active_30d ?? "0", 10),
    avgSignInCount: Math.round(parseFloat(s?.avg_sign_in ?? "0") * 10) / 10,
    payingUsers: parseInt(s?.paying_users ?? "0", 10),
    usersWithState: parseInt(s?.users_with_state ?? "0", 10),
    signupTrend: signupTrend.map((r) => ({ date: r.day, count: parseInt(r.count, 10) })),
    byRole: mapLabeled(byRole),
    bySubscription: mapLabeled(bySubscription),
    byState: mapLabeled(byState),
  };
}
