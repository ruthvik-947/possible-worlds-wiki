# 🧭 Wiki Design Spec — *“Glass Minimalism”*

## Overview  
This design preserves the airiness of traditional wikis while introducing quiet richness and contemporary polish. It uses a restrained palette, subtle animation, soft typography, and structured layout to support sustained reading and contextual navigation.

---

## 🎨 Colour Palette

| Purpose              | Colour     | Notes                                  |
|----------------------|------------|----------------------------------------|
| Background           | `#FAF8F5`  | Paper-like off-white, low strain       |
| Primary Text         | `#1E3A3F`  | Deep teal-gris                         |
| Accent (links)       | `#5FAFDA`  | Soft glass-blue, used for active links |
| Sidebar / Metadata   | `#6B7C76`  | Muted olive-grey for secondary text    |
| Highlight / Warning  | `#D59F55`  | Soft amber (notes, last edited, etc.)  |
| Dividers             | `#E4E0DA`  | Warm greys for low-contrast rules      |

---

## 🧠 Typography

| Element        | Font                        | Style & Use                                                  |
|----------------|-----------------------------|---------------------------------------------------------------|
| Headers (H1–H3)| **Cormorant Garamond** or **Tiempos** | Serif, elegant, medium weight, slight letterspacing     |
| Body Text      | **Inter** or **Atkinson Hyperlegible** | Sans-serif, neutral, spacious (line-height: 1.6)        |
| Code / Metadata| **IBM Plex Mono**           | Monospace, rounded terminals, warm grey colour                |
| Font Sizes     | `H1: 2.5rem`, `H2: 1.75rem`, `Body: 1.125rem` |

---

## 🧱 Layout

### Desktop (max-width: 1280px)

- **Two-column layout**:
  - Left sidebar (280px): TOC, related links, notes  
  - Main content (flex): article body with section anchors  

- **Title block**:
  - Centered H1, soft divider below, optional summary line  

- **Navigation Bar**:
  - Top-fixed, dark teal (`#1E3A3F`), with:
    - Left: Logo  
    - Centre: Search bar (rounded, glassy hover)  
    - Right: Menu (theme toggle, etc.)  

---

## 📐 Spacing & Grid

- Base grid: **8px system**  
- Margin between sections: **32–48px**  
- Article padding: **max-width 720px**, centred  
- Sidebar fixed to top for persistent context  

---

## 🔍 UI Interactions

| Element        | Behaviour                                                                  |
|----------------|----------------------------------------------------------------------------|
| Sidebar items  | Fade in on hover; expandable sub-items                                     |
| Links          | Light underline on hover, glass-blue highlight                             |
| Backlinks      | Ghosted until scrolled into view; fade-in                                  |
| Annotations    | Tap to reveal “glass panel” overlay with info (uses `backdrop-filter`)     |
| Page transition| Gentle fade-in for body content on load                                    |

---

## 🪟 Optional Enhancements

| Light Dark Mode     | Use same base hues with adjusted contrast (desaturate amber/blue)       |

---

## 🛠 Tech Stack Recommendations

- **CSS**: Tailwind (with custom theme) or vanilla CSS with utility classes  
- **Animations**: Framer Motion or native CSS transitions  
- **Search**: Algolia, Meilisearch, or custom lightweight fuzzy search  
- **CMS (optional)**: Sanity, Netlify CMS, or Markdown via static generation  
