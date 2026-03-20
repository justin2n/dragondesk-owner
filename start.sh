#!/bin/bash

echo "🥋 Starting DojoDesk: CRM..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if admin user exists, if not create it
echo "👤 Checking for admin user..."
sleep 2
curl -s -X POST http://localhost:5000/api/auth/init-admin > /dev/null 2>&1 || true

echo ""
echo "✅ DojoDesk: CRM is ready!"
echo ""
echo "📍 Frontend: http://localhost:3000"
echo "📍 Backend API: http://localhost:5000"
echo ""
echo "🔐 Default Login:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "Press Ctrl+C to stop the servers"
echo ""

# Start the development servers
npm run dev
