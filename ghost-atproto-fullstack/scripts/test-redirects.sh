#!/bin/bash

# Test script to verify wizard redirects are working

echo "🧪 Testing wizard redirects..."

BASE_URL="http://204.236.176.29"

echo ""
echo "Testing /wizard redirect..."
response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/wizard")
if [ "$response" = "301" ]; then
    echo "✅ /wizard redirects correctly (301)"
else
    echo "❌ /wizard failed - got $response"
fi

echo ""
echo "Testing /wizard/ redirect..."
response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/wizard/")
if [ "$response" = "301" ]; then
    echo "✅ /wizard/ redirects correctly (301)"
else
    echo "❌ /wizard/ failed - got $response"
fi

echo ""
echo "Testing /bridge/wizard endpoint..."
response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/bridge/wizard")
if [ "$response" = "200" ]; then
    echo "✅ /bridge/wizard works correctly (200)"
else
    echo "❌ /bridge/wizard failed - got $response"
fi

echo ""
echo "Testing redirect destination..."
redirect_url=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE_URL/wizard")
if [[ "$redirect_url" == *"/bridge/wizard"* ]]; then
    echo "✅ Redirect destination is correct: $redirect_url"
else
    echo "❌ Redirect destination is wrong: $redirect_url"
fi

echo ""
echo "🎯 Test complete!"
