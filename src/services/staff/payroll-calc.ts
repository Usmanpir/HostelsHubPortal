/**
 * Pure payroll arithmetic, shared by the payroll service and client-side
 * previews. Kept free of server imports on purpose. Tax or statutory
 * deductions can later be added as additional components here.
 */
export type SalaryComponents = {
  baseSalary: number;
  allowances?: number;
  bonus?: number;
  deductions?: number;
  advances?: number;
};

function cents(n: number | undefined) {
  return Math.round((n ?? 0) * 100);
}

/** net = base + allowances + bonus − deductions − advances (rounded to 2 decimals). */
export function calculateNetSalary(components: SalaryComponents): number {
  const total =
    cents(components.baseSalary) +
    cents(components.allowances) +
    cents(components.bonus) -
    cents(components.deductions) -
    cents(components.advances);
  return total / 100;
}

export function grossSalary(components: SalaryComponents): number {
  return (cents(components.baseSalary) + cents(components.allowances) + cents(components.bonus)) / 100;
}

export function totalDeductions(components: SalaryComponents): number {
  return (cents(components.deductions) + cents(components.advances)) / 100;
}
