# Frontend Specification

> Comprehensive specification for the Rutgers SOC AI Assistant frontend application.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Pages & Navigation](#pages--navigation)
5. [Schedule Grid](#schedule-grid)
6. [Course Browser](#course-browser)
7. [AI Chat Interface](#ai-chat-interface)
8. [Authentication & User Data](#authentication--user-data)
9. [State Management](#state-management)
10. [Real-time Updates](#real-time-updates)
11. [Export & Sharing](#export--sharing)
12. [Visual Design](#visual-design)
13. [Responsive Design](#responsive-design)
14. [Error Handling](#error-handling)
15. [Deferred Features](#deferred-features)

---

## Overview

An AI-powered course scheduling assistant for Rutgers University students. The application provides a hybrid experience combining a full-featured course browser, visual schedule builder, and conversational AI assistant.

### Core Principles

- **Anonymous-first**: Users can build schedules without logging in
- **AI-assisted**: Natural language queries for complex course searches
- **Visual scheduling**: Intuitive drag-and-drop grid with conflict detection
- **Award-winning design**: Modern, polished, premium user experience

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         First Visit                              │
│  User lands directly in app (no landing page)                   │
│  → Schedule grid (empty) + floating chat (open) + course browser│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Anonymous Usage                             │
│  • Search/browse courses                                         │
│  • Add sections to schedule (localStorage)                       │
│  • Chat with AI assistant                                        │
│  • Export schedule (image, index list)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (optional)
┌─────────────────────────────────────────────────────────────────┐
│                         Login                                    │
│  • localStorage schedule auto-merges to account                 │
│  • Save multiple named schedules                                │
│  • Track completed courses                                       │
│  • Persist chat history and preferences                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend Framework

| Technology | Purpose |
|------------|---------|
| **Next.js 14+** | React framework with App Router |
| **Cedar OS** | AI-native UI components, Mastra integration |
| **Tailwind CSS** | Utility-first styling |
| **TypeScript** | Type safety |

### Backend Integration

| Service | Purpose |
|---------|---------|
| **Mastra Agent** | AI backend at `http://localhost:4112/api` |
| **Supabase** | Database (courses, sections) + Auth |
| **Vercel** | Deployment platform |

### Key Dependencies

```json
{
  "dependencies": {
    "next": "^14.x",
    "react": "^18.x",
    "cedar-os": "latest",
    "@supabase/supabase-js": "^2.x",
    "tailwindcss": "^3.x",
    "zustand": "^4.x",
    "date-fns": "^3.x"
  }
}
```

---

## Architecture

### Component Hierarchy

```
App
├── Layout
│   ├── Header
│   │   ├── Logo / App Name (TBD)
│   │   ├── Navigation (Home, Browse, Settings)
│   │   ├── TermSelector (dropdown)
│   │   ├── ScheduleSelector (dropdown, logged-in only)
│   │   └── AuthButton (Login / User Menu)
│   │
│   ├── Main Content (per page)
│   │
│   └── ChatInterface (floating or side panel)
│       ├── ChatToggle (floating button when collapsed)
│       ├── ChatModal / ChatSidePanel
│       │   ├── ChatHeader (mode toggle, close)
│       │   ├── ChatMessages (streaming)
│       │   ├── StarterPrompts (contextual)
│       │   └── ChatInput
│       └── SchedulePreview (ghost blocks for AI proposals)
│
├── HomePage
│   ├── ScheduleGrid
│   │   ├── TimeColumn (8am-10pm)
│   │   ├── DayColumns (Mon-Sat)
│   │   ├── CourseBlocks (color-coded by campus)
│   │   └── ConflictIndicators
│   ├── OnlineCourseSidebar
│   └── ScheduleStats (credits, conflicts)
│
├── BrowsePage
│   ├── SearchBar (instant filter)
│   ├── FilterPanel (subject, level, credits, core codes, etc.)
│   ├── CourseGrid (cards)
│   │   └── CourseCard
│   │       ├── CourseHeader (code, title, credits)
│   │       ├── SectionList (expandable)
│   │       └── QuickActions (add to schedule, favorite)
│   └── Pagination / InfiniteScroll
│
└── SettingsPage
    ├── CampusPreference
    ├── ThemeToggle (light/dark)
    ├── ChatPositionPreference
    ├── CompletedCourses (list management)
    └── AccountSection (logged-in only)
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Next.js    │────▶│    Mastra    │
│  (Cedar OS)  │◀────│   API Routes │◀────│    Agent     │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │
       │                    ▼
       │             ┌──────────────┐
       │             │   Supabase   │
       │             │  (DB + Auth) │
       │             └──────────────┘
       │
       ▼
┌──────────────┐
│ localStorage │ (anonymous schedule state)
└──────────────┘
```

---

## Pages & Navigation

### Navigation Structure

Minimal page structure with three main routes:

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Schedule grid + chat interface |
| `/browse` | Browse Courses | Course search and filtering |
| `/settings` | Settings | Preferences, completed courses, account |

### Header Components

1. **Logo/Name**: Application branding (name TBD)
2. **Nav Links**: Home, Browse, Settings
3. **Term Selector**: Dropdown to switch between available terms (e.g., "Spring 2026", "Fall 2026")
4. **Schedule Selector**: (logged-in only) Dropdown to switch between saved schedules
5. **Auth Button**: "Sign In" or user avatar with dropdown menu

### First Visit Experience

- User lands directly in the app (no marketing landing page)
- Schedule grid is empty
- Chat modal is open by default with welcome message and starter prompts
- Brief hybrid welcome: small banner explaining the app, dismissible

---

## Schedule Grid

### Grid Specifications

| Property | Value |
|----------|-------|
| Time Range | 8:00 AM - 10:00 PM |
| Days | Monday, Tuesday, Wednesday, Thursday, Friday, Saturday |
| Time Increments | 30-minute slots |
| Sunday | Not displayed |

### Course Block Colors (by Campus)

| Campus | Color | Hex (suggested) |
|--------|-------|-----------------|
| Busch | Blue | `#3B82F6` |
| Livingston | Orange | `#F97316` |
| College Avenue | Yellow | `#EAB308` |
| Cook/Douglass | Green | `#22C55E` |
| Downtown NB | Purple | `#A855F7` |
| Online | Gray | `#6B7280` |
| Newark | Teal | `#14B8A6` |
| Camden | Pink | `#EC4899` |

### Course Block Display

Each block shows:
- Course code (e.g., "CS 111")
- Section number
- Building + Room (e.g., "HLL 116")
- Instructor name (if space permits)

### Time Overflow Handling

If a class falls outside 8am-10pm:
- Grid maintains 8am-10pm boundaries
- Course block is clipped at boundary
- Tooltip shows full time range
- Visual indicator (e.g., gradient fade, arrow) shows overflow direction

### Online/Asynchronous Courses

- Displayed in a sidebar list titled "Online Courses"
- Positioned to the right of the schedule grid
- Shows: Course code, title, credits, instructor
- Can be collapsed/expanded

### Conflict Visualization

- Overlapping blocks shown with striped pattern or split view
- Red border on conflicting courses
- Conflict badge showing overlap time

### AI Schedule Modifications

When AI proposes adding/removing sections:
1. **Preview State**: Proposed sections appear as "ghost blocks" (semi-transparent, dashed border)
2. **Action Bar**: Floating bar appears with "Apply Changes" / "Cancel" buttons
3. **On Apply**: Ghost blocks become solid, schedule updates
4. **On Cancel**: Ghost blocks disappear

---

## Course Browser

### Search Behavior

- **Instant filter**: Results update as user types (300ms debounce)
- **Search fields**: Course title, course code, instructor name
- Full-text search powered by Supabase/PostgreSQL

### Filter Panel

| Filter | Type | Options |
|--------|------|---------|
| Subject | Dropdown/Autocomplete | All subjects from `browseMetadata` |
| Level | Checkbox | Undergraduate, Graduate |
| Credits | Range slider | 0-6+ |
| Core Codes | Multi-select | QQ, NS, HST, etc. |
| Open Sections Only | Toggle | Yes/No |
| Days | Multi-select | M, T, W, H, F, S |
| Time Range | Range selector | Start time - End time |

### Results Display

**Card Grid Layout**:
- 2-3 columns depending on viewport
- Each card shows:
  - Course string + title
  - Credits
  - Open/Closed status badge
  - Number of open sections / total sections
  - Core codes (as small badges)
  - "Add to Schedule" button (if sections available)

### Section Display (Expanded Card)

When a course card is expanded, show ALL section details:

| Field | Display |
|-------|---------|
| Index Number | 5-digit code (prominent) |
| Section Number | e.g., "01", "02" |
| Status | OPEN (green) / CLOSED (red) |
| Days/Times | e.g., "M/W 10:20 AM - 11:40 AM" |
| Location | Building + Room + Campus |
| Instructor | Full name |
| Section Type | Traditional / Hybrid / Online badge |
| Restrictions | [REQUIRES SPN], [MAJORS ONLY: CS] badges |
| Session Dates | (Summer/Winter only) Prominent date range |
| Special Notes | Any section comments |

### Quick Actions

- **Add to Schedule**: Opens section selector if multiple sections, or adds directly
- **Favorite**: Heart icon to save course (logged-in only)
- **Mark Completed**: Checkbox to add to completed courses

---

## AI Chat Interface

### Position Modes

Users can switch between two modes:

1. **Floating Modal**: 
   - Floating button in bottom-right corner
   - Expands to modal overlay (400-500px wide)
   - Can be minimized back to button

2. **Side Panel**:
   - Docked to right side of screen
   - Takes ~350-400px width
   - Main content adjusts/compresses

### Default State

- **First visit**: Floating modal, **open**
- **Returning users**: Remembers last preference (position + open/closed state)

### Chat Components

```
┌─────────────────────────────────────┐
│ [⚙️] Chat Assistant    [◧ ▢] [✕]   │  ← Mode toggle, minimize, close
├─────────────────────────────────────┤
│                                     │
│  Welcome! I can help you find       │
│  courses and build your schedule.   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🔍 Find CS courses          │   │  ← Starter prompts
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ 📅 Check my schedule        │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ ✓ What prereqs do I need?   │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│ [Type a message...]          [Send] │
└─────────────────────────────────────┘
```

### Starter Prompts

**Initial (no schedule data)**:
- "Find CS courses for Spring 2026"
- "Show me QQ core courses"
- "What Math classes are open?"

**Contextual (has schedule data)**:
- "Check my schedule for conflicts"
- "Find alternatives for [closed section]"
- "What are the prereqs for [course in schedule]?"
- "Add another 3-credit course on Tuesdays"

### AI Context Awareness

The AI **always** has access to:
- Current schedule state (all sections)
- User's completed courses (if set)
- Current term/campus preferences
- Conversation history

This context is injected into every message automatically.

### AI Response Behavior

- **Never speaks first**: AI only responds to user messages
- **Streaming responses**: Text appears word-by-word as generated
- **Action proposals**: When AI suggests schedule changes, they appear as preview blocks on the grid

### Cedar OS Integration

```tsx
<CedarCopilot
  llmProvider={{
    provider: 'mastra',
    baseURL: process.env.NEXT_PUBLIC_MASTRA_URL,
    agentId: 'socAgent',
  }}
>
  {/* App content */}
</CedarCopilot>
```

---

## Authentication & User Data

### Auth Provider

**Supabase Auth** with:
- Email/password registration
- Google OAuth
- Magic link (optional, for passwordless)

### Anonymous vs Authenticated

| Feature | Anonymous | Logged In |
|---------|-----------|-----------|
| Browse courses | ✅ | ✅ |
| Build schedule | ✅ (localStorage) | ✅ (database) |
| Chat with AI | ✅ | ✅ |
| Export schedule | ✅ | ✅ |
| Save multiple schedules | ❌ | ✅ |
| Favorite courses | ❌ | ✅ |
| Track completed courses | ❌ | ✅ |
| Persist preferences | ❌ | ✅ |
| Chat history | Session only | ✅ Persisted |

### Login Transition

When anonymous user logs in:
1. Check if localStorage has schedule data
2. **Auto-merge**: Save localStorage schedule to account as "Imported Schedule"
3. Clear localStorage schedule data
4. Load user's account data

### User Data Schema (Supabase)

```sql
-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  default_campus VARCHAR(10) DEFAULT 'NB',
  default_term VARCHAR(2),
  theme VARCHAR(10) DEFAULT 'system',
  chat_position VARCHAR(10) DEFAULT 'floating',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved schedules
CREATE TABLE user_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  term_year INTEGER NOT NULL,
  term_code VARCHAR(2) NOT NULL,
  campus VARCHAR(10) NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Favorite courses
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_string VARCHAR(20) NOT NULL,
  term_year INTEGER,
  term_code VARCHAR(2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_string, term_year, term_code)
);

-- Completed courses
CREATE TABLE user_completed_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_string VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_string)
);

-- Chat history
CREATE TABLE user_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## State Management

### Client State (Zustand)

```typescript
interface ScheduleState {
  // Current schedule
  sections: Section[];
  addSection: (section: Section) => void;
  removeSection: (indexNumber: string) => void;
  
  // Preview state (AI proposals)
  previewSections: Section[];
  setPreviewSections: (sections: Section[]) => void;
  applyPreview: () => void;
  clearPreview: () => void;
  
  // Conflicts
  conflicts: Conflict[];
  
  // Persistence
  syncToLocalStorage: () => void;
  loadFromLocalStorage: () => void;
  syncToDatabase: () => Promise<void>;
}

interface UserState {
  user: User | null;
  preferences: UserPreferences;
  completedCourses: string[];
  schedules: SavedSchedule[];
  activeScheduleId: string | null;
}

interface UIState {
  chatPosition: 'floating' | 'side';
  chatOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  currentTerm: { year: number; term: string };
}
```

### localStorage Schema

```typescript
// Key: 'rutgers-soc-schedule'
interface LocalStorageSchedule {
  version: number;
  sections: Array<{
    indexNumber: string;
    courseString: string;
    // ... minimal section data for display
  }>;
  lastUpdated: string; // ISO timestamp
}

// Key: 'rutgers-soc-preferences'
interface LocalStoragePreferences {
  campus: string;
  theme: 'light' | 'dark' | 'system';
  chatPosition: 'floating' | 'side';
  chatOpen: boolean;
}
```

---

## Real-time Updates

### Data Freshness

- Display "Updated X ago" indicator near schedule/search results
- Background refetch every 2-3 minutes when tab is active
- Visual highlight on courses that changed status since last view

### Section Status Changes

When a section in user's schedule changes status (open → closed or vice versa):

1. **Visual Change**: 
   - Section block on grid turns red with strikethrough if closed
   - "CLOSED" badge appears
   
2. **Toast Notification**:
   - "Section 09214 (CS 111) is now CLOSED"
   - Action button: "Find alternatives"

### Future: Supabase Realtime (Deferred)

```typescript
// Future implementation
supabase
  .channel('section-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'sections',
    filter: `index_number=in.(${userSectionIndices.join(',')})`,
  }, (payload) => {
    // Handle real-time status change
  })
  .subscribe();
```

---

## Export & Sharing

### Export Options

| Format | Description | Implementation |
|--------|-------------|----------------|
| **Index List** | Plain text list of 5-digit index numbers | Copy to clipboard |
| **Image** | PNG screenshot of schedule grid | html2canvas or similar |
| **Share Link** | URL that loads schedule view | Encoded in URL params or short link |

### Index List Export

```
Schedule for Spring 2026
========================
09214  01:198:111  INTRO COMPUTER SCI
12345  01:640:151  CALCULUS I
67890  01:355:101  EXPOSITORY WRITING I

Copy these index numbers to WebReg.
```

**One-click copy button** for just the index numbers:
```
09214
12345
67890
```

### Image Export

- Captures the schedule grid as PNG
- Includes:
  - Term/year header
  - Full grid with course blocks
  - Online courses sidebar
  - Total credits footer
- Excludes: Navigation, chat interface

### Share Link

- Generate shareable URL: `/share/[encoded-schedule-id]`
- Recipients see:
  - Read-only schedule grid
  - Course details on click
  - "Copy to My Schedules" button (creates clone)
- No login required to view

### WebReg Integration

- **Copy Button**: Copies all index numbers to clipboard
- **WebReg Link**: Button that opens `https://sims.rutgers.edu/webreg/` in new tab
- No direct API integration (WebReg doesn't support it)

---

## Visual Design

### Design Philosophy

**Award-winning, modern design** characterized by:
- Clean, generous whitespace
- Subtle shadows and depth
- Smooth micro-animations
- Intuitive visual hierarchy
- Accessible color contrast
- Cohesive design system

### Color Palette

**Primary**: Neutral with accent
- Background: `#FFFFFF` (light) / `#0F0F0F` (dark)
- Surface: `#F9FAFB` (light) / `#1A1A1A` (dark)
- Border: `#E5E7EB` (light) / `#2D2D2D` (dark)
- Text Primary: `#111827` (light) / `#F9FAFB` (dark)
- Text Secondary: `#6B7280`
- Accent: `#3B82F6` (blue) - for interactive elements

**Status Colors**:
- Open: `#22C55E` (green)
- Closed: `#EF4444` (red)
- Warning: `#F59E0B` (amber)
- Info: `#3B82F6` (blue)

### Typography

- **Font Family**: Inter (or system font stack)
- **Headings**: Semi-bold, tight letter-spacing
- **Body**: Regular weight, comfortable line-height (1.5-1.6)
- **Monospace**: JetBrains Mono (for course codes, index numbers)

### Dark Mode

- Follows system preference by default
- Manual toggle in header and settings
- Preference persisted in localStorage/database
- All components support both modes

### Animations

- **Page transitions**: Subtle fade
- **Chat open/close**: Smooth slide + fade (200-300ms)
- **Schedule blocks**: Gentle scale on hover
- **Ghost blocks**: Pulsing opacity animation
- **Toasts**: Slide in from top-right
- **Loading**: Skeleton shimmer or spinner

### Spacing System

Based on 4px grid:
- `xs`: 4px
- `sm`: 8px
- `md`: 16px
- `lg`: 24px
- `xl`: 32px
- `2xl`: 48px

---

## Responsive Design

### Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| Mobile | < 640px | Single column, day tabs for grid |
| Tablet | 640-1024px | Two column, compact grid |
| Desktop | > 1024px | Full layout, side panel chat option |

### Schedule Grid (Mobile)

- **Horizontal scroll**: Full grid rendered, swipe to see all days
- Touch-friendly: Larger tap targets on course blocks
- Pinch-to-zoom support (optional)

### Course Browser (Mobile)

- Single column card layout
- Sticky search bar at top
- Filter panel in slide-out drawer
- Bottom sheet for course details

### Chat Interface (Mobile)

- Always floating modal (side panel disabled)
- Full-screen when expanded
- Keyboard-aware input positioning

---

## Error Handling

### Error Display Strategy

**Inline errors**: Error messages appear where content would be displayed

Examples:
- Search results area: "Failed to load courses. Please try again."
- Schedule grid: "Unable to load your schedule."
- Chat: "Message failed to send. [Retry]"

### Error States

| Scenario | Display |
|----------|---------|
| Network error | Inline message with retry button |
| API error | Inline message with error details |
| Not found | Helpful empty state with suggestions |
| Auth required | Inline prompt to sign in |
| Validation error | Field-level error message |

### Retry Behavior

- Automatic retry: 1 attempt after 2 seconds for network errors
- Manual retry: Button for user-initiated retry
- Exponential backoff for repeated failures

---

## Deferred Features

The following features are planned but will be implemented in future phases:

### Phase 2

1. **Analytics & Tracking**
   - User behavior analytics
   - Feature usage tracking
   - Error monitoring

2. **DB Refresh Infrastructure**
   - Automated course data refresh every 1-2 minutes
   - Status change detection
   - Push notifications for status changes

3. **Advanced Prereq Visualization**
   - Visual prerequisite tree/graph
   - Clickable prereq links
   - Degree audit integration

### Phase 3

1. **Supabase Realtime**
   - WebSocket-based instant updates
   - Live section status changes

2. **Course Notifications**
   - "Notify me when section opens"
   - Email/push notifications

3. **Social Features**
   - Share schedules with friends
   - See friends' schedules
   - Study group suggestions

4. **RateMyProfessor Integration**
   - Instructor ratings display
   - Difficulty scores

---

## Implementation Checklist

### Phase 1: Core MVP

- [ ] Project setup (Next.js + Cedar OS + Tailwind)
- [ ] Supabase configuration (Auth + Database)
- [ ] Layout and navigation components
- [ ] Schedule grid component
  - [ ] Time/day grid rendering
  - [ ] Course block component (campus colors)
  - [ ] Conflict detection and display
  - [ ] Online courses sidebar
- [ ] Course browser
  - [ ] Search with instant filter
  - [ ] Filter panel
  - [ ] Course card grid
  - [ ] Section details expansion
- [ ] AI chat interface
  - [ ] Cedar OS integration with Mastra
  - [ ] Floating modal implementation
  - [ ] Side panel implementation
  - [ ] Position toggle
  - [ ] Starter prompts
  - [ ] Streaming responses
- [ ] Schedule-AI integration
  - [ ] Context injection (schedule state)
  - [ ] Preview/ghost blocks for proposals
  - [ ] Apply/cancel actions
- [ ] State management
  - [ ] Zustand stores setup
  - [ ] localStorage persistence
  - [ ] Database sync (authenticated)
- [ ] Authentication
  - [ ] Supabase Auth setup
  - [ ] Login/signup UI
  - [ ] Session management
  - [ ] Anonymous → authenticated transition
- [ ] User features
  - [ ] Multiple saved schedules
  - [ ] Completed courses list
  - [ ] Favorites
  - [ ] Preferences
- [ ] Export features
  - [ ] Index list copy
  - [ ] Image export
  - [ ] Share links
- [ ] Settings page
- [ ] Dark mode
- [ ] Responsive design
- [ ] Error handling

### Deployment

- [ ] Environment variables configuration
- [ ] Vercel deployment setup
- [ ] Production Supabase configuration
- [ ] Domain setup

---

*Last Updated: January 2026*
