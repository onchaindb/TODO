/**
 * Complete Index Setup for OnChainDB TODO App
 *
 * This creates ALL necessary indexes for:
 * - main collection (todos)
 *
 * Indexes improve query performance for:
 * - Finding todos by owner (most common query)
 * - Looking up todos by ID (for updates/deletes)
 * - Filtering by completion status
 * - Sorting by creation/update date
 */

const dotenv = require('dotenv');

dotenv.config();

const { createClient } = require('@onchaindb/sdk');

console.log(process.env.NEXT_PUBLIC_ONCHAINDB_ENDPOINT);
// Configuration from environment variables
const CONFIG = {
    endpoint: process.env.NEXT_PUBLIC_ONCHAINDB_ENDPOINT || 'http://localhost:9092',
    apiKey: process.env.NEXT_PUBLIC_ONCHAINDB_API_KEY || '',
    appId: process.env.NEXT_PUBLIC_ONCHAINDB_APP_ID || ''
};

console.log('CONFIG', CONFIG);

if (!CONFIG.endpoint) {
    throw new Error('NEXT_PUBLIC_ONCHAINDB_API_KEY environment variable is required');
}

if (!CONFIG.appId) {
    throw new Error('NEXT_PUBLIC_ONCHAINDB_APP_ID environment variable is required');
}

// Index definitions for the main collection (todos)
const INDEXES = {
    // =====================================
    // MAIN COLLECTION (TODOS)
    // =====================================
    main: [
        {
            name: 'todos_id_unique',
            field_name: 'id',
            index_type: 'Hash',
            store_values: true,
            unique_constraint: true,
            sort_enabled: false,
            description: 'Primary key - fast O(1) todo lookup by ID'
        },
        {
            name: 'todos_owner_index',
            field_name: 'owner',
            index_type: 'Hash',
            store_values: true,
            unique_constraint: false,
            sort_enabled: false,
            description: 'Find all todos for a specific owner (wallet address)'
        },
        {
            name: 'todos_completed_at_filter',
            field_name: 'completedAt',
            index_type: 'Hash',
            store_values: true,
            unique_constraint: false,
            sort_enabled: false,
            description: 'Filter todos by completion status (null = not completed)'
        },
        {
            name: 'todos_deleted_at_filter',
            field_name: 'deletedAt',
            index_type: 'Hash',
            store_values: true,
            unique_constraint: false,
            sort_enabled: false,
            description: 'Filter out deleted todos (soft delete)'
        },
        {
            name: 'todos_created_at_sort',
            field_name: 'createdAt',
            index_type: 'Hash',
            store_values: true,
            unique_constraint: false,
            sort_enabled: true,
            description: 'Sort todos by creation date'
        },
        {
            name: 'todos_updated_at_sort',
            field_name: 'updatedAt',
            index_type: 'Hash',
            store_values: true,
            unique_constraint: false,
            sort_enabled: true,
            description: 'Sort todos by last update date (for versioning)'
        }
    ]
};

async function createIndexes() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║   OnChainDB TODO App - Complete Index Setup         ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
    console.log(`🆔 App ID: ${CONFIG.appId}\n`);

    try {
        const client = createClient({
            endpoint: CONFIG.endpoint,
            apiKey: CONFIG.apiKey,
            appId: CONFIG.appId
        });

        console.log('✅ SDK client initialized\n');

        let totalCreated = 0;
        let totalSkipped = 0;
        let totalFailed = 0;
        let totalIndexes = 0;

        // Process each collection
        for (const [collection, indexes] of Object.entries(INDEXES)) {
            console.log(`\n${'═'.repeat(60)}`);
            console.log(`📦 COLLECTION: ${collection.toUpperCase()}`);
            console.log(`   Creating ${indexes.length} indexes...\n`);

            for (const indexDef of indexes) {
                totalIndexes++;
                console.log(`⏳ ${indexDef.name}`);
                console.log(`   Field: ${indexDef.field_name}`);
                console.log(`   Type: ${indexDef.index_type}`);
                console.log(`   Description: ${indexDef.description}`);

                try {
                    await client.createIndex({
                        name: indexDef.field_name,
                        collection: collection,
                        field_name: indexDef.field_name,
                        index_type: indexDef.index_type,
                        store_values: indexDef.store_values,
                        unique_constraint: indexDef.unique_constraint,
                        sort_enabled: indexDef.sort_enabled
                    });

                    totalCreated++;
                    console.log(`   ✅ Created successfully`);

                    if (indexDef.unique_constraint) {
                        console.log(`   🔑 Unique constraint enabled`);
                    }
                } catch (error) {
                    console.log(error);
                    if (error.message && error.message.includes('already exists')) {
                        totalSkipped++;
                        console.log(`   ⏭️  Already exists (skipped)`);
                    } else {
                        totalFailed++;
                        console.log(`   ❌ Failed: ${error.message}`);
                    }
                }

                console.log('');
                // Small delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 INDEX CREATION SUMMARY');
        console.log('═'.repeat(60));
        console.log(`✅ Successfully created: ${totalCreated}`);
        console.log(`⏭️  Already existed (skipped): ${totalSkipped}`);
        console.log(`❌ Failed: ${totalFailed}`);
        console.log(`📈 Total indexes processed: ${totalIndexes}`);
        console.log(`🎯 Success rate: ${(((totalCreated + totalSkipped) / totalIndexes) * 100).toFixed(1)}%\n`);

        if (totalFailed === 0) {
            console.log('🎉 All indexes are ready! Your TODO app is fully optimized!\n');
            return true;
        } else {
            console.log('⚠️  Some indexes failed. Check errors above.\n');
            return false;
        }

    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        console.error(error.stack);
        return false;
    }
}

// Run the script
if (require.main === module) {
    createIndexes().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { createIndexes, INDEXES };
