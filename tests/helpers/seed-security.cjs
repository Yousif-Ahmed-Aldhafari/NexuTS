const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const password = "SyntheticPassword#2026!";

async function seedSecurityFixture(databaseUrl) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  try {
    const anchor = await prisma.user.create({
      data: {
        name: "Synthetic Test Anchor",
        email: "security.anchor@synthetic.local",
        role: "ADMIN",
        password: await bcrypt.hash("SyntheticAnchor#2026!", 12),
      },
    });
    await prisma.project.create({ data: { name: "Synthetic Fixture Project", userId: anchor.id } });
    return anchor;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedE2eFixture(databaseUrl) {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  try {
    const [admin, member, outsider] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Synthetic E2E Administrator",
          email: "e2e.admin@synthetic.local",
          role: "ADMIN",
          password: await bcrypt.hash(password, 12),
        },
      }),
      prisma.user.create({
        data: {
          name: "Synthetic E2E Member",
          email: "e2e.member@synthetic.local",
          password: await bcrypt.hash(password, 12),
        },
      }),
      prisma.user.create({
        data: {
          name: "Synthetic E2E Outsider",
          email: "e2e.outsider@synthetic.local",
          password: await bcrypt.hash(password, 12),
        },
      }),
    ]);
    const foreignProject = await prisma.project.create({
      data: { name: "Synthetic Foreign Project", userId: outsider.id, createdBy: outsider.name },
    });
    return { admin, member, outsider, foreignProject };
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { password, seedE2eFixture, seedSecurityFixture };
