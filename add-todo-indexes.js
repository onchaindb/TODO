#!/usr/bin/env node

/**
 * Add TODO Field Indexes - OnChainDB TODO App
 *
 * This script adds the necessary field indexes for todos:
 * - owner (hash index - most important for user queries)
 * - id (btree with unique constraint - for fast lookups and version deduplication)
 * - completed (hash index - for filtering by status)
 *
 * Usage:
 *   node add-todo-indexes.js --app-id app_your_app_id [--endpoint http://localhost:9092]
 */

// Configuration
const CONFIG = {
  endpoint: process.env.ONCHAINDB_ENDPOINT || 'http://localhost:9092',
  apiKey: process.env.ONCHAINDB_API_KEY || 'dev_key_12345678901234567890123456789012',
  appId: null, // Set via CLI argument
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app-id' && args[i + 1]) {
      CONFIG.appId = args[i + 1];
      i++;
    } else if (args[i] === '--endpoint' && args[i + 1]) {
      CONFIG.endpoint = args[i + 1];
      i++;
    }
  }

  if (!CONFIG.appId) {
    console.error('❌ Error: --app-id is required');
    console.log('\nUsage: node add-todo-indexes.js --app-id app_your_app_id [--endpoint http://localhost:9092]');
    process.exit(1);
  }
}

// Index configurations for the main collection
const TODO_INDEXES = [
  {
    name: 'owner',
    field: 'owner',
    type: 'Hash',
    unique: false,
    storeValues: true,
    description: 'Fast lookup of todos by owner address',
  },
  {
    name: 'id',
    field: 'id',
    type: 'BTree',
    unique: true,
    storeValues: true,
    description: 'Unique constraint for version deduplication',
  },
  {
    name: 'completed',
    field: 'completed',
    type: 'Hash',
    unique: false,
    storeValues: false,
    description: 'Filter todos by completion status',
  },
];

// Create a single index
async function createIndex(collection, indexConfig) {
  const response = await fetch(`${CONFIG.endpoint}/api/apps/${CONFIG.appId}/indexes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': CONFIG.apiKey,
    },
    body: JSON.stringify({
      name: indexConfig.name,
      collection: collection,
      field_name: indexConfig.field,
      index_type: indexConfig.type,
      unique: indexConfig.unique,
      store_values: indexConfig.storeValues,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Check if it's just because the index already exists
    if (errorText.includes('already exists') || errorText.includes('Index already exists')) {
      return { status: 'skipped', message: 'Index already exists' };
    }

    throw new Error(`Failed to create index ${indexConfig.name}: ${errorText}`);
  }

  return await response.json();
}

// Create all indexes
async function addTodoIndexes() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   OnChainDB TODO App Index Creator              ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🆔 App ID: ${CONFIG.appId}\n`);

  const collection = 'main'; // TODO app uses 'main' collection
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  console.log(`📦 Collection: ${collection}`);
  console.log(`   Creating ${TODO_INDEXES.length} indexes...\n`);

  for (const indexConfig of TODO_INDEXES) {
    try {
      console.log(`⏳ Creating index: ${indexConfig.name} (${indexConfig.type})...`);
      console.log(`   Description: ${indexConfig.description}`);

      const result = await createIndex(collection, indexConfig);

      if (result.status === 'skipped') {
        totalSkipped++;
        console.log(`⏭️  Index already exists, skipping`);
      } else {
        totalCreated++;
        console.log(`✅ Index created successfully`);
      }

      if (indexConfig.unique) {
        console.log(`   🔑 Unique constraint enabled - will deduplicate by ${indexConfig.field}`);
      }

      console.log('');
    } catch (err) {
      totalFailed++;
      console.error(`❌ Failed to create index ${indexConfig.name}: ${err.message}\n`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════\n');
  console.log(`✅ Index creation complete!`);
  console.log(`   Total indexes: ${TODO_INDEXES.length}`);
  console.log(`   Created: ${totalCreated}`);
  console.log(`   Skipped: ${totalSkipped}`);
  console.log(`   Failed: ${totalFailed}\n`);

  // Query benefits
  console.log('🔍 Benefits:');
  console.log('   • Fast queries by owner (hash index)');
  console.log('   • Fast lookups by ID (unique btree index)');
  console.log('   • Filter by completed status (hash index)');
  console.log('   • Automatic version deduplication using unique ID constraint\n');

  if (totalFailed === 0) {
    console.log('🎉 All indexes are now ready!');
    console.log('💡 Version deduplication: The unique index on "id" ensures only');
    console.log('   the latest version of each TODO is returned in queries.\n');
    return true;
  } else {
    console.log('⚠️  Some indexes failed. Check the errors above.\n');
    return false;
  }
}

// Main function
async function main() {
  parseArgs();

  try {
    const success = await addTodoIndexes();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run
main();

module.exports = { addTodoIndexes, TODO_INDEXES };
