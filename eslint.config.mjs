import { FlatCompat } from "@eslint/eslintrc"

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

const eslintConfig = [
  // `.claude/**` covers local git worktrees, which are full copies of this
  // repo — without it, a local `npm run lint` reports every finding twice.
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", ".claude/**", "dist/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `const { omitMe: _omitMe, ...rest } = obj` is the idiomatic way to drop
      // a key; the binding is deliberately unused. An `_` prefix opts out.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
]

export default eslintConfig
