-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Table_projectId_idx" ON "Table"("projectId");

-- CreateIndex
CREATE INDEX "Entry_tableId_isDeleted_idx" ON "Entry"("tableId", "isDeleted");
