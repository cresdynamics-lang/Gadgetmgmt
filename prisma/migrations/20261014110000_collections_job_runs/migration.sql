CREATE TABLE "ScheduledJobRun" (
  "id" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "updatedPlans" INTEGER NOT NULL DEFAULT 0,
  "queuedReminders" INTEGER NOT NULL DEFAULT 0,
  "queuedDigests" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduledJobRun_status_check" CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
);

CREATE INDEX "ScheduledJobRun_jobName_startedAt_idx" ON "ScheduledJobRun"("jobName", "startedAt");
