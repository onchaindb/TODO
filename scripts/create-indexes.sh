#!/bin/bash

# Script to create indexes for the TODO app
# Run this after creating your app to set up optimal query performance

APP_ID="app_80a9b8f9525342b7"
API_KEY="dev_key_12345678901234567890123456789012"
BACKEND_URL="http://localhost:9092"

echo "🔨 Creating indexes for TODO app ($APP_ID)..."
echo ""

# Index 1: owner field (most important - every user queries their own todos)
echo "📝 Creating index on 'owner' field..."
curl -X POST "$BACKEND_URL/api/apps/$APP_ID/collections/todos/indexes" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"app_id\": \"$APP_ID\",
    \"collection_name\": \"todos\",
    \"field_name\": \"owner\",
    \"index_config\": {
      \"index_type\": \"Secondary\",
      \"store_values\": true,
      \"compression\": \"LZ4\",
      \"cache_priority\": \"High\",
      \"relationship_hints\": [],
      \"performance_tuning\": {
        \"cache_size_mb\": 50,
        \"compression_level\": 6,
        \"memory_map_size_mb\": 100,
        \"background_merge_interval_sec\": 300,
        \"hot_data_threshold\": 0.8
      }
    }
  }"
echo ""
echo ""

# Index 2: id field (for fast lookups when updating/deleting)
echo "📝 Creating index on 'id' field..."
curl -X POST "$BACKEND_URL/api/apps/$APP_ID/collections/todos/indexes" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"app_id\": \"$APP_ID\",
    \"collection_name\": \"todos\",
    \"field_name\": \"id\",
    \"index_config\": {
      \"index_type\": \"Primary\",
      \"store_values\": true,
      \"compression\": \"LZ4\",
      \"cache_priority\": \"Critical\",
      \"relationship_hints\": [],
      \"performance_tuning\": {
        \"cache_size_mb\": 30,
        \"compression_level\": 4,
        \"memory_map_size_mb\": 80,
        \"background_merge_interval_sec\": 180,
        \"hot_data_threshold\": 0.9
      }
    }
  }"
echo ""
echo ""

# Optional: completed field (if you want to filter by completion status)
echo "📝 Creating index on 'completed' field..."
curl -X POST "$BACKEND_URL/api/apps/$APP_ID/collections/todos/indexes" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"app_id\": \"$APP_ID\",
    \"collection_name\": \"todos\",
    \"field_name\": \"completed\",
    \"index_config\": {
      \"index_type\": \"Secondary\",
      \"store_values\": false,
      \"compression\": \"LZ4\",
      \"cache_priority\": \"High\",
      \"relationship_hints\": [],
      \"performance_tuning\": {
        \"cache_size_mb\": 20,
        \"compression_level\": 4,
        \"memory_map_size_mb\": 50,
        \"background_merge_interval_sec\": 300,
        \"hot_data_threshold\": 0.7
      }
    }
  }"
echo ""
echo ""

echo "✅ Indexes created successfully!"
echo ""
echo "To verify indexes:"
echo "curl \"$BACKEND_URL/api/apps/$APP_ID/indexes?api_key=$API_KEY\" | jq"
