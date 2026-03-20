# Tabs and Traffic Split Implementation

## Overview
Updated DragonDesk: Optimize to use tabs for Variant A and Variant B with traffic split functionality, providing a cleaner interface for managing A/B tests.

## Key Features

### 1. Tab-Based Interface
- **Separate Tabs** - Variant A and Variant B are now in separate tabs instead of side-by-side
- **Tab Badges** - Each tab shows the number of changes made to that variant
- **Active Tab Indicator** - Visual highlighting shows which variant is currently being edited
- **Circular Icons** - Tabs display "A" and "B" icons with red highlight on active tab

### 2. Traffic Split Control
- **Visual Slider** - Interactive slider to adjust traffic split between variants
- **Real-time Updates** - Percentages update as slider is moved
- **Split Labels** - Shows both variant A and B percentages (must total 100%)
- **Default 50/50 Split** - Tests default to equal traffic distribution
- **Stored in Database** - Traffic split is persisted with each test

### 3. UI Improvements
- **Cleaner Layout** - Single variant editor view at a time reduces visual clutter
- **Better Focus** - User can concentrate on one variant without distraction
- **Change Counter** - Each tab badge shows number of changes made
- **Traffic Split Display** - List view shows traffic split for each test

## Files Modified

### Frontend
1. **DragonDeskOptimize.tsx**
   - Added `activeTab` state for tab management
   - Added `trafficSplit` to formData (default: 50)
   - Implemented tab switching functionality
   - Added traffic split slider with real-time percentage display
   - Updated card display to show traffic split

2. **DragonDeskOptimize.module.css**
   - Added `.tabsContainer` and `.tabs` styling
   - Styled `.tab`, `.activeTab`, `.tabIcon`, `.tabBadge`
   - Added `.tabContent` for variant editor container
   - Created `.trafficSplitContainer` with slider styles
   - Styled `.slider` with custom thumb and gradient background
   - Added `.trafficSplitLabels`, `.variantLetter`, `.percentage`

### Backend
1. **database.ts**
   - Added `trafficSplit INTEGER DEFAULT 50` to ab_tests table
   - Created migration to add column to existing databases

2. **abtests.ts (routes)**
   - Updated POST route to accept and store `trafficSplit`
   - Updated PUT route to handle `trafficSplit` updates

## Database Changes

Added `trafficSplit` column to `ab_tests` table:
```sql
ALTER TABLE ab_tests ADD COLUMN trafficSplit INTEGER DEFAULT 50
```

Schema now includes:
- `trafficSplit` - Integer from 0-100 representing percentage for Variant A
- Variant B automatically receives the remaining percentage (100 - trafficSplit)

## Usage

### Creating/Editing an A/B Test
1. **Enter test details** in the sidebar (name, URL, audience)
2. **Adjust traffic split** using the slider
   - Drag slider left/right to change split
   - Variant A percentage shown on left
   - Variant B percentage shown on right
3. **Switch between tabs** to edit each variant
   - Click "Variant A (Control)" tab
   - Click "Variant B (Test)" tab
4. **Make changes** to the selected variant in the visual editor
5. **Save the test** - All changes and traffic split are saved

### Viewing Tests
The list view now displays:
- Page URL being tested
- Target audience
- **Traffic Split** (e.g., "A: 70% / B: 30%")
- Number of changes for each variant

## Technical Details

### Tab State Management
```typescript
const [activeTab, setActiveTab] = useState<'variantA' | 'variantB'>('variantA');
```

### Traffic Split State
```typescript
trafficSplit: 50  // Integer from 0-100
```

### Conditional Rendering
Only the active tab's VisualPageEditor is rendered:
```typescript
{activeTab === 'variantA' && (
  <VisualPageEditor ... />
)}
{activeTab === 'variantB' && (
  <VisualPageEditor ... />
)}
```

## UI Components

### Tab Structure
- **Tab Container** - Houses both tabs
- **Tab Button** - Clickable button to switch variants
- **Tab Icon** - Circular badge with "A" or "B"
- **Tab Label** - "Variant A (Control)" or "Variant B (Test)"
- **Tab Badge** - Shows change count (e.g., "3 changes")

### Traffic Split Slider
- **Range Input** - HTML5 range slider (0-100)
- **Visual Gradient** - Red for Variant A portion, grey for Variant B
- **Custom Thumb** - Red circular handle with border
- **Label Cards** - Two cards showing A/B percentages with circular icons

## Benefits

1. **Cleaner Interface** - Less visual clutter with single variant view
2. **Better UX** - Easier to focus on one variant at a time
3. **Traffic Control** - Fine-grained control over traffic distribution
4. **Professional Look** - Modern tab interface matches industry standards
5. **Scalability** - Easy to add more variants in future if needed

## Future Enhancements

Possible improvements:
- Multi-variant testing (A/B/C/D)
- Auto-allocate traffic based on performance
- Schedule traffic split changes
- Traffic split history and timeline
- Recommended splits based on statistical significance
