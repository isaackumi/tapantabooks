import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Playwright fixtures receive a `use` callback that is not React's `use` hook.
    files: ["tests/e2e/**"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    files: ["src/**"],
    ignores: ["src/mock/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/mock/seed",
              message: "Demo ids do not exist in a real tenant. Read defaults from organisation settings or an API response.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "test-results/**",
      "playwright-report/**",
    ],
  },
];

export default eslintConfig;
