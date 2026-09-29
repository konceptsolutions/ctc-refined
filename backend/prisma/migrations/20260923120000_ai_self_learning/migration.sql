-- AI assistant self-learning memory
CREATE TABLE IF NOT EXISTS "AiLearnedFact" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "topic" TEXT,
    "fact" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'remember',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiLearnedFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiLearnedFact_status_updatedAt_idx" ON "AiLearnedFact"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiLearnedFact_userId_status_idx" ON "AiLearnedFact"("userId", "status");

CREATE TABLE IF NOT EXISTS "AiMessageFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "rating" TEXT NOT NULL,
    "userMessage" TEXT NOT NULL,
    "assistantMessage" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessageFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiMessageFeedback_createdAt_idx" ON "AiMessageFeedback"("createdAt");
CREATE INDEX IF NOT EXISTS "AiMessageFeedback_rating_createdAt_idx" ON "AiMessageFeedback"("rating", "createdAt");
