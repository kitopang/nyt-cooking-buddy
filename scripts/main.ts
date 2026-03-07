import * as readline from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import { getLists, getAggregatedIngredients } from './api-client.ts';
import { AmazonFresh } from './amazon-fresh.ts';
import type { GroceryList } from './types.ts';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = argv.slice(2);
const dryRun = args.includes('--dry-run');
const listIdArg = (() => {
  const i = args.indexOf('--list-id');
  if (i !== -1 && args[i + 1]) return parseInt(args[i + 1]!, 10);
  return null;
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: stdin, output: stdout });

async function prompt(question: string): Promise<string> {
  return rl.question(question);
}

async function pickList(lists: GroceryList[]): Promise<GroceryList> {
  console.log('\nAvailable grocery lists:');
  lists.forEach((l, i) => {
    console.log(`  [${i}] ${l.name}  (${l.recipeCount} recipe${l.recipeCount !== 1 ? 's' : ''})`);
  });
  const answer = await prompt('\nSelect list number: ');
  const index = parseInt(answer.trim(), 10);
  if (isNaN(index) || index < 0 || index >= lists.length) {
    console.error('Invalid selection.');
    exit(1);
  }
  return lists[index]!;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Fetch lists
  console.log('Fetching grocery lists…');
  const lists = await getLists().catch((err: unknown) => {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    exit(1);
  });

  if (lists.length === 0) {
    console.log('No grocery lists found. Save some recipes in the extension first.');
    exit(0);
  }

  // 2. Pick list
  let list: GroceryList;
  if (listIdArg !== null) {
    const found = lists.find((l) => l.id === listIdArg);
    if (!found) {
      console.error(`List with id ${listIdArg} not found.`);
      exit(1);
    }
    list = found;
  } else {
    list = await pickList(lists);
  }

  // 3. Fetch aggregated unchecked ingredients
  console.log(`\nFetching ingredients for "${list.name}"…`);
  const ingredients = await getAggregatedIngredients(list.id).catch((err: unknown) => {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    exit(1);
  });

  if (ingredients.length === 0) {
    console.log('No unchecked ingredients found for this list.');
    exit(0);
  }

  // 4. Print shopping list
  console.log(`\n${ingredients.length} ingredient${ingredients.length !== 1 ? 's' : ''} to order:\n`);
  ingredients.forEach((ing) => {
    const display = ing.totalQuantity ?? ing.recipes[0]?.rawText ?? ing.name;
    console.log(`  • ${display}`);
  });

  // 5. Dry run exits here
  if (dryRun) {
    console.log('\n[Dry run] Done. No browser opened.');
    rl.close();
    return;
  }

  // 6. Confirm before opening browser
  await prompt('\nPress Enter to open Amazon Fresh and start adding to cart…');

  const fresh = new AmazonFresh();
  await fresh.open();

  await fresh.waitForUser(
    'Log in to Amazon Fresh if prompted, then press Enter to continue…'
  );

  // 7. Add each ingredient
  console.log('\nAdding ingredients to cart:\n');
  const succeeded: string[] = [];
  const failed: { name: string; note?: string }[] = [];

  for (const ing of ingredients) {
    process.stdout.write(`  Adding "${ing.name}"… `);
    const result = await fresh.addIngredient(ing);
    if (result.success) {
      console.log('✓');
      succeeded.push(ing.name);
    } else {
      console.log(`✗  (${result.note ?? 'unknown error'})`);
      failed.push({ name: ing.name, note: result.note });
    }
  }

  await fresh.close();
  rl.close();

  // 8. Summary
  console.log(`\n─────────────────────────────────`);
  console.log(`Done: ${succeeded.length} added, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log('\nFailed items (add manually):');
    failed.forEach(({ name, note }) => console.log(`  • ${name}${note ? `  — ${note}` : ''}`));
  }
  console.log('\nReview your Amazon Fresh cart and check out manually.');
}

main().catch((err: unknown) => {
  console.error(err);
  exit(1);
});
