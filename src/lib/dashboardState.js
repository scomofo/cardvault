export async function loadDashboardState(dashboardAPI) {
  const result = await dashboardAPI.get();
  return result && typeof result === "object" ? result : null;
}
