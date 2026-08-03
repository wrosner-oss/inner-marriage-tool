-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL,
    "birthTime" TEXT,
    "place" TEXT NOT NULL,
    "pronoun" TEXT NOT NULL DEFAULT 'They',
    "email" TEXT,
    "sunSign" TEXT,
    "venusSign" TEXT,
    "marsSign" TEXT,
    "chartJson" TEXT,
    "readingText" TEXT,
    "customNote" TEXT,
    "gapsJson" TEXT,
    "error" TEXT,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "inputsHash" TEXT,
    "draftStatus" TEXT NOT NULL DEFAULT 'none',
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Participant_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sign" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "element" TEXT NOT NULL,
    "identity" TEXT,
    "identityFragment" TEXT,
    "descriptive" TEXT,
    "feminineArchetypes" TEXT,
    "masculineArchetypes" TEXT,
    "fuelKeywords" TEXT
);

-- CreateTable
CREATE TABLE "StructuralBlock" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "template" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Combination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venusSign" TEXT NOT NULL,
    "marsSign" TEXT NOT NULL,
    "questions" TEXT,
    "note" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Combination_venusSign_marsSign_key" ON "Combination"("venusSign", "marsSign");
