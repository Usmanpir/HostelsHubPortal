"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type {
  LeadActivityInput,
  LeadAssignInput,
  LeadDuplicateInput,
  LeadFollowUpInput,
  LeadInput,
  LeadStageInput,
} from "@/lib/validation/real-estate";
import {
  addLeadActivity,
  archiveLead,
  assignLead,
  changeLeadStage,
  createLead,
  findDuplicateLeads,
  setLeadFollowUp,
  updateLead,
} from "@/services/real-estate/lead-service";
import { leadStageLabels } from "@/config/real-estate-labels";

function refresh(id?: string) {
  revalidatePath("/leads");
  if (id) revalidatePath(`/leads/${id}`);
}

export async function createLeadAction(input: LeadInput) {
  return runAction(async () => {
    const lead = await createLead(await tenantOrThrow(), input);
    refresh();
    return { id: lead.id };
  }, "Lead added");
}

export async function updateLeadAction(id: string, input: LeadInput) {
  return runAction(async () => {
    await updateLead(await tenantOrThrow(), id, input);
    refresh(id);
    return { id };
  }, "Lead updated");
}

export async function changeLeadStageAction(id: string, input: LeadStageInput) {
  return runAction(async () => {
    const lead = await changeLeadStage(await tenantOrThrow(), id, input);
    refresh(id);
    return { stage: lead.stage };
  }, `Moved to ${leadStageLabels[input.stage]}`);
}

export async function assignLeadAction(id: string, input: LeadAssignInput) {
  return runAction(async () => {
    await assignLead(await tenantOrThrow(), id, input);
    refresh(id);
    return null;
  }, input.assignedUserId ? "Lead assigned" : "Lead unassigned");
}

export async function setLeadFollowUpAction(id: string, input: LeadFollowUpInput) {
  return runAction(async () => {
    await setLeadFollowUp(await tenantOrThrow(), id, input);
    refresh(id);
    return null;
  }, input.nextFollowUpAt ? "Follow-up scheduled" : "Follow-up cleared");
}

export async function addLeadActivityAction(id: string, input: LeadActivityInput) {
  return runAction(async () => {
    await addLeadActivity(await tenantOrThrow(), id, input);
    refresh(id);
    return null;
  }, "Activity logged");
}

export async function archiveLeadAction(id: string) {
  return runAction(async () => {
    await archiveLead(await tenantOrThrow(), id);
    refresh(id);
    return null;
  }, "Lead archived");
}

export async function findDuplicateLeadsAction(input: LeadDuplicateInput) {
  return runAction(async () => findDuplicateLeads(await tenantOrThrow(), input));
}
