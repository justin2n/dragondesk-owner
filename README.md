# DragonDesk: CRM

A comprehensive operations platform for martial arts studios offering Brazilian Jiu Jitsu, Muay Thai, and Taekwondo programs.

## Features

### Core CRM Functionality
- **Member Management**: Manage leads, trialers, and members with detailed profiles
- **Authentication**: Role-based access control with Admin and Staff users
- **Member Profiles**: Track membership type, account tier, program, age group, ranking, and custom notes
- **Ranking System**: Program-specific belt/ranking systems
  - BJJ: White, Blue, Brown, Black
  - Muay Thai: White, Green, Purple, Blue, Red
  - Taekwondo: White, Yellow, Orange, Green, Purple, Blue, Red, Brown, Il Dan Bo, Black

### Customer Data Platform (CDP)
- **Audience Builder**: Create targeted audiences based on multiple criteria
- **Advanced Filtering**: Filter by membership type, program, age group, account tier, and custom tags
- **Real-time Member Counts**: See how many members match your audience criteria

### DragonDesk: Optimize (Website Personalization)
- **A/B Testing**: Create experiments with different headlines and CTAs
- **Audience Targeting**: Show different content to different member segments
- **Visual Editor**: Design and manage website personalization campaigns
- **Test Status Tracking**: Monitor draft, running, and completed tests

### DragonDesk: Engage (Email Marketing)
- **Email Campaigns**: Send targeted emails to specific audiences
- **Campaign Management**: Draft, active, paused, and completed campaign states
- **Audience Integration**: Leverage CDP audiences for precise targeting
- **Custom Content**: Create personalized email content and subject lines

### DragonDesk: Outreach (AI Call Agent)
- **AI-Powered Calls**: Deploy conversational AI to contact members
- **Script Management**: Create and manage call scripts for different scenarios
- **Call Goals**: Define objectives like scheduling trials or answering questions
- **Audience Targeting**: Reach specific member segments automatically

## Technology Stack

### Backend
- Node.js + Express
- TypeScript
- SQLite database
- JWT authentication
- bcryptjs for password hashing

### Frontend
- React 19
- TypeScript
- React Router for navigation
- CSS Modules for styling
- Vite for build tooling

## Getting Started

### Prerequisites
- Node.js 24.x or higher
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create your `.env` file:
```bash
cp .env.example .env
```

4. Start the development servers:
```bash
npm run dev
```

This will start both the backend API server (port 5000) and the frontend dev server (port 3000).

### Initial Setup

1. Create the default admin user:
```bash
curl -X POST http://localhost:5000/api/auth/init-admin
```

2. Login with the default credentials:
   - Username: `admin`
   - Password: `admin123`
   - **Important**: Change this password immediately after first login

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user (admin/staff)
- `POST /api/auth/login` - Login
- `POST /api/auth/init-admin` - Create initial admin user

### Members
- `GET /api/members` - Get all members (with optional filters)
- `GET /api/members/:id` - Get specific member
- `POST /api/members` - Create new member
- `PUT /api/members/:id` - Update member
- `DELETE /api/members/:id` - Delete member

### Audiences
- `GET /api/audiences` - Get all audiences
- `GET /api/audiences/:id` - Get specific audience
- `GET /api/audiences/:id/members` - Get members in audience
- `POST /api/audiences` - Create audience
- `PUT /api/audiences/:id` - Update audience
- `DELETE /api/audiences/:id` - Delete audience

### Campaigns
- `GET /api/campaigns` - Get all campaigns (filter by type)
- `GET /api/campaigns/:id` - Get specific campaign
- `POST /api/campaigns` - Create campaign
- `PUT /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign

### A/B Tests
- `GET /api/abtests` - Get all A/B tests
- `GET /api/abtests/:id` - Get specific test
- `POST /api/abtests` - Create test
- `PUT /api/abtests/:id` - Update test
- `DELETE /api/abtests/:id` - Delete test

## Color Scheme

The platform uses a consistent color scheme:
- **Primary Black**: #000000 (backgrounds)
- **Dark Grey**: #1a1a1a (cards, sidebar)
- **Grey**: #2a2a2a (inputs, hover states)
- **Light Grey**: #3a3a3a (accents)
- **Red**: #dc2626 (primary actions, highlights)
- **Red Hover**: #b91c1c (button hover states)

## User Roles

### Admin Users
- Full access to all features
- Can modify application settings
- Can manage all users
- Can perform all CRUD operations

### Staff Users
- Can manage leads, trialers, and members
- Can create and manage audiences
- Can create and manage campaigns
- Cannot modify system settings
- Cannot manage user accounts

## Member Types

- **Lead**: Prospective member who has shown interest
- **Trialer**: Member on trial period
- **Member**: Active paying member

## Account Tiers

- **Basic**: Standard membership
- **Premium**: Enhanced membership with additional benefits
- **Elite**: Top-tier membership with full access
- **Family**: Family package membership

## Development

### Project Structure
```
dojodesk-crm/
├── src/
│   ├── client/           # Frontend React app
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── contexts/     # React contexts
│   │   ├── utils/        # Utility functions
│   │   └── types/        # TypeScript types
│   └── server/           # Backend Express app
│       ├── routes/       # API routes
│       ├── models/       # Database models
│       ├── middleware/   # Express middleware
│       └── types/        # TypeScript types
├── public/               # Static assets
└── dist/                 # Build output
```

### Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:server` - Start only backend server
- `npm run dev:client` - Start only frontend dev server
- `npm run build` - Build for production
- `npm start` - Start production server

## Contributing

This is a custom-built CRM for martial arts studios. For feature requests or bug reports, please contact the development team.

## License

Proprietary - All rights reserved

## Support

For technical support or questions, please contact your system administrator.

---

Built with ❤️ for martial arts studios
