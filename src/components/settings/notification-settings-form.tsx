"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormSection, SwitchField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import {
  NOTIFICATION_EVENTS,
  notificationEventLabels,
  notificationSettingsSchema,
  type NotificationSettings,
} from "@/lib/validation/settings";
import { updateNotificationSettingsAction } from "@/app/(app)/settings/actions";
import { UpgradeHint } from "./upgrade-hint";

export function NotificationSettingsForm({
  initial,
  emailAllowed,
  canManageBilling,
}: {
  initial: NotificationSettings;
  emailAllowed: boolean;
  canManageBilling: boolean;
}) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: notificationSettingsSchema,
    defaultValues: { ...initial, email: emailAllowed && initial.email },
    action: (values) => updateNotificationSettingsAction(values),
    onSuccess: () => {
      form.reset(form.getValues());
      router.refresh();
    },
  });
  const c = form.control;

  const setAll = (value: boolean) => {
    for (const type of NOTIFICATION_EVENTS) form.setValue(`events.${type}`, value, { shouldDirty: true });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6" noValidate>
      <FormSection title="Channels" description="In-app notifications are always delivered. Email is sent in addition when enabled.">
        {!emailAllowed ? (
          <UpgradeHint
            title="Email notifications aren't included in your plan"
            description="Upgrade to Business or Enterprise to email notifications to your team and residents."
            canManageBilling={canManageBilling}
          />
        ) : null}
        <SwitchField
          control={c}
          name="email"
          label="Email notifications"
          description="Also email each notification to the recipient's account address."
          disabled={!emailAllowed}
        />
      </FormSection>

      <FormSection title="Events" description="Turn off events you don't want to notify anyone about. Applies to every channel.">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setAll(true)}>
            Enable all
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAll(false)}>
            Disable all
          </Button>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {NOTIFICATION_EVENTS.map((type) => (
            <SwitchField
              key={type}
              control={c}
              name={`events.${type}`}
              label={notificationEventLabels[type].label}
              description={notificationEventLabels[type].description}
            />
          ))}
        </div>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending || !form.formState.isDirty} onClick={() => form.reset()}>
          Discard changes
        </Button>
        <SubmitButton pending={pending}>Save changes</SubmitButton>
      </div>
    </form>
  );
}
