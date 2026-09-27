"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type {
  ExpenseCategoryInput,
  ExpenseInput,
  GenerateInvoicesInput,
  InvoiceInput,
  PaymentInput,
  RefundInput,
} from "@/lib/validation/finance";
import { cancelInvoice, createInvoice, issueInvoice, updateInvoice } from "@/services/finance/invoice-service";
import { applyCreditToInvoice, recordPayment, recordRefund, voidPayment } from "@/services/finance/payment-service";
import { generateMonthlyInvoices, previewMonthlyInvoices } from "@/services/finance/monthly-billing-service";
import {
  createExpense,
  createExpenseCategory,
  deleteExpenseCategory,
  updateExpense,
  voidExpense,
} from "@/services/finance/expense-service";
import { getResidentBillingContext, searchBillableResidents } from "@/services/finance/billing-residents";

// Thin wrappers: the services validate, authorize and audit.

function revalidateFinance() {
  revalidatePath("/finance", "layout");
}

// ─── Invoices ───────────────────────────────────────────────────────────────

export async function createInvoiceAction(input: InvoiceInput) {
  return runAction(async () => {
    const invoice = await createInvoice(await tenantOrThrow(), input);
    revalidateFinance();
    return { id: invoice.id, status: invoice.status };
  }, "Invoice saved");
}

export async function updateInvoiceAction(id: string, input: InvoiceInput) {
  return runAction(async () => {
    const invoice = await updateInvoice(await tenantOrThrow(), id, input);
    revalidateFinance();
    return { id: invoice.id, status: invoice.status };
  }, "Invoice updated");
}

export async function issueInvoiceAction(id: string) {
  return runAction(async () => {
    await issueInvoice(await tenantOrThrow(), id);
    revalidateFinance();
    return null;
  }, "Invoice issued");
}

export async function cancelInvoiceAction(id: string, reason?: string) {
  return runAction(async () => {
    await cancelInvoice(await tenantOrThrow(), id, reason ?? "");
    revalidateFinance();
    return null;
  }, "Invoice cancelled");
}

export async function applyCreditAction(invoiceId: string) {
  return runAction(async () => {
    const payment = await applyCreditToInvoice(await tenantOrThrow(), invoiceId);
    revalidateFinance();
    return { id: payment.id, amount: payment.amount };
  }, "Credit applied");
}

export async function previewMonthlyInvoicesAction(input: GenerateInvoicesInput) {
  return runAction(async () => previewMonthlyInvoices(await tenantOrThrow(), input));
}

export async function generateMonthlyInvoicesAction(input: GenerateInvoicesInput) {
  return runAction(async () => {
    const result = await generateMonthlyInvoices(await tenantOrThrow(), input);
    revalidateFinance();
    return result;
  });
}

// ─── Payments ───────────────────────────────────────────────────────────────

export async function recordPaymentAction(input: PaymentInput) {
  return runAction(async () => {
    const payments = await recordPayment(await tenantOrThrow(), input);
    revalidateFinance();
    return { id: payments[0]!.id, receiptNumbers: payments.map((p) => p.receiptNumber) };
  }, "Payment recorded");
}

export async function voidPaymentAction(id: string, reason?: string) {
  return runAction(async () => {
    await voidPayment(await tenantOrThrow(), id, reason ?? "");
    revalidateFinance();
    return null;
  }, "Payment voided");
}

export async function recordRefundAction(input: RefundInput) {
  return runAction(async () => {
    const refund = await recordRefund(await tenantOrThrow(), input);
    revalidateFinance();
    return { id: refund.id, receiptNumber: refund.receiptNumber };
  }, "Refund recorded");
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export async function createExpenseAction(input: ExpenseInput) {
  return runAction(async () => {
    const expense = await createExpense(await tenantOrThrow(), input);
    revalidateFinance();
    return { id: expense.id };
  }, "Expense recorded");
}

export async function updateExpenseAction(id: string, input: ExpenseInput) {
  return runAction(async () => {
    await updateExpense(await tenantOrThrow(), id, input);
    revalidateFinance();
    return { id };
  }, "Expense updated");
}

export async function voidExpenseAction(id: string, reason?: string) {
  return runAction(async () => {
    await voidExpense(await tenantOrThrow(), id, reason ?? "");
    revalidateFinance();
    return null;
  }, "Expense voided");
}

export async function createExpenseCategoryAction(input: ExpenseCategoryInput) {
  return runAction(async () => {
    const category = await createExpenseCategory(await tenantOrThrow(), input);
    revalidateFinance();
    return { id: category.id, name: category.name };
  }, "Category added");
}

export async function deleteExpenseCategoryAction(id: string) {
  return runAction(async () => {
    await deleteExpenseCategory(await tenantOrThrow(), id);
    revalidateFinance();
    return null;
  }, "Category deleted");
}

// ─── Billing lookups (used by the invoice / payment / refund forms) ─────────

export async function searchBillableResidentsAction(q: string) {
  return runAction(async () => searchBillableResidents(await tenantOrThrow(), q));
}

export async function residentBillingContextAction(residentId: string) {
  return runAction(async () => getResidentBillingContext(await tenantOrThrow(), residentId));
}
