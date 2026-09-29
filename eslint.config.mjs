import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// APECAM never signs or sends transactions on a user's behalf (Dev Brief: "Security").
// Login uses plain-text messages only. Anything that could trigger a wallet transaction is banned.
const TX_IDENTIFIERS =
  /^(signTransaction|signAllTransactions|sendTransaction|signAndSendTransaction|sendRawTransaction|writeContract|useSendTransaction|useWriteContract)$/;
const TX_RPC_METHODS = /^eth_(sendTransaction|signTransaction|sendRawTransaction)$/;

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  {
    // Plain Node scripts (.mjs) are not type-checked, so declare the Node globals they use.
    files: ['**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Identifier[name=${TX_IDENTIFIERS}]`,
          message: 'APECAM must never sign or send transactions. Login is message-signing only.',
        },
        {
          selector: `Literal[value=${TX_RPC_METHODS}]`,
          message: 'APECAM must never sign or send transactions. Login is message-signing only.',
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
