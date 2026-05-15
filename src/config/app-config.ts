import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "NexuTS",
  version: packageJson.version,
  copyright: `© ${currentYear}, Nexumind. All rights reserved.`,
  meta: {
    title: "NexuTS | AI-Powered Testing System",
    description:
      "NexuTS is an enterprise-grade, AI-powered software testing platform developed by Nexumind. Built with Next.js 15, Tailwind CSS, and Playwright, it enables seamless automated test execution through natural language prompts and visual builders.",
  },
};
