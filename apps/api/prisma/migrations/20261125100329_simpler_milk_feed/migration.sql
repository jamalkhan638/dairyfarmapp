-- AlterTable
ALTER TABLE "FeedConsumption" ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'DAY';

-- AlterTable
ALTER TABLE "MilkUsage" ADD COLUMN     "session" "MilkSession";
