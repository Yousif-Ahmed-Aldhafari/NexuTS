import "server-only";

import { prisma } from "@/lib/prisma";

import type { HomePageKpiStats } from "./home-page-kpi-types";

const DEFAULT_HOME_PAGE_KPI_STATS: HomePageKpiStats = {
  totalTests: 0,
  failed: 0,
  successRate: 0,
  avgDurationSeconds: 0,
};

const TEST_CASES_TABLE_TYPE = "TEST_CASES";
const SUCCESS_STATUS = "SUCCESS";
const FAIL_STATUS = "FAIL";

export async function getHomePageKpiStats(): Promise<HomePageKpiStats> {
  try {
    const scope = {
      isDeleted: false,
      table: {
        tableType: TEST_CASES_TABLE_TYPE,
      },
    } as const;

    const [totalTests, successCount, failedCount, durationRows] = await Promise.all([
      prisma.entry.count({
        where: scope,
      }),
      prisma.entry.count({
        where: {
          ...scope,
          status: SUCCESS_STATUS,
        },
      }),
      prisma.entry.count({
        where: {
          ...scope,
          status: FAIL_STATUS,
        },
      }),
      prisma.entry.findMany({
        where: scope,
        select: {
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const durationInMilliseconds = durationRows
      .map((entry) => entry.updatedAt.getTime() - entry.createdAt.getTime())
      .filter((duration) => duration > 0);

    const avgDurationSeconds =
      durationInMilliseconds.length > 0
        ? Math.round(
            durationInMilliseconds.reduce((total, duration) => total + duration, 0) /
              durationInMilliseconds.length /
              1000,
          )
        : 0;

    const successRate = totalTests > 0 ? (successCount / totalTests) * 100 : 0;

    return {
      totalTests,
      failed: failedCount,
      successRate,
      avgDurationSeconds,
    };
  } catch (error) {
    console.error("[home-page] Failed to compute KPI stats", error);
    return DEFAULT_HOME_PAGE_KPI_STATS;
  }
}
