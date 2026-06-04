/**
 * Dashboard Executivo — Verta S.A. People Analytics
 *
 * Server Component: ponto de entrada da rota raiz.
 * Delega toda a interatividade ao DashboardShell (Client Component).
 *
 * LUC-165, LUC-166
 */

import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default function Page() {
  return <DashboardShell />;
}
