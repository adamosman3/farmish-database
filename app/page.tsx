import { Dashboard } from "@/components/dashboard";
import { ListingsAnalytics } from "@/components/listings-analytics";
import { EngagementAnalytics } from "@/components/engagement-analytics";
import { HubspotAnalytics } from "@/components/hubspot-analytics";
import { CustomDashboard } from "@/components/custom-dashboard";

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Farmish Database</h1>
        <p className="mt-2 text-gray-600">
          Live dashboard connecting Postgres, Amplitude, and HubSpot.
        </p>
      </div>
      <div className="space-y-12">
        <CustomDashboard />
        <ListingsAnalytics />
        <EngagementAnalytics />
        <HubspotAnalytics />
        <Dashboard />
      </div>
    </main>
  );
}
