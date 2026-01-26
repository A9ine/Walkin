# BubbleTea Walk-In System 🧋

A mobile app for restaurant kitchen staff to digitize recipe cards using OCR and AI, automatically linking ingredients to POS inventory systems.

## 📱 What This App Does

- **Snap & Import**: Take a photo of recipe cards, PDFs, or handwritten notes
- **AI Processing**: Automatically extract ingredients and quantities using Claude AI
- **Smart Matching**: Links ingredients to your POS system inventory
- **Recipe Management**: Edit, organize, and manage all your restaurant recipes
- **Menu Integration**: Connects recipes to menu items from your POS

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Xcode** (for iOS development) - Required for Mac users
- **iOS Simulator** or physical iPhone

### Installation

1. **Clone the repository**
   ```bash
   cd /path/to/your/projects
   git clone <your-repo-url>
   cd BubbleTea
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Launch on iOS Simulator**


   ```bash
   npm start
   ```
   Then press `Shift + I` to choose your simulator

---

## 📂 Project Structure

```
BubbleTea/
├── app/                          # App screens (file-based routing)
│   ├── (tabs)/                   # Main tab screens
│   │   ├── inbox.tsx            # Recipe queue & review
│   │   ├── import.tsx           # Camera & upload
│   │   ├── menu.tsx             # POS menu items
│   │   ├── text-import.tsx      # Manual text entry
│   │   └── settings.tsx         # Settings & sync
│   ├── menu-item-detail.tsx    # Recipe editor screen
│   └── _layout.tsx              # Root layout
├── components/                   # Reusable UI components
│   ├── TopBar.tsx               # App header
│   └── ui/                      # UI primitives
├── database/                     # SQLite database layer
│   ├── db.service.ts            # Database connection
│   ├── schema.ts                # Database schema
│   └── repositories/            # Data access layer
├── hooks/                        # React hooks
│   └── database/                # Database hooks
├── services/                     # External API services
│   ├── ocr/                     # OCR services (Google Vision, Tesseract)
│   └── recipe-parser/           # Claude AI parser
├── types/                        # TypeScript type definitions
├── utils/                        # Utility functions
│   └── validation/              # Validation logic
└── config/                       # Configuration files
```

---

## 🗄️ Database

The app uses **SQLite** (currently for testing) (via expo-sqlite) for local storage.

### Database Features
- Recipes with ingredients and metadata
- POS menu items and ingredient catalog
- Automatic fuzzy matching for recipe-to-menu linking
- Issue tracking for recipe validation

### Auto-initialization
The database is automatically created and seeded with sample data on first launch.

**See [DATABASE.md](DATABASE.md) for full schema documentation.**

---

## ✨ Features

### Current Features (Working)

#### 📥 Inbox Tab
- Recipe queue with status filters (All/Ready/Review)
- Confidence indicators (high/medium/low)
- Auto-refresh when returning to screen
- Recipe validation and issue detection

#### 📸 Import Tab
- **Camera Integration**: Take photos or select from gallery
- **Manual Text Entry**: Type recipes directly
- Auto-linking to POS menu items
- Ingredient autocomplete with fuzzy matching
- Create new ingredients on-the-fly

#### 📋 Menu Tab
- POS menu items list
- Recipe mapping status
- Edit/create recipes for menu items
- Auto-sync with recipe changes

#### ⚙️ Settings Tab
- Location management
- POS connection status
- Sync functionality

### Recipe Editor Features
- Beautiful, modern UI design
- Ingredient autocomplete from inventory
- Create new ingredients inline
- Visual feedback for matched ingredients
- Delete recipes or entire menu items

---

## 🎯 Key Workflows

### 1. Import Recipe via Text Entry

1. Go to **Import** tab
2. Tap **"Enter Text"**
3. Type your recipe in this format:
   ```
   Recipe Name: Chocolate Chip Cookie

   Ingredients:
   - 2 cups flour
   - 1 cup sugar
   - 0.5 cup butter
   - 2 eggs
   ```
4. Ingredients will auto-match to inventory as you type
5. Tap **"Create new ingredient"** for items not in inventory
6. Save recipe

### 2. Edit Menu Item Recipe

1. Go to **Menu** tab
2. Tap any menu item
3. Edit recipe name
4. Add/remove ingredients
5. Adjust quantities
6. Save changes

### 3. Delete Menu Item

1. Go to **Menu** tab
2. Tap any menu item
3. Tap trash icon in header
4. Confirm deletion

---

## 🔧 Development Commands

```bash
# Start development server
npm start

# Run on iOS (iPhone 17 Pro)
npm run ios:17

# Run on iOS (default simulator)
npm run ios

# Run on Android
npm run android

# Run on Web
npm run web

# Lint code
npm run lint
```

---

## 🔑 Environment Setup (Optional)

For AI-powered OCR and parsing features, you'll need API keys:

1. **Copy the example environment file**
   ```bash
   cp .env.example .env
   ```

2. **Add your API keys to `.env`**
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_CLOUD_VISION_API_KEY=...
   SQUARE_ACCESS_TOKEN=...
   ```

3. **Get API Keys**
   - **Anthropic (Claude AI)**: https://console.anthropic.com/
   - **Google Cloud Vision**: https://console.cloud.google.com/
   - **Square POS**: https://developer.squareup.com/

**See [API_SETUP.md](API_SETUP.md) for detailed API configuration.**


## 🎨 Tech Stack

- **Framework**: React Native with Expo
- **Routing**: Expo Router (file-based)
- **Database**: SQLite (expo-sqlite)
- **Language**: TypeScript
- **AI**: Claude API (Anthropic)
- **OCR**: Google Cloud Vision API
- **State**: React Hooks
- **UI**: React Native primitives + custom components
