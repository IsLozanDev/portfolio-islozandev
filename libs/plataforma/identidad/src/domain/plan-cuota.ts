/** Mismo orden que los planes de ORG, de menor a mayor. */
export const PLANES_CUOTA = ['BASICO', 'PRO', 'EMPRESA'] as const;

export type PlanCuota = (typeof PLANES_CUOTA)[number];

export type IncluidasPorPlan = Readonly<Record<PlanCuota, number>>;

/** Un tenant sin suscripción vigente recibe la cuota del plan más bajo. */
export const PLAN_SIN_SUSCRIPCION: PlanCuota = 'BASICO';

export function esPlanCuota(valor: string): valor is PlanCuota {
  return (PLANES_CUOTA as readonly string[]).includes(valor);
}

export function planMasAlto(planes: readonly PlanCuota[]): PlanCuota {
  return planes.reduce(
    (mayor, plan) => (PLANES_CUOTA.indexOf(plan) > PLANES_CUOTA.indexOf(mayor) ? plan : mayor),
    PLAN_SIN_SUSCRIPCION,
  );
}

export function incluidasDe(plan: PlanCuota, tabla: IncluidasPorPlan): number {
  return tabla[plan];
}
