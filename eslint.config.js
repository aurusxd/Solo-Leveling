import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

// Time must come from Clock so domain logic and services stay deterministic in tests.
const noWallClock = [
	{
		selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
		message: 'Use Clock instead of Date.now().'
	},
	{
		selector: "NewExpression[callee.name='Date'][arguments.length=0]",
		message: 'Use Clock instead of new Date().'
	}
];

// Environment is read in exactly one place, src/lib/server/config.ts.
const privateEnvImport = {
	group: ['$app/env/private'],
	message: 'Read configuration through #lib/server/config.'
};

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{ ignores: ['drizzle/', 'research/', 'index.html'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint recommends disabling no-undef on TypeScript projects.
			'no-undef': 'off',
			'no-console': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		files: ['src/**'],
		ignores: ['src/lib/server/config.ts'],
		rules: {
			'no-restricted-properties': [
				'error',
				{
					object: 'process',
					property: 'env',
					message: 'Read configuration through #lib/server/config.'
				}
			],
			'no-restricted-imports': ['error', { patterns: [privateEnvImport] }]
		}
	},
	{
		files: ['src/lib/domain/**', 'src/lib/server/services/**'],
		ignores: ['src/lib/domain/clock.ts'],
		rules: { 'no-restricted-syntax': ['error', ...noWallClock] }
	},
	{
		// The domain is pure: no IO, no framework, no database.
		files: ['src/lib/domain/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$app/*', '@sveltejs/*'],
							message: 'Domain must not depend on SvelteKit.'
						},
						{
							group: ['#lib/server/*', '**/server/**'],
							message: 'Domain must not import server code.'
						},
						{
							group: ['#lib/client/*', '**/client/**'],
							message: 'Domain must not import client code.'
						},
						{
							group: ['drizzle-orm', 'drizzle-orm/*', 'pg', 'pg-boss'],
							message: 'Domain must not touch the database.'
						},
						{ group: ['node:*'], message: 'Domain must stay runtime-agnostic.' }
					]
				}
			]
		}
	},
	{
		// SQL lives only in repositories.
		files: ['src/routes/**', 'src/lib/server/services/**', 'src/lib/client/**', 'src/lib/ui/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						privateEnvImport,
						{
							group: ['drizzle-orm', 'drizzle-orm/*'],
							message: 'Use a repository for database access.'
						}
					]
				}
			]
		}
	}
);
