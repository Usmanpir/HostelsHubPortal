import { Lock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge } from "@/components/shared/status-badge";
import { DetailRow, PortalSection } from "@/components/portal/section";
import { ProfileForm } from "@/components/portal/profile-form";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { getPortalProfile } from "@/services/portal/profile-service";
import { genderLabels, residentStatusLabels, residentStatusTones } from "@/config/labels";
import { initials } from "@/lib/format";

export const metadata = { title: "My profile" };

export default async function PortalProfilePage() {
  const ctx = await requireResidentPage();
  const profile = await getPortalProfile(ctx);
  const fmt = portalFormatters(ctx);
  const name = `${profile.firstName} ${profile.lastName}`;

  return (
    <>
      <PageHeader title="My profile" description="Your details as registered with the hostel." />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="flex items-center gap-4 rounded-2xl border bg-card p-5">
            {profile.photoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file route
              <img src={`/api/files/${profile.photoFileId}`} alt="" className="size-16 rounded-2xl object-cover" />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary">
                {initials(name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{name}</p>
              <p className="font-mono text-xs text-muted-foreground">{profile.residentCode}</p>
              <div className="mt-1.5">
                <EnumBadge value={profile.status} labels={residentStatusLabels} tones={residentStatusTones} />
              </div>
            </div>
          </section>

          <PortalSection
            title="Registered details"
            action={
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" />
                Managed by the office
              </span>
            }
          >
            <dl className="divide-y px-4">
              <DetailRow label="Hostel">{profile.hostel.name}</DetailRow>
              <DetailRow label="Sign-in email">{profile.user?.email ?? profile.email ?? "—"}</DetailRow>
              <DetailRow label="Gender">{profile.gender ? genderLabels[profile.gender] : "—"}</DetailRow>
              <DetailRow label="Date of birth">{fmt.date(profile.dateOfBirth)}</DetailRow>
              <DetailRow label="Nationality">{profile.nationality ?? "—"}</DetailRow>
              <DetailRow label="Occupation">{profile.occupation ?? "—"}</DetailRow>
              <DetailRow label="Institution / employer">{profile.institution ?? "—"}</DetailRow>
              <DetailRow label="Address">{[profile.address, profile.city].filter(Boolean).join(", ") || "—"}</DetailRow>
              <DetailRow label="Joined">{fmt.date(profile.joiningDate)}</DetailRow>
              <DetailRow label="Expected leaving">{fmt.date(profile.expectedLeavingDate)}</DetailRow>
              <DetailRow label="Guardian">
                {profile.guardianName ? `${profile.guardianName}${profile.guardianPhone ? ` · ${profile.guardianPhone}` : ""}` : "—"}
              </DetailRow>
            </dl>
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Need to correct something here? Submit an &ldquo;Other&rdquo; request and the office will update it.
            </p>
          </PortalSection>
        </div>

        <PortalSection title="Contact details" description="You can keep these up to date yourself." className="lg:col-span-3" bodyClassName="p-4">
          <ProfileForm
            initial={{
              phone: profile.phone,
              alternatePhone: profile.alternatePhone,
              emergencyContactName: profile.emergencyContactName,
              emergencyContactPhone: profile.emergencyContactPhone,
              emergencyContactRelation: profile.emergencyContactRelation,
            }}
          />
        </PortalSection>
      </div>
    </>
  );
}
